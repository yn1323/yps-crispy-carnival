import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { isPastShiftPeriod } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { sha256Hex } from "../_lib/sha256";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { normalizeEmail } from "../_lib/validation";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import { NOTIFICATION_FANOUT_SCOPE_LIMIT, SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import {
  buildConfirmationSnapshotsForStaffs,
  confirmationSnapshotMatchesAssignments,
} from "../notification/confirmationSnapshots";
import { buildNotificationFanoutTargetKey, ensureNotificationFanoutOperation } from "../notification/fanout";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { ensureDefaultPosition } from "../position/service";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { getActiveStaffInShop, isShiftTargetStaff } from "../staff/service";
import { buildAssignmentIssue, SHIFT_ASSIGNMENT_VALIDATION, validateShiftAssignments } from "./validation";

const PAST_SHIFT_SAVE_ERROR = "過去のシフトは保存できません。";
const PAST_SHIFT_NOTIFY_ERROR = "過去のシフトはスタッフに通知できません。";
const PREVIOUS_CONFIRMATION_NOTIFICATION_PROCESSING_ERROR =
  "前回の確定シフト通知を送信中です。\n少し時間をおいて、もう一度お試しください。";
const SHIFT_CONFIRMATION_OPERATION_VERSION = 1;

type PreviousConfirmationDeliveryState = "delivered" | "queued" | "undelivered" | "processing";

function belongsToConfirmationOperation(
  outbox: Doc<"notificationOutbox"> | null,
  operation: Doc<"notificationFanoutOperations">,
  staffId: Id<"staffs">,
) {
  return (
    outbox?.fanoutOperationId === operation._id &&
    outbox.recruitmentId === operation.recruitmentId &&
    outbox.shopId === operation.shopId &&
    outbox.staffId === staffId
  );
}

async function getPreviousConfirmationDeliveryState(
  ctx: MutationCtx,
  operation: Doc<"notificationFanoutOperations">,
  staffId: Id<"staffs">,
): Promise<PreviousConfirmationDeliveryState> {
  const emailDedupeKey = `email:confirmation:${operation.recruitmentId}:${staffId}:${operation.dedupeSuffix}`;
  const [primaryOutbox, sentEmail, processingEmail, pendingEmail] = await Promise.all([
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_fanoutTargetKey", (q) =>
        q.eq("fanoutTargetKey", buildNotificationFanoutTargetKey(operation.operationKey, staffId)),
      )
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "sent"))
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "processing"))
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "pending"))
      .first(),
  ]);
  const primaryStatus = belongsToConfirmationOperation(primaryOutbox, operation, staffId)
    ? primaryOutbox?.status
    : undefined;
  if (primaryStatus === "sent" || belongsToConfirmationOperation(sentEmail, operation, staffId)) {
    return "delivered";
  }
  if (primaryStatus === "processing" || belongsToConfirmationOperation(processingEmail, operation, staffId)) {
    return "processing";
  }
  if (primaryStatus === "pending" || belongsToConfirmationOperation(pendingEmail, operation, staffId)) {
    return "queued";
  }
  return "undelivered";
}

async function getUndeliveredPreviousConfirmationStaffIds(
  ctx: MutationCtx,
  args: {
    operationKey?: string;
    recruitmentId: Id<"recruitments">;
    shopId: Id<"shops">;
    staffIds: readonly Id<"staffs">[];
  },
) {
  const operationKey = args.operationKey;
  if (!operationKey) {
    return {
      undeliveredStaffIds: new Set<Id<"staffs">>(),
      queuedStaffIds: new Set<Id<"staffs">>(),
    };
  }
  const operation = await ctx.db
    .query("notificationFanoutOperations")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
    .unique();
  if (
    operation?.kind !== "confirmation" ||
    operation.recruitmentId !== args.recruitmentId ||
    operation.shopId !== args.shopId ||
    operation.supersedesActiveOperations === false
  ) {
    return {
      undeliveredStaffIds: new Set<Id<"staffs">>(),
      queuedStaffIds: new Set<Id<"staffs">>(),
    };
  }

  const operationStaffIds = new Set(operation.targetStaffIds);
  const deliveryStates = await Promise.all(
    args.staffIds.flatMap((staffId) =>
      operationStaffIds.has(staffId)
        ? [getPreviousConfirmationDeliveryState(ctx, operation, staffId).then((state) => ({ staffId, state }))]
        : [],
    ),
  );
  if (deliveryStates.some(({ state }) => state === "processing")) {
    throw new ConvexError(PREVIOUS_CONFIRMATION_NOTIFICATION_PROCESSING_ERROR);
  }
  return {
    undeliveredStaffIds: new Set(
      deliveryStates.flatMap(({ staffId, state }) => (state === "undelivered" || state === "queued" ? [staffId] : [])),
    ),
    queuedStaffIds: new Set(deliveryStates.flatMap(({ staffId, state }) => (state === "queued" ? [staffId] : []))),
  };
}

async function buildConfirmationNotificationOperationKey(args: {
  organizationId?: string;
  shopId: string;
  shopName: string;
  recruitmentId: string;
  periodStart: string;
  periodEnd: string;
  purpose: "confirm" | "resend";
  recipients: Array<{ staffId: string; name: string; email: string; snapshotSignature: string }>;
}) {
  const semanticInput = JSON.stringify({
    version: SHIFT_CONFIRMATION_OPERATION_VERSION,
    organizationId: args.organizationId ?? null,
    shopId: args.shopId,
    shopName: args.shopName,
    recipient: {
      kind: "recruitment",
      recruitmentId: args.recruitmentId,
      staffs: [...args.recipients].sort((a, b) => a.staffId.localeCompare(b.staffId)),
    },
    purpose: `shift.confirmation.${args.purpose}`,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });
  return await sha256Hex(semanticInput);
}

async function scheduleSupplementalConfirmationResends(
  ctx: MutationCtx,
  args: {
    recruitment: Doc<"recruitments">;
    shopId: Id<"shops">;
    targetStaffIds: readonly Id<"staffs">[];
  },
) {
  const activeOperations = (
    await Promise.all(
      (["pending", "processing"] as const).map((status) =>
        ctx.db
          .query("notificationFanoutOperations")
          .withIndex("by_recruitmentId_status", (q) => q.eq("recruitmentId", args.recruitment._id).eq("status", status))
          .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1),
      ),
    )
  ).flat();
  if (activeOperations.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
    throw new Error("Notification fanout scope exceeds the supported limit");
  }
  const activeSupplementalStaffIds = new Set(
    activeOperations.flatMap((operation) =>
      operation.kind === "confirmation" &&
      operation.supersedesActiveOperations === false &&
      operation.confirmationOperationKeyAtOrigin ===
        (args.recruitment.lastConfirmationNotificationOperationKey ?? null) &&
      operation.recruitmentDraftSavedAtAtOrigin === (args.recruitment.draftSavedAt ?? null) &&
      operation.targetStaffIds.length === 1
        ? operation.targetStaffIds
        : [],
    ),
  );
  const operationGroupKey = crypto.randomUUID();
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: args.shopId });
  let scheduledStaffCount = 0;

  for (const staffId of args.targetStaffIds) {
    if (activeSupplementalStaffIds.has(staffId)) continue;
    // 通常の個別再送と同じoperation/dedupe契約を使い、完了済みcanonical operationと共存させる。
    const operationKey = `shift.confirmation.staff-resend:v1:${args.recruitment._id}:${staffId}:${operationGroupKey}`;
    const { operation, created } = await ensureNotificationFanoutOperation(ctx, {
      operationKey,
      kind: "confirmation",
      purpose: "confirmation_resend",
      recruitmentId: args.recruitment._id,
      shopId: args.shopId,
      targetStaffIds: [staffId],
      dedupeSuffix: `staff-resend:${operationGroupKey}`,
      supersedeActiveOperations: false,
      confirmationOperationKeyAtOrigin: args.recruitment.lastConfirmationNotificationOperationKey ?? null,
      recruitmentDraftSavedAtAtOrigin: args.recruitment.draftSavedAt ?? null,
      ...notificationOrigin,
    });
    if (!created) continue;

    const scheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendShiftConfirmationEmails,
      {
        recruitmentId: args.recruitment._id,
        isResend: true,
        fanoutOperationId: operation._id,
        ...notificationOrigin,
      },
    );
    await ctx.db.patch(operation._id, { scheduledFunctionId });
    scheduledStaffCount += 1;
  }
  return scheduledStaffCount;
}

export const saveShiftAssignments = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    assignments: v.array(
      v.object({
        staffId: v.id("staffs"),
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        positionId: v.optional(v.id("positions")),
        optionId: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recruitment = await getActiveRecruitmentInShop(ctx, ctx.shop._id, args.recruitmentId);
    if (!recruitment) {
      throw new ConvexError("Not found");
    }
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      throw new ConvexError(PAST_SHIFT_SAVE_ERROR);
    }
    if (args.assignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new ConvexError("シフト割当が上限を超えています");
    }

    const submissionPattern = recruitment.submissionPattern;
    // 違反は全件収集して構造化エラーで返し、フロントのエラー一覧UIにマップする
    const issues = validateShiftAssignments({
      assignments: args.assignments,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      // TODO[narrow]: 全deploymentでm040が完走し、
      // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
      closedDates: recruitment.shopClosedDates ?? [],
      pattern: submissionPattern,
    });
    if (issues.length > 0) {
      throw new ConvexError({ code: SHIFT_ASSIGNMENT_VALIDATION, issues });
    }
    const uniqueStaffIds = [...new Set(args.assignments.map((a) => a.staffId))];
    const uniquePositionIds = [...new Set(args.assignments.flatMap((a) => (a.positionId ? [a.positionId] : [])))];
    await Promise.all(
      [
        uniqueStaffIds.map(async (staffId) => {
          const staff = await getActiveStaffInShop(ctx, ctx.shop._id, staffId);
          if (!staff) {
            throw new ConvexError("Not found");
          }
        }),
        uniquePositionIds.map(async (positionId) => {
          const position = await ctx.db.get(positionId);
          if (!position || position.isDeleted || position.shopId !== ctx.shop._id) {
            throw new ConvexError("Not found");
          }
        }),
      ].flat(),
    );

    // 削除前に上限超過を検出し、一部だけを置換する状態を作らない。
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT + 1);
    if (existing.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new ConvexError("保存済みシフト割当が上限を超えています");
    }

    const draftSavedAt = Date.now();
    const defaultPositionId = await ensureDefaultPosition(ctx, ctx.shop._id);
    const resolvedAssignments = args.assignments.map((assignment) => ({
      ...assignment,
      positionId: assignment.positionId ?? defaultPositionId,
    }));
    const canonicalAssignments =
      submissionPattern.kind === "time"
        ? normalizeExactAdjacentTimeAssignments(resolvedAssignments)
        : resolvedAssignments;
    if (canonicalAssignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new ConvexError("シフト割当が上限を超えています");
    }

    // シフト表は1募集分をまとめて編集するため、保存時は全置換にしてクライアント状態を正とする。
    // 個別 patch にすると、削除された行や日付移動の扱いが複雑になりやすい。
    await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

    await Promise.all(
      canonicalAssignments.map((assignment) =>
        ctx.db.insert("shiftAssignments", {
          recruitmentId: args.recruitmentId,
          staffId: assignment.staffId,
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          positionId: assignment.positionId,
          ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
        }),
      ),
    );

    await ctx.db.patch(args.recruitmentId, { draftSavedAt });
    return null;
  },
});

export const confirmRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    intent: v.optional(v.union(v.literal("confirm"), v.literal("resend"))),
    requestId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("no_changes"), v.literal("scheduled")),
      notifiedStaffCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const recruitment = await getActiveRecruitmentInShop(ctx, ctx.shop._id, args.recruitmentId);
    if (!recruitment) {
      throw new ConvexError("Not found");
    }
    if (args.requestId !== undefined) {
      // client request IDは入力契約だけ検証し、通知operationのidentityには使わない。
      await toAuditRequestKey(args.requestId);
    }
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      throw new ConvexError(PAST_SHIFT_NOTIFY_ERROR);
    }

    const isResend = recruitment.status === "confirmed";
    const intent = args.intent ?? "confirm";
    if (intent === "resend" && !isResend) {
      throw new ConvexError("確定シフトだけ再送できます");
    }
    if (intent === "confirm" && isResend) {
      return null;
    }

    // TODO[narrow]: 全deploymentでm040が完走し、
    // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
    const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
    const existingAssignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT + 1);
    if (existingAssignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new ConvexError("保存済みシフト割当が上限を超えています");
    }
    const closedDateAssignments =
      shopClosedDateSet.size > 0
        ? existingAssignments.filter((assignment) => shopClosedDateSet.has(assignment.date))
        : [];
    if (closedDateAssignments.length > 0) {
      throw new ConvexError({
        code: SHIFT_ASSIGNMENT_VALIDATION,
        issues: closedDateAssignments.map((assignment) =>
          buildAssignmentIssue("CLOSED_DAY", assignment.date, assignment.staffId),
        ),
      });
    }

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT + 1);
    if (staffs.length > SHIFT_BOARD_STAFF_LIMIT) {
      throw new ConvexError("通知対象が上限を超えています");
    }
    const notificationStaffs = staffs.filter(isShiftTargetStaff);
    const currentSnapshots = buildConfirmationSnapshotsForStaffs(
      notificationStaffs.map((staff) => staff._id),
      existingAssignments.map((assignment) => ({
        staffId: assignment.staffId,
        date: assignment.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        positionId: assignment.positionId,
        ...(assignment.optionId !== undefined ? { optionId: assignment.optionId } : {}),
      })),
      recruitment.submissionPattern.kind === "time",
    );
    // シフトボードで扱うスタッフ上限に合わせ、snapshotも差分判定対象のスタッフ分だけ読む。
    const sentSnapshots = isResend
      ? await Promise.all(
          currentSnapshots.map((snapshot) =>
            ctx.db
              .query("shiftConfirmationSnapshots")
              .withIndex("by_recruitmentId_staffId", (q) =>
                q.eq("recruitmentId", args.recruitmentId).eq("staffId", snapshot.staffId),
              )
              .first(),
          ),
        )
      : [];
    const sentSnapshotByStaffId = new Map(
      sentSnapshots.flatMap((snapshot) => (snapshot ? [[snapshot.staffId, snapshot] as const] : [])),
    );
    const previousOperationKey = recruitment.lastConfirmationNotificationOperationKey;
    const previousDelivery = isResend
      ? await getUndeliveredPreviousConfirmationStaffIds(ctx, {
          ...(previousOperationKey ? { operationKey: previousOperationKey } : {}),
          recruitmentId: args.recruitmentId,
          shopId: ctx.shop._id,
          staffIds: currentSnapshots.map((snapshot) => snapshot.staffId),
        })
      : {
          undeliveredStaffIds: new Set<Id<"staffs">>(),
          queuedStaffIds: new Set<Id<"staffs">>(),
        };

    const snapshotMismatchStaffIds = new Set(
      currentSnapshots.flatMap((snapshot) => {
        const sentSnapshot = sentSnapshotByStaffId.get(snapshot.staffId);
        return !sentSnapshot ||
          !confirmationSnapshotMatchesAssignments(
            sentSnapshot,
            snapshot.assignments,
            recruitment.submissionPattern.kind === "time",
          )
          ? [snapshot.staffId]
          : [];
      }),
    );

    const targetStaffIds = isResend
      ? currentSnapshots
          .filter(
            (snapshot) =>
              snapshotMismatchStaffIds.has(snapshot.staffId) ||
              previousDelivery.undeliveredStaffIds.has(snapshot.staffId),
          )
          .map((snapshot) => snapshot.staffId)
      : currentSnapshots.map((snapshot) => snapshot.staffId);

    if (isResend && targetStaffIds.length === 0) {
      return { status: "no_changes" as const, notifiedStaffCount: 0 };
    }

    const targetStaffIdSet = new Set(targetStaffIds);
    const currentSnapshotByStaffId = new Map(currentSnapshots.map((snapshot) => [snapshot.staffId, snapshot]));
    const operationKey = await buildConfirmationNotificationOperationKey({
      ...(ctx.organization ? { organizationId: String(ctx.organization._id) } : {}),
      shopId: String(ctx.shop._id),
      shopName: ctx.shop.name,
      recruitmentId: String(args.recruitmentId),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      purpose: isResend ? "resend" : "confirm",
      recipients: notificationStaffs
        .filter((staff) => targetStaffIdSet.has(staff._id))
        .map((staff) => ({
          staffId: String(staff._id),
          name: staff.name,
          email: normalizeEmail(staff.email),
          snapshotSignature: currentSnapshotByStaffId.get(staff._id)?.signature ?? "",
        })),
    });
    if (previousOperationKey === operationKey) {
      const previousOperation = await ctx.db
        .query("notificationFanoutOperations")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", previousOperationKey))
        .unique();
      if (previousOperation?.status === "pending" || previousOperation?.status === "processing") {
        return isResend ? { status: "no_changes" as const, notifiedStaffCount: 0 } : null;
      }
      const recoverableTargetStaffIds = targetStaffIds.filter(
        (staffId) => !previousDelivery.queuedStaffIds.has(staffId) || snapshotMismatchStaffIds.has(staffId),
      );
      if (recoverableTargetStaffIds.length === 0) {
        return { status: "no_changes" as const, notifiedStaffCount: 0 };
      }
      const scheduledStaffCount = await scheduleSupplementalConfirmationResends(ctx, {
        recruitment,
        shopId: ctx.shop._id,
        targetStaffIds: recoverableTargetStaffIds,
      });
      return scheduledStaffCount > 0
        ? { status: "scheduled" as const, notifiedStaffCount: scheduledStaffCount }
        : { status: "no_changes" as const, notifiedStaffCount: 0 };
    }
    const notificationRunId = (recruitment.lastConfirmationNotificationRunId ?? 0) + 1;
    if (!Number.isSafeInteger(notificationRunId)) {
      throw new ConvexError("通知処理を開始できません");
    }
    const confirmedAt = Date.now();
    // 再確定も同じ導線で許可する。再通知では前回通知時点から変わったスタッフだけに届ける。
    await ctx.db.patch(args.recruitmentId, {
      status: "confirmed",
      confirmedAt,
      lastConfirmationNotificationOperationKey: operationKey,
      lastConfirmationNotificationRunId: notificationRunId,
    });
    if (ctx.shop.organizationId)
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `cycle:${args.recruitmentId}:confirmed:run:${notificationRunId}`,
        eventType: "cycle.changed",
        occurredAt: confirmedAt,
        organizationId: ctx.shop.organizationId,
        shopId: ctx.shop._id,
        recruitmentId: args.recruitmentId,
        payload: {
          kind: "cycle",
          status: "confirmed",
          createdAt: recruitment._creationTime,
          periodStart: recruitment.periodStart,
          periodEnd: recruitment.periodEnd,
          deadline: recruitment.deadline,
          confirmedAt,
        },
      });
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
    const { operation: fanoutOperation } = await ensureNotificationFanoutOperation(ctx, {
      operationKey,
      kind: "confirmation",
      purpose: isResend ? "confirmation_resend" : "confirmation",
      recruitmentId: args.recruitmentId,
      shopId: ctx.shop._id,
      targetStaffIds,
      dedupeSuffix: isResend ? `resend:${notificationRunId}` : "confirm",
      ...(previousOperationKey ? { previousOperationKey } : {}),
      notificationRunId,
      ...notificationOrigin,
    });

    const fanoutScheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendShiftConfirmationEmails,
      {
        recruitmentId: args.recruitmentId,
        isResend,
        fanoutOperationId: fanoutOperation._id,
        ...notificationOrigin,
        ...(isResend ? { targetStaffIds, notificationRunId } : {}),
      },
    );
    await ctx.db.patch(fanoutOperation._id, { scheduledFunctionId: fanoutScheduledFunctionId });
    return { status: "scheduled" as const, notifiedStaffCount: targetStaffIds.length };
  },
});
