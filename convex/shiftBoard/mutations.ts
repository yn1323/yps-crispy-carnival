import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { isPastShiftPeriod } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { buildConfirmationSnapshotsForStaffs } from "../notification/confirmationSnapshots";
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

type PreviousConfirmationDeliveryState = "delivered" | "undelivered" | "processing";

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
  const [primaryOutbox, sentEmail, processingEmail] = await Promise.all([
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
  if (!operationKey) return new Set<Id<"staffs">>();
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
    return new Set<Id<"staffs">>();
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
  return new Set(deliveryStates.flatMap(({ staffId, state }) => (state === "undelivered" ? [staffId] : [])));
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(semanticInput));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

    const draftSavedAt = Date.now();
    const defaultPositionId = await ensureDefaultPosition(ctx, ctx.shop._id);

    // シフト表は1募集分をまとめて編集するため、保存時は全置換にしてクライアント状態を正とする。
    // 個別 patch にすると、削除された行や日付移動の扱いが複雑になりやすい。
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT);

    await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

    await Promise.all(
      args.assignments.map((assignment) =>
        ctx.db.insert("shiftAssignments", {
          recruitmentId: args.recruitmentId,
          staffId: assignment.staffId,
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          positionId: assignment.positionId ?? defaultPositionId,
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
      throw new ConvexError("確定済みのシフトだけ再送できます");
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
      .take(SHIFT_ASSIGNMENT_LIMIT);
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
        ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
      })),
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
    const undeliveredPreviousStaffIds = isResend
      ? await getUndeliveredPreviousConfirmationStaffIds(ctx, {
          ...(previousOperationKey ? { operationKey: previousOperationKey } : {}),
          recruitmentId: args.recruitmentId,
          shopId: ctx.shop._id,
          staffIds: currentSnapshots.map((snapshot) => snapshot.staffId),
        })
      : new Set<Id<"staffs">>();

    const targetStaffIds = isResend
      ? currentSnapshots
          .filter((snapshot) => {
            const sentSnapshot = sentSnapshotByStaffId.get(snapshot.staffId);
            return (
              !sentSnapshot ||
              sentSnapshot.signature !== snapshot.signature ||
              undeliveredPreviousStaffIds.has(snapshot.staffId)
            );
          })
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
          email: staff.email.trim().toLowerCase(),
          snapshotSignature: currentSnapshotByStaffId.get(staff._id)?.signature ?? "",
        })),
    });
    if (previousOperationKey === operationKey) {
      return isResend ? { status: "no_changes" as const, notifiedStaffCount: 0 } : null;
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
