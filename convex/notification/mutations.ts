import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { staffAccessKindValidator } from "../_lib/staffAccess";
import { generateUUID } from "../_lib/uuid";
import {
  MAGIC_LINK_DEFAULT_TTL_MS,
  NOTIFICATION_FANOUT_BATCH_SIZE,
  NOTIFICATION_FANOUT_PROCESSING_LEASE_MS,
  NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE,
  NOTIFICATION_FANOUT_SCOPE_LIMIT,
} from "../constants";
import { isShiftTargetStaff } from "../staff/service";
import {
  buildConfirmationSnapshotSignature,
  canonicalizeConfirmationSnapshotAssignments,
  confirmationSnapshotAssignmentValidator,
  confirmationSnapshotMatchesAssignments,
  hasValidConfirmationSnapshotSignature,
  normalizeConfirmationSnapshotAssignments,
  upsertConfirmationSnapshotRecord,
} from "./confirmationSnapshots";
import {
  buildNotificationFanoutTargetKey,
  ensureNotificationFanoutOperation,
  isSupplementalConfirmationFanoutStale,
  normalizeNotificationFanoutTargetStaffIds,
} from "./fanout";

/**
 * マジックリンクトークンを生成してDBに保存
 * internalMutation — actions からのみ呼ばれる
 */
export const createMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    accessKind: staffAccessKindValidator,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const [staff, shop, recruitment] = await Promise.all([
      ctx.db.get(args.staffId),
      ctx.db.get(args.shopId),
      ctx.db.get(args.recruitmentId),
    ]);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== args.shopId ||
      !(await isShopParentActive(ctx, shop)) ||
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.shopId !== args.shopId
    ) {
      throw new Error("Inactive notification scope");
    }
    const token = generateUUID();

    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      accessKind: args.accessKind,
      expiresAt: args.expiresAt ?? Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
    });

    return { token };
  },
});

/**
 * submitリンクは通知経路が違っても同じURLを使い回す。
 * 確定シフト閲覧の view リンクはワンタイム制御があるため、この関数では扱わない。
 */
export const getOrCreateSubmitMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const [staff, shop, recruitment] = await Promise.all([
      ctx.db.get(args.staffId),
      ctx.db.get(args.shopId),
      ctx.db.get(args.recruitmentId),
    ]);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== args.shopId ||
      !(await isShopParentActive(ctx, shop)) ||
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.shopId !== args.shopId
    ) {
      throw new Error("Inactive notification scope");
    }
    const existingLinks = await ctx.db
      .query("magicLinks")
      .withIndex("by_staffId_recruitmentId_accessKind", (q) =>
        q.eq("staffId", args.staffId).eq("recruitmentId", args.recruitmentId).eq("accessKind", "submit"),
      )
      .collect();
    const existing = existingLinks.find((link) => !link.revokedAt);

    if (existing) {
      if (existing.expiresAt !== args.expiresAt) {
        await ctx.db.patch(existing._id, { expiresAt: args.expiresAt });
      }
      return { token: existing.token };
    }

    const token = generateUUID();

    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      accessKind: "submit",
      expiresAt: args.expiresAt,
    });

    return { token };
  },
});

/**
 * resumable fanoutのbatch再実行では、同じsemantic operation向けのview linkを再利用する。
 * operationをまたぐ再送は別tokenを発行し、view linkのワンタイム性を維持する。
 */
export const getOrCreateNotificationViewMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    notificationOperationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const [staff, shop, recruitment] = await Promise.all([
      ctx.db.get(args.staffId),
      ctx.db.get(args.shopId),
      ctx.db.get(args.recruitmentId),
    ]);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== args.shopId ||
      !(await isShopParentActive(ctx, shop)) ||
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.shopId !== args.shopId ||
      recruitment.status !== "confirmed"
    ) {
      throw new Error("Inactive notification scope");
    }

    const existing = await ctx.db
      .query("magicLinks")
      .withIndex("by_staffId_recruitmentId_accessKind_notificationOperationKey", (q) =>
        q
          .eq("staffId", args.staffId)
          .eq("recruitmentId", args.recruitmentId)
          .eq("accessKind", "view")
          .eq("notificationOperationKey", args.notificationOperationKey),
      )
      .first();
    if (existing && !existing.revokedAt) {
      if (existing.expiresAt <= now) {
        const fanoutTargetKey = `fanout:${args.notificationOperationKey}:${args.staffId}`;
        const outbox = await ctx.db
          .query("notificationOutbox")
          .withIndex("by_fanoutTargetKey", (q) => q.eq("fanoutTargetKey", fanoutTargetKey))
          .first();
        // enqueue前の中断だけを回復する。Outbox作成後は保存済みpayloadとのURL不一致を起こさない。
        if (!outbox) await ctx.db.patch(existing._id, { expiresAt: now + MAGIC_LINK_DEFAULT_TTL_MS });
      }
      return { token: existing.token };
    }

    const token = generateUUID();
    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      accessKind: "view",
      notificationOperationKey: args.notificationOperationKey,
      expiresAt: now + MAGIC_LINK_DEFAULT_TTL_MS,
    });
    return { token };
  },
});

export const markReminderSent = internalMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") return null;
    await ctx.db.patch(args.recruitmentId, { lastReminderSentAt: args.sentAt });
    return null;
  },
});

/**
 * rolling deploy中に旧actionが呼ぶ互換entrypoint。
 * 現在の確定内容とcanonical Outboxが一致する場合だけ保存し、遅延Aのdedupe後にBを誤記録しない。
 * TODO[narrow]: 全deploymentで旧個別通知actionのschedulerが0件になり、drain期間が終わった後に削除する。
 */
export const upsertConfirmationSnapshot = internalMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    signature: v.string(),
    assignments: v.array(confirmationSnapshotAssignmentValidator),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.status !== "confirmed" ||
      (recruitment.draftSavedAt !== undefined &&
        (recruitment.confirmedAt === undefined || recruitment.draftSavedAt > recruitment.confirmedAt))
    ) {
      return null;
    }

    const suppliedSnapshot = { assignments: args.assignments, signature: args.signature };
    if (!hasValidConfirmationSnapshotSignature(suppliedSnapshot)) return null;

    const currentAssignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", args.staffId),
      )
      .collect();
    const currentSnapshotAssignments = currentAssignments.map((assignment) => ({
      date: assignment.date,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      positionId: assignment.positionId,
      ...(assignment.optionId !== undefined ? { optionId: assignment.optionId } : {}),
    }));
    const canonicalizeTime = recruitment.submissionPattern.kind === "time";
    if (!confirmationSnapshotMatchesAssignments(suppliedSnapshot, currentSnapshotAssignments, canonicalizeTime)) {
      return null;
    }

    const operationKey = recruitment.lastConfirmationNotificationOperationKey;
    if (!operationKey) return null;
    const operations = await ctx.db
      .query("notificationFanoutOperations")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
      .take(2);
    if (operations.length !== 1) return null;
    const operation = operations[0];
    if (
      operation.kind !== "confirmation" ||
      operation.recruitmentId !== args.recruitmentId ||
      operation.shopId !== recruitment.shopId ||
      !operation.targetStaffIds.includes(args.staffId)
    ) {
      return null;
    }

    const fanoutTargetKey = buildNotificationFanoutTargetKey(operationKey, args.staffId);
    const outbox = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_fanoutTargetKey", (q) => q.eq("fanoutTargetKey", fanoutTargetKey))
      .first();
    if (
      !outbox ||
      outbox.fanoutOperationId !== operation._id ||
      outbox.recruitmentId !== args.recruitmentId ||
      outbox.shopId !== recruitment.shopId ||
      outbox.staffId !== args.staffId
    ) {
      return null;
    }

    const existingSnapshot = await ctx.db
      .query("shiftConfirmationSnapshots")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", args.staffId),
      )
      .first();
    const canonicalAssignments = canonicalizeTime
      ? canonicalizeConfirmationSnapshotAssignments(args.assignments)
      : normalizeConfirmationSnapshotAssignments(args.assignments);
    const canonicalSignature = buildConfirmationSnapshotSignature(canonicalAssignments);
    if (
      existingSnapshot &&
      hasValidConfirmationSnapshotSignature(existingSnapshot) &&
      existingSnapshot.signature === canonicalSignature &&
      (!canonicalizeTime ||
        confirmationSnapshotMatchesAssignments(existingSnapshot, canonicalAssignments, canonicalizeTime))
    ) {
      return existingSnapshot._id;
    }

    return await upsertConfirmationSnapshotRecord(ctx, {
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      assignments: canonicalAssignments,
      sentAt: args.sentAt,
      canonicalizeTime,
    });
  },
});

const fanoutOperationIdValidator = v.id("notificationFanoutOperations");

function fanoutOrigin(operation: Doc<"notificationFanoutOperations">) {
  return operation.organizationBillingVersionAtOrigin === undefined
    ? {}
    : { organizationBillingVersionAtOrigin: operation.organizationBillingVersionAtOrigin };
}

async function scheduleNotificationFanoutOperation(
  ctx: MutationCtx,
  operation: Doc<"notificationFanoutOperations">,
  runAt?: number,
) {
  await cancelPendingNotificationFanoutSchedule(ctx, operation);
  let scheduledFunctionId: Id<"_scheduled_functions">;
  if (operation.kind === "recruitment") {
    const args = {
      recruitmentId: operation.recruitmentId,
      fanoutOperationId: operation._id,
      ...fanoutOrigin(operation),
    };
    if (runAt === undefined) {
      scheduledFunctionId = await ctx.scheduler.runAfter(
        0,
        internal.notification.actions.sendRecruitmentNotificationEmails,
        args,
      );
    } else {
      scheduledFunctionId = await ctx.scheduler.runAt(
        runAt,
        internal.notification.actions.sendRecruitmentNotificationEmails,
        args,
      );
    }
  } else {
    const args = {
      recruitmentId: operation.recruitmentId,
      isResend: operation.purpose === "confirmation_resend",
      fanoutOperationId: operation._id,
      ...fanoutOrigin(operation),
      ...(operation.notificationRunId === undefined ? {} : { notificationRunId: operation.notificationRunId }),
    };
    if (runAt === undefined) {
      scheduledFunctionId = await ctx.scheduler.runAfter(
        0,
        internal.notification.actions.sendShiftConfirmationEmails,
        args,
      );
    } else {
      scheduledFunctionId = await ctx.scheduler.runAt(
        runAt,
        internal.notification.actions.sendShiftConfirmationEmails,
        args,
      );
    }
  }
  await ctx.db.patch(operation._id, { scheduledFunctionId });
}

async function cancelPendingNotificationFanoutSchedule(
  ctx: MutationCtx,
  operation: Doc<"notificationFanoutOperations">,
) {
  if (!operation.scheduledFunctionId) return;
  const scheduled = await ctx.db.system.get(operation.scheduledFunctionId);
  if (scheduled?.state.kind === "pending") {
    await ctx.scheduler.cancel(operation.scheduledFunctionId);
  }
}

async function hasLiveNotificationFanoutSchedule(ctx: MutationCtx, operation: Doc<"notificationFanoutOperations">) {
  if (!operation.scheduledFunctionId) return false;
  const scheduled = await ctx.db.system.get(operation.scheduledFunctionId);
  return scheduled?.state.kind === "pending" || scheduled?.state.kind === "inProgress";
}

/** cronから、予約漏れのpending operationと期限切れprocessing leaseをboundedに再予約する。 */
export const recoverNotificationFanoutOperations = internalMutation({
  args: {},
  returns: v.object({
    scheduledCount: v.number(),
    scheduledByStatus: v.object({ pending: v.number(), processing: v.number() }),
    reachedBatchLimit: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [pending, expiredProcessing] = await Promise.all([
      ctx.db
        .query("notificationFanoutOperations")
        .withIndex("by_status_leaseExpiresAt", (q) => q.eq("status", "pending"))
        .order("asc")
        .take(NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE),
      ctx.db
        .query("notificationFanoutOperations")
        .withIndex("by_status_leaseExpiresAt", (q) => q.eq("status", "processing").lte("leaseExpiresAt", now))
        .order("asc")
        .take(NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE),
    ]);
    const scannedCandidates = [
      ...pending.map((operation) => ({ operation, sourceStatus: "pending" as const })),
      ...expiredProcessing.map((operation) => ({ operation, sourceStatus: "processing" as const })),
    ].sort(
      (left, right) =>
        (left.operation.leaseExpiresAt ?? left.operation.updatedAt) -
          (right.operation.leaseExpiresAt ?? right.operation.updatedAt) ||
        left.operation._creationTime - right.operation._creationTime,
    );
    const candidates = [];
    for (const candidate of scannedCandidates) {
      if (candidates.length >= NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE) break;
      if (!(await hasLiveNotificationFanoutSchedule(ctx, candidate.operation))) candidates.push(candidate);
    }

    const scheduledByStatus = { pending: 0, processing: 0 };
    for (const { operation, sourceStatus } of candidates) {
      scheduledByStatus[sourceStatus] += 1;
      await scheduleNotificationFanoutOperation(ctx, operation);
    }
    return {
      scheduledCount: candidates.length,
      scheduledByStatus,
      reachedBatchLimit:
        candidates.length === NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE ||
        pending.length === NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE ||
        expiredProcessing.length === NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE,
    };
  },
});

export const ensureRecruitmentNotificationFanout = internalMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    const shop = recruitment ? await ctx.db.get(recruitment.shopId) : null;
    if (
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.status !== "open" ||
      !(await isShopParentActive(ctx, shop))
    ) {
      return null;
    }
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
      .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1);
    if (staffs.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }
    const { operation } = await ensureNotificationFanoutOperation(ctx, {
      operationKey: `shift.recruitment:v1:${args.recruitmentId}`,
      kind: "recruitment",
      purpose: "recruitment",
      recruitmentId: args.recruitmentId,
      shopId: recruitment.shopId,
      targetStaffIds: staffs.filter(isShiftTargetStaff).map((staff) => staff._id),
      dedupeSuffix: "recruitment",
      ...(args.organizationBillingVersionAtOrigin === undefined
        ? {}
        : { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }),
    });
    return operation._id;
  },
});

export const ensureConfirmationNotificationFanout = internalMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    isResend: v.boolean(),
    targetStaffIds: v.optional(v.array(v.id("staffs"))),
    notificationRunId: v.optional(v.number()),
    operationKey: v.optional(v.string()),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    const shop = recruitment ? await ctx.db.get(recruitment.shopId) : null;
    if (
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.status !== "confirmed" ||
      !(await isShopParentActive(ctx, shop))
    ) {
      return null;
    }

    const latestOperationKey = args.operationKey ? undefined : recruitment.lastConfirmationNotificationOperationKey;
    const latestRunId = recruitment.lastConfirmationNotificationRunId;
    const latestIsResend = (latestRunId ?? 1) > 1;
    if (latestOperationKey) {
      const existingLatest = await ctx.db
        .query("notificationFanoutOperations")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", latestOperationKey))
        .unique();
      // 遅延した旧jobも最新operationへ収束する。batch側のpurposeを正とし、旧argsで別operationを起こさない。
      if (existingLatest) return existingLatest._id;
      const matchesLatest =
        args.isResend === latestIsResend &&
        (!latestIsResend || args.notificationRunId === undefined || args.notificationRunId === latestRunId);
      if (!matchesLatest) return null;
    }

    const operationIsResend = latestOperationKey ? latestIsResend : args.isResend;
    const operationRunId = latestOperationKey ? latestRunId : args.notificationRunId;

    const requestedIds = args.targetStaffIds
      ? normalizeNotificationFanoutTargetStaffIds(args.targetStaffIds)
      : (
          await ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
            .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1)
        ).map((staff) => staff._id);
    if (requestedIds.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }
    const staffs = await Promise.all(requestedIds.map((staffId) => ctx.db.get(staffId)));
    const targetStaffIds = staffs.flatMap((staff) =>
      staff && staff.shopId === recruitment.shopId && isShiftTargetStaff(staff) ? [staff._id] : [],
    );

    const operationKey =
      args.operationKey ??
      latestOperationKey ??
      `shift.confirmation:legacy:v1:${args.recruitmentId}:${args.isResend ? `resend:${args.notificationRunId ?? "unknown"}` : "confirm"}`;
    const dedupeSuffix = operationIsResend ? `resend:${operationRunId ?? `legacy:${operationKey}`}` : "confirm";
    const { operation } = await ensureNotificationFanoutOperation(ctx, {
      operationKey,
      kind: "confirmation",
      purpose: operationIsResend ? "confirmation_resend" : "confirmation",
      recruitmentId: args.recruitmentId,
      shopId: recruitment.shopId,
      targetStaffIds,
      dedupeSuffix,
      ...(args.organizationBillingVersionAtOrigin === undefined
        ? {}
        : { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }),
      ...(operationRunId === undefined ? {} : { notificationRunId: operationRunId }),
    });
    return operation._id;
  },
});

export const claimNotificationFanoutBatch = internalMutation({
  args: { operationId: fanoutOperationIdValidator },
  handler: async (ctx, { operationId }) => {
    const operation = await ctx.db.get(operationId);
    if (!operation || operation.status === "completed" || operation.status === "cancelled") {
      return { state: "terminal" as const };
    }

    const [recruitment, shop] = await Promise.all([ctx.db.get(operation.recruitmentId), ctx.db.get(operation.shopId)]);
    const expectedStatus = operation.kind === "recruitment" ? "open" : "confirmed";
    if (
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.shopId !== operation.shopId ||
      recruitment.status !== expectedStatus ||
      !(await isShopParentActive(ctx, shop))
    ) {
      const now = Date.now();
      await ctx.db.patch(operationId, {
        status: "cancelled",
        cancelReason: "recruitment_inactive",
        cancelledAt: now,
        scheduledFunctionId: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { state: "cancelled" as const };
    }

    if (isSupplementalConfirmationFanoutStale(operation, recruitment)) {
      const now = Date.now();
      await ctx.db.patch(operationId, {
        status: "cancelled",
        cancelReason: "superseded",
        cancelledAt: now,
        scheduledFunctionId: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { state: "cancelled" as const };
    }

    const now = Date.now();
    if (operation.status === "processing" && operation.leaseExpiresAt !== undefined && operation.leaseExpiresAt > now) {
      return { state: "busy" as const };
    }
    if (operation.cursor >= operation.targetStaffIds.length) {
      await ctx.db.patch(operationId, {
        status: "completed",
        completedAt: now,
        scheduledFunctionId: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { state: "completed" as const };
    }

    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = now + NOTIFICATION_FANOUT_PROCESSING_LEASE_MS;
    await cancelPendingNotificationFanoutSchedule(ctx, operation);
    await ctx.db.patch(operationId, {
      status: "processing",
      scheduledFunctionId: undefined,
      leaseToken,
      leaseExpiresAt,
      updatedAt: now,
    });
    const claimedOperation = {
      ...operation,
      status: "processing" as const,
      scheduledFunctionId: undefined,
      leaseToken,
      leaseExpiresAt,
      updatedAt: now,
    };
    // action中断時も通常schedulerだけで同じcursorを回収できるよう、claimと同じtransactionで予約する。
    await scheduleNotificationFanoutOperation(ctx, claimedOperation, leaseExpiresAt);
    return {
      state: "claimed" as const,
      operationKey: operation.operationKey,
      recruitmentId: operation.recruitmentId,
      purpose: operation.purpose,
      dedupeSuffix: operation.dedupeSuffix,
      leaseToken,
      cursor: operation.cursor,
      ...(operation.organizationBillingVersionAtOrigin === undefined
        ? {}
        : { organizationBillingVersionAtOrigin: operation.organizationBillingVersionAtOrigin }),
      targetStaffIds: operation.targetStaffIds.slice(
        operation.cursor,
        operation.cursor + NOTIFICATION_FANOUT_BATCH_SIZE,
      ),
    };
  },
});

export const completeNotificationFanoutBatch = internalMutation({
  args: {
    operationId: fanoutOperationIdValidator,
    leaseToken: v.string(),
    expectedCursor: v.number(),
  },
  handler: async (ctx, { operationId, leaseToken, expectedCursor }) => {
    const operation = await ctx.db.get(operationId);
    if (
      operation?.status !== "processing" ||
      operation.leaseToken !== leaseToken ||
      operation.cursor !== expectedCursor
    ) {
      return { state: "stale" as const };
    }

    const now = Date.now();
    const cursor = Math.min(operation.targetStaffIds.length, expectedCursor + NOTIFICATION_FANOUT_BATCH_SIZE);
    if (cursor >= operation.targetStaffIds.length) {
      await cancelPendingNotificationFanoutSchedule(ctx, operation);
      await ctx.db.patch(operationId, {
        cursor,
        status: "completed",
        completedAt: now,
        scheduledFunctionId: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { state: "completed" as const };
    }

    await cancelPendingNotificationFanoutSchedule(ctx, operation);
    await ctx.db.patch(operationId, {
      cursor,
      status: "pending",
      scheduledFunctionId: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await scheduleNotificationFanoutOperation(ctx, {
      ...operation,
      cursor,
      status: "pending",
      scheduledFunctionId: undefined,
      updatedAt: now,
    });
    return { state: "continued" as const, cursor };
  },
});
