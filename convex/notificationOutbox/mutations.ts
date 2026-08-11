import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { isManagerInvitationEnabled } from "../_lib/config";
import { monthJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { isNotificationDeliverySuppressed } from "../_lib/notificationDelivery";
import { rateLimit } from "../_lib/rateLimits";
import { loadShopManagerStaffForContact, type ShopManagerContact } from "../_lib/shopManagerRecipients";
import { normalizeEmail } from "../_lib/validation";
import {
  NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE,
  NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
  NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE,
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE,
  NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE,
} from "../constants";
import { getStaffLineAccount } from "../line/service";
import {
  buildConfirmationSnapshotSignature,
  confirmationSnapshotInputValidator,
  upsertConfirmationSnapshotRecord,
} from "../notification/confirmationSnapshots";
import { buildNotificationFanoutTargetKey, isSupplementalConfirmationFanoutStale } from "../notification/fanout";
import {
  billingStateReferencesBusinessPlan,
  deriveOrganizationBillingPolicy,
  getEffectiveRestrictedBillingState,
} from "../organizationBilling/policy";
import { isOrganizationInvitationIssued } from "../organizationInvitation/lifecycle";
import { resolveOrganizationInvitationEligibility } from "../organizationInvitation/service";
import { isShiftTargetStaff } from "../staff/service";
import { hasOpenRecruitmentScope, isManagerVisibleNotificationFailure } from "./failureEligibility";
import {
  getNotificationFailureIdentity,
  getNotificationFailureIdentityForDoc,
  supersededFailureKey,
} from "./failureIdentity";
import { getNotificationFailureResendKind, isLineInviteResendContext } from "./failureResend";
import { shouldSuppressNotificationFailureInbox } from "./failureSuppress";
import {
  insertNotificationHistory,
  NOTIFICATION_HISTORY_DELETE_BATCH_SIZE,
  normalizeNotificationHistoryInput,
  updateNotificationHistoryDeliveryStatus,
  updateNotificationHistorySendStatus,
} from "./history";
import { getBusinessNotificationOrigin } from "./origin";
import {
  notificationContextForPayload,
  notificationDeliverySuppressedForPayload,
  redactNotificationPayload,
} from "./redaction";
import {
  type ResendProviderEventType,
  type ResendProviderIssueEventType,
  resendProviderDeliveryStatus,
} from "./resendProviderEvents";
import { type SafeNotificationErrorCode, safeStoredNotificationError } from "./safeError";
import {
  notificationChannelValidator,
  notificationDeliveryErrorEventTypeValidator,
  notificationHistoryInputValidator,
  notificationPayloadValidator,
  notificationPurposeValidator,
  resendProviderIssueEventTypeValidator,
} from "./schemas";
import type {
  NotificationCancelReason,
  NotificationChannel,
  NotificationEmailPayload,
  NotificationHistoryInput,
  NotificationPayload,
  NotificationPurpose,
} from "./types";
import { notificationChannelForPayload } from "./types";

const ACTIVE_STATUSES = ["pending", "processing"] as const;
const DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH = 2_000;
const FAILURE_RESEND_BATCH_SIZE = 50;
const FAILURE_DUPLICATE_SCAN_LIMIT = 50;
const FAILURE_EXPIRE_TARGET_STATUSES = ["open", "retrying"] as const;
const TERMINAL_STATUSES = ["sent", "failed", "cancelled"] as const;
const ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE = 100;
// 1候補ごとに履歴とfailure indexも確認するため、一括所属変更のtransaction budgetを先に制限する。
export const BULK_NOTIFICATION_CANCEL_CANDIDATE_LIMIT = 50;
const HISTORICAL_BILLING_RECIPIENT_CONTEXTS = new Set(["organizationBilling.freeApplied"]);
const BILLING_DEADLINE_CONTEXT_STATE = {
  "organizationBilling.trialEnding": "trial",
  "organizationBilling.graceEndingSoon": "grace",
} as const;

const failureResendResultValidator = v.union(
  v.object({ scheduled: v.literal(true) }),
  v.object({
    scheduled: v.literal(false),
    reason: v.union(v.literal("notRetryable"), v.literal("rateLimited")),
  }),
);

type ManagerNotificationOutboxMutationCtx = MutationCtx & {
  user: Doc<"users">;
  shop: Doc<"shops">;
};

function normalizeHistoryTarget(input: {
  shopId?: Id<"shops">;
  staffId?: Id<"staffs">;
  history?: NotificationHistoryInput;
  historyMode?: "legacy_no_history";
}) {
  if (input.historyMode === "legacy_no_history") {
    if (!input.staffId || input.history) throw new ConvexError("Invalid notification history target");
    return null;
  }

  if (!input.staffId) {
    if (input.history) throw new ConvexError("Invalid notification history target");
    return null;
  }
  if (!input.shopId || !input.history) throw new ConvexError("Invalid notification history target");

  return {
    shopId: input.shopId,
    staffId: input.staffId,
    history: normalizeNotificationHistoryInput(input.history),
  };
}

function normalizePayloadHistory(payload: NotificationPayload): NotificationPayload {
  if (payload.kind === "line") {
    if (!payload.fallbackEmail?.history) return payload;
    return {
      ...payload,
      fallbackEmail: {
        ...payload.fallbackEmail,
        history: normalizeNotificationHistoryInput(payload.fallbackEmail.history),
      },
    };
  }

  if (payload.kind === "organizationManagerInvitationLine" && payload.fallbackEmail.history) {
    return {
      ...payload,
      fallbackEmail: {
        ...payload.fallbackEmail,
        history: normalizeNotificationHistoryInput(payload.fallbackEmail.history),
      },
    };
  }

  return payload;
}

export const enqueue = internalMutation({
  args: {
    channel: notificationChannelValidator,
    shopId: v.optional(v.id("shops")),
    organizationId: v.optional(v.id("organizations")),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
    organizationInvitationId: v.optional(v.id("organizationInvitations")),
    organizationInvitationVersion: v.optional(v.number()),
    // TODO[narrow]: m024完走・旧scheduled callerのdrain確認後にrequired化し、business既定値を削除する。
    purpose: v.optional(notificationPurposeValidator),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    history: v.optional(notificationHistoryInputValidator),
    historyMode: v.optional(v.literal("legacy_no_history")),
    userId: v.optional(v.id("users")),
    dedupeAcrossTerminal: v.optional(v.boolean()),
    fanoutTargetKey: v.optional(v.string()),
    fanoutOperationId: v.optional(v.id("notificationFanoutOperations")),
    fanoutLeaseToken: v.optional(v.string()),
    confirmationSnapshot: v.optional(confirmationSnapshotInputValidator),
    // TODO[narrow]: 旧fanout schedulerのdrainとOutbox/fanout readiness確認後に、この旧dedupe key照合を削除する。
    legacyFanoutDedupeKeys: v.optional(v.array(v.string())),
    dedupeKey: v.string(),
    payload: notificationPayloadValidator,
  },
  handler: async (ctx, args) => {
    const historyTarget = normalizeHistoryTarget(args);
    const payload = normalizePayloadHistory(args.payload);
    if (args.channel !== notificationChannelForPayload(payload)) {
      throw new ConvexError("Notification channel does not match payload");
    }

    const hasFanoutProducerScope = args.fanoutTargetKey !== undefined || args.fanoutLeaseToken !== undefined;
    if (
      (args.fanoutTargetKey === undefined) !== (args.fanoutLeaseToken === undefined) ||
      (hasFanoutProducerScope && args.fanoutOperationId === undefined)
    ) {
      throw new ConvexError("Fanout operation scope is incomplete");
    }
    let fanoutOperation: Doc<"notificationFanoutOperations"> | null = null;
    if (args.fanoutOperationId) {
      fanoutOperation = await ctx.db.get(args.fanoutOperationId);
      if (!fanoutOperation) return null;
      if (
        !args.staffId ||
        !args.shopId ||
        fanoutOperation.recruitmentId !== args.recruitmentId ||
        fanoutOperation.shopId !== args.shopId ||
        !fanoutOperation.targetStaffIds.includes(args.staffId)
      ) {
        throw new ConvexError("Fanout target does not match operation");
      }
      if (hasFanoutProducerScope) {
        if (fanoutOperation.status !== "processing" || fanoutOperation.leaseToken !== args.fanoutLeaseToken)
          return null;
        if (buildNotificationFanoutTargetKey(fanoutOperation.operationKey, args.staffId) !== args.fanoutTargetKey) {
          throw new ConvexError("Fanout target does not match operation");
        }
      }
    }

    const rawConfirmationSnapshot = args.confirmationSnapshot?.assignments;
    if (args.confirmationSnapshot) {
      if (
        !hasFanoutProducerScope ||
        fanoutOperation?.kind !== "confirmation" ||
        !args.recruitmentId ||
        !args.staffId ||
        fanoutOperation.recruitmentId !== args.recruitmentId ||
        !fanoutOperation.targetStaffIds.includes(args.staffId) ||
        args.confirmationSnapshot.signature !== buildConfirmationSnapshotSignature(rawConfirmationSnapshot ?? [])
      ) {
        throw new ConvexError("Confirmation snapshot does not match fanout operation");
      }
    }

    const now = Date.now();
    // TODO[narrow]: 全deploymentでm024完走・missingPurpose=0・旧caller drain確認後はargs.purposeを直接使う。
    const purpose = args.purpose ?? "business";
    const eligibility = await getNotificationEligibility(ctx, { ...args, purpose, payload }, now);
    if (eligibility.cancelReason) {
      if (eligibility.cancelReason !== "unsupported_channel" && eligibility.cancelReason !== "invalid_scope") {
        return null;
      }
      throw new ConvexError("Notification cannot be enqueued");
    }

    // worker が別ジョブの status を高頻度に更新するため、enqueue の読み取りは dedupeKey 単位に絞る。
    // TODO[narrow]: 全deploymentで旧schedulerが消え、fanout linkの不完全rowが0件になった後はcanonical keyだけを見る。
    if ((args.fanoutTargetKey === undefined) !== (args.legacyFanoutDedupeKeys === undefined)) {
      throw new ConvexError("Fanout dedupe scope is incomplete");
    }
    if (args.legacyFanoutDedupeKeys && args.legacyFanoutDedupeKeys.length > 2) {
      throw new ConvexError("Fanout legacy dedupe scope is too large");
    }
    if (args.fanoutTargetKey) {
      const existingTarget = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_fanoutTargetKey", (q) => q.eq("fanoutTargetKey", args.fanoutTargetKey))
        .first();
      if (existingTarget) {
        if (
          existingTarget.fanoutOperationId !== undefined &&
          existingTarget.fanoutOperationId !== args.fanoutOperationId
        ) {
          throw new ConvexError("Fanout target belongs to another operation");
        }
        if (existingTarget.fanoutOperationId === undefined) {
          await ctx.db.patch(existingTarget._id, { fanoutOperationId: args.fanoutOperationId, updatedAt: now });
        }
        return { outboxId: existingTarget._id, deduped: true };
      }

      // Widen前に作られた同じfanout rowはtarget keyを持たない。channel両方の旧keyを一度だけ照合して昇格する。
      for (const legacyDedupeKey of new Set(args.legacyFanoutDedupeKeys)) {
        for (const status of [...ACTIVE_STATUSES, ...TERMINAL_STATUSES]) {
          const legacy = await ctx.db
            .query("notificationOutbox")
            .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", legacyDedupeKey).eq("status", status))
            .first();
          if (!legacy) continue;
          await ctx.db.patch(legacy._id, {
            fanoutTargetKey: args.fanoutTargetKey,
            fanoutOperationId: args.fanoutOperationId,
            updatedAt: now,
          });
          return { outboxId: legacy._id, deduped: true };
        }
      }
    }

    const dedupeStatuses = args.dedupeAcrossTerminal ? [...ACTIVE_STATUSES, ...TERMINAL_STATUSES] : ACTIVE_STATUSES;
    for (const status of dedupeStatuses) {
      const existing = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", args.dedupeKey).eq("status", status))
        .first();
      if (existing) {
        if (args.fanoutOperationId) {
          if (
            existing.recruitmentId !== args.recruitmentId ||
            existing.shopId !== args.shopId ||
            existing.staffId !== args.staffId ||
            (existing.fanoutOperationId !== undefined && existing.fanoutOperationId !== args.fanoutOperationId)
          ) {
            throw new ConvexError("Fanout fallback dedupe scope does not match operation");
          }
          if (existing.fanoutOperationId === undefined) {
            await ctx.db.patch(existing._id, { fanoutOperationId: args.fanoutOperationId, updatedAt: now });
          }
        }
        if (
          purpose === "business" &&
          existingBelongsToNotificationScope(existing, args, eligibility.organizationId) &&
          predatesBusinessNotificationCutoff(existing, eligibility)
        ) {
          await cancelActiveNotification(ctx, existing, "organization_billing_changed", now);
          continue;
        }
        return { outboxId: existing._id, deduped: true };
      }
    }

    const organizationBillingVersionAtEnqueue =
      args.organizationBillingVersionAtOrigin ?? eligibility.organizationBillingVersion;
    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: args.channel,
      status: "pending",
      dedupeKey: args.dedupeKey,
      ...(args.fanoutTargetKey ? { fanoutTargetKey: args.fanoutTargetKey } : {}),
      ...(args.fanoutOperationId ? { fanoutOperationId: args.fanoutOperationId } : {}),
      ...(args.shopId ? { shopId: args.shopId } : {}),
      ...(eligibility.organizationId ? { organizationId: eligibility.organizationId } : {}),
      ...(organizationBillingVersionAtEnqueue !== undefined ? { organizationBillingVersionAtEnqueue } : {}),
      ...(args.organizationInvitationId ? { organizationInvitationId: args.organizationInvitationId } : {}),
      ...(args.organizationInvitationVersion !== undefined
        ? { organizationInvitationVersion: args.organizationInvitationVersion }
        : {}),
      purpose,
      ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
      ...(args.staffId ? { staffId: args.staffId } : {}),
      ...(args.userId ? { userId: args.userId } : {}),
      notificationContext: notificationContextForPayload(payload, args.dedupeKey),
      deliverySuppressed: notificationDeliverySuppressedForPayload(payload),
      payload,
      attemptCount: 0,
      nextRunAt: now + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
      createdAt: now,
      updatedAt: now,
    });
    if (historyTarget && !isNotificationDeliverySuppressed({ suppressDelivery: payload.suppressDelivery })) {
      await insertNotificationHistory(ctx, {
        outboxId,
        shopId: historyTarget.shopId,
        staffId: historyTarget.staffId,
        channel: args.channel,
        history: historyTarget.history,
        requestedAt: now,
      });
    }
    if (rawConfirmationSnapshot && args.confirmationSnapshot && args.recruitmentId && args.staffId) {
      const recruitment = await ctx.db.get(args.recruitmentId);
      const canonicalizeTime = recruitment?.submissionPattern.kind === "time";
      await upsertConfirmationSnapshotRecord(ctx, {
        recruitmentId: args.recruitmentId,
        staffId: args.staffId,
        assignments: rawConfirmationSnapshot,
        sentAt: now,
        canonicalizeTime,
      });
    }
    return { outboxId, deduped: false };
  },
});

export const recordDeliveryEvent = internalMutation({
  args: {
    eventType: notificationDeliveryErrorEventTypeValidator,
    shopId: v.optional(v.id("shops")),
    organizationId: v.optional(v.id("organizations")),
    organizationInvitationId: v.optional(v.id("organizationInvitations")),
    organizationInvitationVersion: v.optional(v.number()),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    outboxId: v.optional(v.id("notificationOutbox")),
    channel: v.optional(notificationChannelValidator),
    dedupeKey: v.optional(v.string()),
    notificationContext: v.optional(v.string()),
    attemptCount: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    errorMessage: v.string(),
    errorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const errorCode = safeStoredNotificationError(args.errorMessage, fallbackErrorCodeForEvent(args.eventType));
    const eventId = await insertDeliveryEvent(ctx, {
      ...args,
      errorMessage: errorCode,
      errorName: undefined,
    });
    if (
      (args.eventType !== "enqueue_failed" && args.eventType !== "enqueue_preparation_failed") ||
      !args.shopId ||
      !args.dedupeKey
    ) {
      return;
    }

    const sourceType = args.eventType === "enqueue_failed" ? "enqueue" : "enqueue_preparation";
    const notificationContext = args.notificationContext ?? dedupeContext(args.dedupeKey);
    if (shouldSuppressNotificationFailureInbox(notificationContext)) return;
    const identity = getNotificationFailureIdentity({
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      notificationContext,
    });
    await upsertFailureInbox(ctx, {
      sourceType,
      failureKey: identity?.failureKey ?? enqueueFailureKey(sourceType, args.shopId, args.dedupeKey),
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      userId: args.userId,
      outboxId: args.outboxId,
      channel: args.channel,
      dedupeKey: args.dedupeKey,
      notificationContext,
      attemptCount: args.attemptCount,
      lastFailedAt: Date.now(),
      lastEventId: eventId,
      lastError: errorCode,
    });
  },
});

export const recordResendProviderIssue = internalMutation({
  args: {
    providerEventId: v.string(),
    providerEventType: resendProviderIssueEventTypeValidator,
    providerEmailId: v.string(),
    outboxIdTag: v.optional(v.string()),
    occurredAt: v.number(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const safeArgs = {
      ...args,
      errorMessage: resendProviderIssueErrorCode(args.providerEventType),
    };
    const existingEvent = await ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_providerEventId", (q) => q.eq("providerEventId", args.providerEventId))
      .first();
    if (existingEvent) return { recorded: false as const, reason: "duplicate" as const };

    const outbox = await findOutboxForResendProviderEvent(ctx, safeArgs.providerEmailId, safeArgs.outboxIdTag);
    const eventId = await insertDeliveryEvent(ctx, resendProviderIssueDeliveryEventInput(safeArgs, outbox));

    if (!isEmailNotificationOutbox(outbox)) {
      return { recorded: true as const, inboxed: false as const, reason: "outboxNotFound" as const };
    }
    if (outbox.resendLastEventAt !== undefined && safeArgs.occurredAt < outbox.resendLastEventAt) {
      return { recorded: true as const, inboxed: false as const, reason: "stale" as const };
    }

    const historyUpdate = await updateNotificationHistoryDeliveryStatus(ctx, {
      outboxId: outbox._id,
      providerEventType: safeArgs.providerEventType,
      occurredAt: safeArgs.occurredAt,
      updatedAt: Date.now(),
    });
    if (historyUpdate === "stale") {
      return { recorded: true as const, inboxed: false as const, reason: "stale" as const };
    }

    await patchOutboxResendProviderState(ctx, outbox, safeArgs);

    const inboxInput = resendProviderFailureInboxInput(outbox, safeArgs, eventId);
    if (!inboxInput) {
      return { recorded: true as const, inboxed: false as const, reason: "suppressed" as const };
    }

    const failureId = await upsertFailureInbox(ctx, inboxInput);

    return { recorded: true as const, inboxed: true as const, failureId };
  },
});

export const recordResendProviderDeliveryUpdate = internalMutation({
  args: {
    providerEventId: v.string(),
    providerEventType: v.literal("email.delivered"),
    providerEmailId: v.string(),
    outboxIdTag: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_providerEventId", (q) => q.eq("providerEventId", args.providerEventId))
      .first();
    if (existingEvent) return { recorded: false as const, reason: "duplicate" as const };

    const outbox = await findOutboxForResendProviderEvent(ctx, args.providerEmailId, args.outboxIdTag);
    await insertDeliveryEvent(ctx, resendProviderDeliveryUpdateEventInput(args, outbox));

    if (!isEmailNotificationOutbox(outbox)) {
      return { recorded: true as const, historyUpdated: false as const, reason: "outboxNotFound" as const };
    }
    if (outbox.resendLastEventAt !== undefined && args.occurredAt < outbox.resendLastEventAt) {
      return { recorded: true as const, historyUpdated: false as const, reason: "stale" as const };
    }

    const historyUpdate = await updateNotificationHistoryDeliveryStatus(ctx, {
      outboxId: outbox._id,
      providerEventType: args.providerEventType,
      occurredAt: args.occurredAt,
      updatedAt: Date.now(),
    });
    if (historyUpdate === "stale") {
      return { recorded: true as const, historyUpdated: false as const, reason: "stale" as const };
    }

    await patchOutboxResendProviderEventAt(ctx, outbox, args);
    await resolveProviderFailureInboxByOutbox(ctx, outbox._id, args.occurredAt);
    return { recorded: true as const, historyUpdated: historyUpdate === "updated" };
  },
});

function processingLeaseExpiresAt(job: Doc<"notificationOutbox">) {
  return job.leaseExpiresAt ?? (job.processingStartedAt ?? job.updatedAt) + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS;
}

function claimableAt(job: Doc<"notificationOutbox">) {
  return job.status === "pending" ? job.nextRunAt : processingLeaseExpiresAt(job);
}

function hasCurrentProcessingLease(
  job: Doc<"notificationOutbox"> | null,
  leaseToken: string | undefined,
): job is Doc<"notificationOutbox"> {
  if (job?.status !== "processing") return false;
  // Widen前から実行中のworkerだけは、tokenなし同士を同じ旧leaseとして扱う。
  return job.leaseToken === undefined ? leaseToken === undefined : job.leaseToken === leaseToken;
}

export const claimDue = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pendingJobs = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_nextRunAt", (q) => q.eq("status", "pending").lte("nextRunAt", now))
      .order("asc")
      .take(NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE);

    const expiredLeasedJobs = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_leaseExpiresAt", (q) =>
        q.eq("status", "processing").gt("leaseExpiresAt", 0).lte("leaseExpiresAt", now),
      )
      .order("asc")
      .take(NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE);

    // Widen前のprocessing行はlease fieldsを持たないため、従来の開始時刻から期限を復元する。
    const legacyLeaseCutoff = now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS;
    const expiredLegacyJobs = (
      await ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_processingStartedAt", (q) =>
          q.eq("status", "processing").lte("processingStartedAt", legacyLeaseCutoff),
        )
        .filter((q) => q.eq(q.field("leaseExpiresAt"), undefined))
        .order("asc")
        .take(NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE * 2)
    ).filter((job) => processingLeaseExpiresAt(job) <= now);

    const jobs = [...pendingJobs, ...expiredLeasedJobs, ...expiredLegacyJobs]
      .sort((left, right) => claimableAt(left) - claimableAt(right) || left._creationTime - right._creationTime)
      .slice(0, NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE);

    const claimed = [];
    for (const job of jobs) {
      const nextAttemptCount = job.attemptCount + 1;
      const leaseToken = crypto.randomUUID();
      const leaseExpiresAt = now + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS;
      await ctx.db.patch(job._id, {
        status: "processing",
        attemptCount: nextAttemptCount,
        processingStartedAt: now,
        leaseToken,
        leaseExpiresAt,
        updatedAt: now,
      });
      claimed.push({
        ...job,
        status: "processing" as const,
        attemptCount: nextAttemptCount,
        processingStartedAt: now,
        leaseToken,
        leaseExpiresAt,
        updatedAt: now,
      });
    }

    return claimed;
  },
});

/**
 * provider呼び出し直前の最終ゲート。
 * claim後に契約・店舗・所属・招待が失効していても、新しい外部送信を開始しない。
 */
export const prepareForDelivery = internalMutation({
  args: { outboxId: v.id("notificationOutbox"), leaseToken: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { outboxId, leaseToken, now }) => {
    const job = await ctx.db.get(outboxId);
    if (!hasCurrentProcessingLease(job, leaseToken) || processingLeaseExpiresAt(job) <= now) return null;

    const eligibility = await getNotificationEligibility(ctx, job, now);
    if (!eligibility.cancelReason) return job;

    await cancelActiveNotification(ctx, job, eligibility.cancelReason, now);
    return null;
  },
});

/**
 * 管理者招待メール専用の送信直前ゲート。
 * 生tokenは返さず、actionがメモリ内でtokenとHTMLを組み立てるための安全な表示情報だけを返す。
 */
export const prepareOrganizationManagerInvitationEmail = internalMutation({
  args: { outboxId: v.id("notificationOutbox"), leaseToken: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { outboxId, leaseToken, now }) => {
    const job = await ctx.db.get(outboxId);
    if (!hasCurrentProcessingLease(job, leaseToken) || processingLeaseExpiresAt(job) <= now) return null;

    const eligibility = await getNotificationEligibility(ctx, job, now);
    if (eligibility.cancelReason) {
      await cancelActiveNotification(ctx, job, eligibility.cancelReason, now);
      return null;
    }
    if (
      (job.payload.kind !== "organizationManagerInvitationEmail" &&
        job.payload.kind !== "organizationManagerInvitationLine") ||
      !job.organizationId ||
      !job.organizationInvitationId ||
      job.organizationInvitationVersion === undefined
    ) {
      await cancelActiveNotification(ctx, job, "invalid_scope", now);
      return null;
    }

    const [organization, invitation] = await Promise.all([
      ctx.db.get(job.organizationId),
      ctx.db.get(job.organizationInvitationId),
    ]);
    if (!organization || !invitation) {
      await cancelActiveNotification(ctx, job, "invitation_inactive", now);
      return null;
    }
    const inviterMember = await ctx.db.get(invitation.inviterMemberId);
    const inviterPerson = inviterMember ? await ctx.db.get(inviterMember.personId) : null;
    if (!inviterMember || !inviterPerson) {
      await cancelActiveNotification(ctx, job, "invitation_inactive", now);
      return null;
    }

    return {
      invitationId: invitation._id,
      invitationVersion: invitation.version,
      organizationName: organization.name,
      inviterName: inviterPerson.name,
    };
  },
});

/**
 * 契約制限への移行時に、事業者配下の未送信の業務通知だけを有界バッチで停止する。
 * purpose未設定の既存行はbusinessとして扱い、billing通知は残す。
 */
export const cancelOrganizationBusinessNotifications = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    cutoffAt: v.number(),
    cutoffVersion: v.number(),
  },
  handler: async (ctx, { organizationId, cutoffAt, cutoffVersion }) => {
    const now = Date.now();
    const jobs = await findOrganizationBusinessNotificationsToCancel(ctx, {
      organizationId,
      cutoffAt,
      cutoffVersion,
    });

    for (const job of jobs) {
      await cancelActiveNotification(ctx, job, "organization_billing_changed", now);
    }

    if (jobs.length === ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId,
        cutoffAt,
        cutoffVersion,
      });
    }

    return { cancelledCount: jobs.length };
  },
});

/**
 * 人物・店舗所属の終了と同じtransactionで、対象者に紐づく未送信の業務通知を停止する。
 *
 * userIdは別事業者でも共有され得るため、recipient indexで拾った後に必ず事業者境界を再確認する。
 * 招待メールは受信者ではなく発行者の失効でも止める必要があるため、失効した招待IDも受け取る。
 */
export async function cancelOrganizationRecipientBusinessNotifications(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    staffIds?: readonly Id<"staffs">[];
    userId?: Id<"users">;
    invitationIds?: readonly Id<"organizationInvitations">[];
    includeBillingUserNotifications?: boolean;
    preserveStaffNotificationsForUser?: boolean;
    candidateLimit?: number;
  },
) {
  if (args.candidateLimit !== undefined && (!Number.isSafeInteger(args.candidateLimit) || args.candidateLimit < 1)) {
    throw new Error("Notification cancellation candidate limit must be a positive integer");
  }
  if (args.candidateLimit !== undefined && (args.userId !== undefined || (args.invitationIds?.length ?? 0) > 0)) {
    throw new Error("Bounded notification cancellation only supports staff recipients");
  }
  const candidates = new Map<Id<"notificationOutbox">, Doc<"notificationOutbox">>();
  const staffIds = new Set(args.staffIds ?? []);
  const invitationIds = new Set(args.invitationIds ?? []);
  const assertCandidateLimit = () => {
    if (args.candidateLimit !== undefined && candidates.size > args.candidateLimit) {
      throw new ConvexError(
        "未送信の案内が多いため、一括で所属を変更できません。\n対象を分けて、もう一度お試しください。",
      );
    }
  };
  const readLimit = () =>
    args.candidateLimit === undefined ? undefined : Math.max(0, args.candidateLimit - candidates.size) + 1;

  for (const status of ACTIVE_STATUSES) {
    for (const staffId of staffIds) {
      const query = ctx.db
        .query("notificationOutbox")
        .withIndex("by_staffId_status", (q) => q.eq("staffId", staffId).eq("status", status));
      const limit = readLimit();
      const jobs = limit === undefined ? await query.collect() : await query.take(limit);
      for (const job of jobs) candidates.set(job._id, job);
      assertCandidateLimit();
    }
    if (args.userId) {
      const query = ctx.db
        .query("notificationOutbox")
        .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", status));
      const limit = readLimit();
      const jobs = limit === undefined ? await query.collect() : await query.take(limit);
      for (const job of jobs) candidates.set(job._id, job);
      assertCandidateLimit();
    }
    if (invitationIds.size > 0) {
      // TODO[narrow]: 全deploymentでm024完走・missingPurpose=0確認後はbusiness indexだけを読む。
      for (const purpose of ["business", undefined] as const) {
        const query = ctx.db
          .query("notificationOutbox")
          .withIndex("by_organizationId_purpose_status", (q) =>
            q.eq("organizationId", args.organizationId).eq("purpose", purpose).eq("status", status),
          );
        const limit = readLimit();
        const jobs = limit === undefined ? await query.collect() : await query.take(limit);
        for (const job of jobs) {
          if (job.organizationInvitationId && invitationIds.has(job.organizationInvitationId)) {
            candidates.set(job._id, job);
          }
        }
        assertCandidateLimit();
      }
    }
  }

  let cancelledCount = 0;
  const now = Date.now();
  for (const job of candidates.values()) {
    if (!(await notificationBelongsToOrganization(ctx, job, args.organizationId))) continue;

    const invitationInactive =
      job.organizationInvitationId !== undefined && invitationIds.has(job.organizationInvitationId);
    const userMatches = args.userId !== undefined && job.userId === args.userId;
    const userNotificationCanBeCancelled =
      userMatches && (!args.preserveStaffNotificationsForUser || job.staffId === undefined);
    if (job.purpose === "billing" && !(args.includeBillingUserNotifications && userNotificationCanBeCancelled)) {
      continue;
    }
    const recipientInactive =
      (job.staffId !== undefined && staffIds.has(job.staffId)) || userNotificationCanBeCancelled;
    if (!invitationInactive && !recipientInactive) continue;

    if (
      await cancelActiveNotification(ctx, job, invitationInactive ? "invitation_inactive" : "recipient_inactive", now)
    ) {
      cancelledCount += 1;
    }
  }
  return { cancelledCount };
}

async function notificationBelongsToOrganization(
  ctx: MutationCtx,
  job: Doc<"notificationOutbox">,
  organizationId: Id<"organizations">,
) {
  // TODO[narrow]: 全deploymentでm037完走・scope readiness異常0確認後はorganizationIdだけを比較する。
  if (job.organizationId !== undefined) return job.organizationId === organizationId;
  if (!job.shopId) return false;
  const shop = await ctx.db.get(job.shopId);
  return shop?.organizationId === organizationId;
}

export const markSent = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    leaseToken: v.optional(v.string()),
    resendEmailId: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, leaseToken, resendEmailId }) => {
    const job = await ctx.db.get(outboxId);
    if (!hasCurrentProcessingLease(job, leaseToken)) return false;

    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "sent",
      sentAt: now,
      terminalAt: now,
      updatedAt: now,
      lastError: undefined,
      processingStartedAt: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      ...(resendEmailId ? { resendEmailId } : {}),
    });
    await updateNotificationHistorySendStatus(ctx, outboxId, { sendStatus: "sent", occurredAt: now });
    await resolveFailureInboxByOutbox(ctx, outboxId, { resolutionKind: "sent" });

    // dry-run等で実際には配送していないジョブは課金対象外なのでカウントしない（送信時と同じ最終ゲートで判定）
    if (isNotificationDeliverySuppressed({ suppressDelivery: notificationDeliverySuppressedForJob(job) })) return true;
    if (job.shopId) await incrementNotificationUsage(ctx, job.shopId, job.channel, now);
    return true;
  },
});

async function incrementNotificationUsage(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  channel: Doc<"notificationOutbox">["channel"],
  now: number,
) {
  const month = monthJST(now);
  const usage = await ctx.db
    .query("notificationUsage")
    .withIndex("by_shopId_month", (q) => q.eq("shopId", shopId).eq("month", month))
    .first();

  if (usage) {
    await ctx.db.patch(usage._id, {
      ...(channel === "email" ? { emailCount: usage.emailCount + 1 } : { lineCount: usage.lineCount + 1 }),
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("notificationUsage", {
    shopId,
    month,
    emailCount: channel === "email" ? 1 : 0,
    lineCount: channel === "line" ? 1 : 0,
    updatedAt: now,
  });
}

type NotificationEligibilityInput = {
  channel: NotificationChannel;
  shopId?: Id<"shops">;
  organizationId?: Id<"organizations">;
  organizationBillingVersionAtOrigin?: number;
  organizationBillingVersionAtEnqueue?: number;
  organizationInvitationId?: Id<"organizationInvitations">;
  organizationInvitationVersion?: number;
  purpose?: NotificationPurpose;
  dedupeKey?: string;
  recruitmentId?: Id<"recruitments">;
  fanoutTargetKey?: string;
  fanoutOperationId?: Id<"notificationFanoutOperations">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  payload: NotificationPayload;
  createdAt?: number;
};

type NotificationEligibility = {
  organizationId?: Id<"organizations">;
  organizationBillingVersion?: number;
  businessNotificationCutoffAt?: number;
  businessNotificationCutoffVersion?: number;
  cancelReason?: NotificationCancelReason;
};

function existingBelongsToNotificationScope(
  existing: Doc<"notificationOutbox">,
  notification: { shopId?: Id<"shops"> },
  organizationId?: Id<"organizations">,
) {
  if (organizationId && existing.organizationId === organizationId) return true;
  // TODO[narrow]: 全deploymentでm037完走・missingOrganizationId=0確認後にshop-only比較を削除する。
  return (
    existing.organizationId === undefined &&
    notification.shopId !== undefined &&
    existing.shopId === notification.shopId
  );
}

function predatesBusinessNotificationCutoff(
  notification: {
    organizationBillingVersionAtOrigin?: number;
    organizationBillingVersionAtEnqueue?: number;
    createdAt?: number;
  },
  cutoff: {
    businessNotificationCutoffAt?: number;
    businessNotificationCutoffVersion?: number;
  },
) {
  const notificationBillingVersion =
    notification.organizationBillingVersionAtEnqueue ?? notification.organizationBillingVersionAtOrigin;
  if (notificationBillingVersion !== undefined && cutoff.businessNotificationCutoffVersion !== undefined) {
    return notificationBillingVersion < cutoff.businessNotificationCutoffVersion;
  }
  if (
    notificationBillingVersion === undefined &&
    notification.createdAt === undefined &&
    cutoff.businessNotificationCutoffVersion !== undefined
  ) {
    // Widen前に予約済みのactionは操作発生時versionを持たないため、cutoff後は安全側で停止する。
    return true;
  }
  return (
    notificationBillingVersion === undefined &&
    notification.createdAt !== undefined &&
    cutoff.businessNotificationCutoffAt !== undefined &&
    notification.createdAt <= cutoff.businessNotificationCutoffAt
  );
}

async function getFanoutCancellationReason(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  recruitment: Doc<"recruitments"> | null,
): Promise<NotificationCancelReason | undefined> {
  // rolling deploy前の旧個別通知は受付時baselineを持たず、現在値との同一性を復元できない。
  if (notification.dedupeKey?.startsWith(`${notification.channel}:manualConfirmation:`)) {
    return "notification_superseded";
  }
  if (!notification.fanoutOperationId) {
    return await getLegacyConfirmationFanoutCancellationReason(ctx, notification, recruitment);
  }
  if (!notification.recruitmentId || !notification.shopId || !notification.staffId || !recruitment) {
    return "invalid_scope";
  }

  const operation = await ctx.db.get(notification.fanoutOperationId);
  if (
    !operation ||
    operation.recruitmentId !== notification.recruitmentId ||
    operation.shopId !== notification.shopId ||
    !operation.targetStaffIds.includes(notification.staffId) ||
    (notification.fanoutTargetKey !== undefined &&
      buildNotificationFanoutTargetKey(operation.operationKey, notification.staffId) !== notification.fanoutTargetKey)
  ) {
    return "invalid_scope";
  }

  if (operation.status === "cancelled") {
    return operation.cancelReason === "superseded" ? "notification_superseded" : "recruitment_inactive";
  }
  const expectedRecruitmentStatus = operation.kind === "recruitment" ? "open" : "confirmed";
  if (recruitment.status !== expectedRecruitmentStatus) return "recruitment_inactive";
  if (
    // TODO[narrow]: 全deploymentでm030完走・missingSupersedesActiveOperations=0確認後にfallbackを外す。
    (operation.supersedesActiveOperations ?? true) &&
    operation.kind === "confirmation" &&
    recruitment.lastConfirmationNotificationOperationKey !== undefined &&
    recruitment.lastConfirmationNotificationOperationKey !== operation.operationKey
  ) {
    return "notification_superseded";
  }
  if (isSupplementalConfirmationFanoutStale(operation, recruitment)) {
    return "notification_superseded";
  }
  return undefined;
}

async function getLegacyConfirmationFanoutCancellationReason(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  recruitment: Doc<"recruitments"> | null,
): Promise<NotificationCancelReason | undefined> {
  if (!notification.recruitmentId || !notification.staffId || !notification.dedupeKey || !recruitment) {
    return undefined;
  }
  const legacyConfirmationPrefix = `${notification.channel}:confirmation:${notification.recruitmentId}:${notification.staffId}:`;
  if (!notification.dedupeKey.startsWith(legacyConfirmationPrefix)) return undefined;

  const latestOperationKey = recruitment.lastConfirmationNotificationOperationKey;
  if (latestOperationKey === undefined) return undefined;
  const latestOperation = await ctx.db
    .query("notificationFanoutOperations")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", latestOperationKey))
    .unique();
  if (
    latestOperation?.kind !== "confirmation" ||
    latestOperation.recruitmentId !== notification.recruitmentId ||
    latestOperation.shopId !== notification.shopId ||
    !latestOperation.targetStaffIds.includes(notification.staffId) ||
    notification.dedupeKey !== `${legacyConfirmationPrefix}${latestOperation.dedupeSuffix}` ||
    (notification.fanoutTargetKey !== undefined &&
      buildNotificationFanoutTargetKey(latestOperation.operationKey, notification.staffId) !==
        notification.fanoutTargetKey)
  ) {
    return "notification_superseded";
  }
  if (latestOperation.status === "cancelled") {
    return latestOperation.cancelReason === "superseded" ? "notification_superseded" : "recruitment_inactive";
  }
  return recruitment.status === "confirmed" ? undefined : "recruitment_inactive";
}

async function getNotificationEligibility(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  now: number,
): Promise<NotificationEligibility> {
  // TODO[narrow]: 全deploymentでm024完走・missingPurpose=0確認後は保存済みjobのpurpose fallbackを削除する。
  const purpose = notification.purpose ?? "business";
  if (notification.channel !== notificationChannelForPayload(notification.payload)) {
    return { cancelReason: "unsupported_channel" };
  }
  if (
    !isManagerInvitationEnabled() &&
    notification.payload.kind === "email" &&
    notification.payload.context === "organizationInvitation.linked"
  ) {
    return { cancelReason: "invitation_inactive" };
  }
  const isInvitationPayload =
    notification.payload.kind === "organizationManagerInvitationEmail" ||
    notification.payload.kind === "organizationManagerInvitationLine";
  const hasInvitationId = notification.organizationInvitationId !== undefined;
  const hasInvitationVersion = notification.organizationInvitationVersion !== undefined;
  if (purpose === "billing" && notification.channel !== "email") {
    return { cancelReason: "unsupported_channel" };
  }
  if (
    hasInvitationId !== hasInvitationVersion ||
    isInvitationPayload !== (hasInvitationId && hasInvitationVersion) ||
    (isInvitationPayload && (purpose !== "business" || notification.organizationId === undefined))
  ) {
    return { cancelReason: "invalid_scope" };
  }
  if (!notification.shopId && !notification.organizationId) {
    return { cancelReason: "invalid_scope" };
  }

  const shop = notification.shopId ? await ctx.db.get(notification.shopId) : null;
  const organizationId = notification.organizationId ?? shop?.organizationId;
  if (notification.organizationId && shop?.organizationId && notification.organizationId !== shop.organizationId) {
    return { organizationId, cancelReason: "invalid_scope" };
  }
  if (purpose === "business" && notification.shopId) {
    // TODO[narrow]: 全deploymentでm025完走・missingOperatingStatus=0確認後はundefinedをactive扱いしない。
    if (!shop || shop.isDeleted || (shop.operatingStatus !== undefined && shop.operatingStatus !== "active")) {
      return { organizationId, cancelReason: "shop_inactive" };
    }
  }
  let recruitment: Doc<"recruitments"> | null = null;
  if (notification.recruitmentId) {
    recruitment = await ctx.db.get(notification.recruitmentId);
    if (!recruitment || recruitment.isDeleted) {
      return { organizationId, cancelReason: "recruitment_inactive" };
    }
    if (notification.shopId !== undefined && recruitment.shopId !== notification.shopId) {
      return { organizationId, cancelReason: "invalid_scope" };
    }
  }
  const fanoutReason = await getFanoutCancellationReason(ctx, notification, recruitment);
  if (fanoutReason) return { organizationId, cancelReason: fanoutReason };
  if (!organizationId) {
    // TODO[narrow]: 全deploymentでm025/m037完走・scope readiness異常0確認後にlegacy eligibilityを削除する。
    return notification.shopId
      ? await getLegacyShopRecipientEligibility(ctx, notification)
      : { cancelReason: "invalid_scope" };
  }

  const organization = await ctx.db.get(organizationId);
  if (!organization || organization.isDeleted) {
    return { organizationId, cancelReason: "organization_inactive" };
  }

  const billingStates = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(2);
  if (billingStates.length > 1) {
    return { organizationId, cancelReason: "invalid_scope" };
  }
  const billingState = billingStates[0] ?? null;
  if (
    purpose === "business" &&
    billingState &&
    deriveOrganizationBillingPolicy(billingState.state).businessWriteBlockReason === "restricted"
  ) {
    return { organizationId, cancelReason: "organization_restricted" };
  }
  const billingContext: NotificationEligibility = billingState
    ? {
        organizationId,
        organizationBillingVersion: billingState.version,
        ...(billingState.businessNotificationCutoffAt !== undefined
          ? { businessNotificationCutoffAt: billingState.businessNotificationCutoffAt }
          : {}),
        ...(billingState.businessNotificationCutoffVersion !== undefined
          ? { businessNotificationCutoffVersion: billingState.businessNotificationCutoffVersion }
          : {}),
      }
    : { organizationId };
  if (purpose === "billing" && notification.payload.kind === "email") {
    const expectedStateKind =
      BILLING_DEADLINE_CONTEXT_STATE[notification.payload.context as keyof typeof BILLING_DEADLINE_CONTEXT_STATE];
    const hasLegacyBusinessCopy =
      notification.payload.context.startsWith("organizationBilling.") &&
      (notification.payload.subject.includes("Businessプラン") || notification.payload.html.includes("Businessプラン"));
    if (
      (notification.organizationBillingVersionAtEnqueue !== undefined &&
        notification.organizationBillingVersionAtEnqueue !== billingState?.version) ||
      (expectedStateKind && billingState?.state.kind !== expectedStateKind) ||
      (hasLegacyBusinessCopy && (!billingState || !billingStateReferencesBusinessPlan(billingState.state)))
    ) {
      return { organizationId, cancelReason: "organization_billing_changed" };
    }
  }
  if (purpose === "business" && predatesBusinessNotificationCutoff(notification, billingContext)) {
    return { organizationId, cancelReason: "organization_billing_changed" };
  }

  if (isInvitationPayload) {
    const inviteReason = await getInvitationCancellationReason(ctx, notification, organizationId, now);
    return inviteReason ? { organizationId, cancelReason: inviteReason } : billingContext;
  }

  if (purpose === "billing" && !notification.userId) {
    return { organizationId, cancelReason: "invalid_scope" };
  }

  if (notification.staffId) {
    const staffReason = await getStaffRecipientCancellationReason(ctx, notification, organizationId);
    if (staffReason) return { organizationId, cancelReason: staffReason };
  }

  if (notification.userId) {
    const userReason = await getUserRecipientCancellationReason(
      ctx,
      notification,
      organizationId,
      billingState ? (getEffectiveRestrictedBillingState(billingState.state)?.recoveryManagerPersonIds ?? []) : [],
    );
    if (userReason) return { organizationId, cancelReason: userReason };
  }

  if (!notification.staffId && !notification.userId) {
    return { organizationId, cancelReason: "invalid_scope" };
  }

  return billingContext;
}

async function getLegacyShopRecipientEligibility(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
): Promise<NotificationEligibility> {
  if (notification.organizationInvitationId || notification.organizationInvitationVersion !== undefined) {
    return { cancelReason: "invalid_scope" };
  }
  if (notification.staffId) {
    const reason = await getStaffRecipientCancellationReason(ctx, notification);
    if (reason) return { cancelReason: reason };
  }
  if (notification.userId) {
    const reason = await getUserRecipientCancellationReason(ctx, notification);
    if (reason) return { cancelReason: reason };
  }
  return { cancelReason: notification.staffId || notification.userId ? undefined : "invalid_scope" };
}

async function getInvitationCancellationReason(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  organizationId: Id<"organizations">,
  now: number,
): Promise<NotificationCancelReason | undefined> {
  if (!isManagerInvitationEnabled()) return "invitation_inactive";

  if (
    notification.purpose === "billing" ||
    !notification.organizationInvitationId ||
    notification.organizationInvitationVersion === undefined ||
    !Number.isSafeInteger(notification.organizationInvitationVersion) ||
    notification.organizationInvitationVersion < 1 ||
    (notification.payload.kind !== "organizationManagerInvitationEmail" &&
      notification.payload.kind !== "organizationManagerInvitationLine")
  ) {
    return "invitation_inactive";
  }

  const invitation = await ctx.db.get(notification.organizationInvitationId);
  if (
    !invitation ||
    invitation.organizationId !== organizationId ||
    !isOrganizationInvitationIssued(invitation) ||
    invitation.expiresAt <= now ||
    invitation.version !== notification.organizationInvitationVersion
  ) {
    return "invitation_inactive";
  }

  if (
    notification.payload.kind === "organizationManagerInvitationEmail" &&
    normalizeEmail(invitation.emailNormalized) !== normalizeEmail(notification.payload.to)
  ) {
    return "invitation_inactive";
  }
  if (notification.payload.kind === "organizationManagerInvitationLine") {
    if (!notification.staffId || !invitation.targetPersonId) return "invitation_inactive";
    const staff = await ctx.db.get(notification.staffId);
    const lineAccount = staff ? await getStaffLineAccount(ctx, staff._id) : null;
    if (
      !staff ||
      staff.isDeleted ||
      staff.organizationId !== organizationId ||
      staff.organizationPersonId !== invitation.targetPersonId ||
      !lineAccount ||
      !lineAccount.following ||
      lineAccount.lineUserId !== notification.payload.toUserId
    ) {
      return "recipient_inactive";
    }
  }

  return (await resolveOrganizationInvitationEligibility(ctx, invitation)) ? undefined : "invitation_inactive";
}

async function getStaffRecipientCancellationReason(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  organizationId?: Id<"organizations">,
): Promise<NotificationCancelReason | undefined> {
  if (!notification.staffId) return undefined;
  const staff = await ctx.db.get(notification.staffId);
  if (
    !staff ||
    staff.isDeleted ||
    (notification.recruitmentId !== undefined && !isShiftTargetStaff(staff)) ||
    (notification.shopId !== undefined && staff.shopId !== notification.shopId) ||
    (organizationId !== undefined && staff.organizationId !== undefined && staff.organizationId !== organizationId)
  ) {
    return "recipient_inactive";
  }

  if (organizationId && staff.organizationPersonId) {
    const person = await ctx.db.get(staff.organizationPersonId);
    if (!person || person.organizationId !== organizationId || person.status !== "active") {
      return "recipient_inactive";
    }
    if (
      notification.payload.kind === "email" &&
      normalizeEmail(notification.payload.to) !== normalizeEmail(person.email)
    ) {
      return "recipient_inactive";
    }
  } else if (
    notification.payload.kind === "email" &&
    normalizeEmail(notification.payload.to) !== normalizeEmail(staff.email)
  ) {
    return "recipient_inactive";
  }

  if (notification.payload.kind === "line") {
    const lineAccount = await getStaffLineAccount(ctx, staff._id);
    if (
      !lineAccount ||
      lineAccount.isDeleted ||
      !lineAccount.following ||
      lineAccount.shopId !== staff.shopId ||
      lineAccount.lineUserId !== notification.payload.toUserId
    ) {
      return "recipient_inactive";
    }
  }
  return undefined;
}

async function getUserRecipientCancellationReason(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  organizationId?: Id<"organizations">,
  recoveryManagerPersonIds: Id<"organizationPeople">[] = [],
): Promise<NotificationCancelReason | undefined> {
  const userId = notification.userId;
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  if (!user || user.isDeleted) return "recipient_inactive";

  let person: Doc<"organizationPeople"> | null = null;
  let member: Doc<"organizationMembers"> | null = null;
  if (organizationId) {
    const [people, members] = await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
        .take(2),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", userId).eq("organizationId", organizationId))
        .take(2),
    ]);
    if (people.length > 1 || members.length > 1) return "recipient_inactive";
    person = people[0] ?? null;
    member = members[0] ?? null;

    if (member) {
      if (person && person._id !== member.personId) return "recipient_inactive";
      if (!person) {
        person = await ctx.db.get(member.personId);
      }
      if (
        !person ||
        person.organizationId !== organizationId ||
        person.userId !== userId ||
        person.status !== "active"
      ) {
        return "recipient_inactive";
      }
    } else if (person && (person.organizationId !== organizationId || person.status !== "active")) {
      return "recipient_inactive";
    }

    const isRecoveryRecipient =
      notification.purpose === "billing" &&
      member?.status === "readOnly" &&
      recoveryManagerPersonIds.includes(member.personId);
    const isHistoricalBillingRecipient =
      notification.purpose === "billing" &&
      member?.status === "readOnly" &&
      notification.payload.kind === "email" &&
      HISTORICAL_BILLING_RECIPIENT_CONTEXTS.has(notification.payload.context);
    if (member && member.status !== "active" && !isRecoveryRecipient && !isHistoricalBillingRecipient) {
      return "recipient_inactive";
    }
  }

  if (notification.payload.kind === "email") {
    const currentEmail = person?.email ?? user.email;
    if (normalizeEmail(notification.payload.to) !== normalizeEmail(currentEmail)) {
      return "recipient_inactive";
    }
  }

  const shopId = notification.shopId;
  if (notification.payload.kind === "line") {
    if (!shopId) return "recipient_inactive";
    const managerContact: ShopManagerContact =
      organizationId && person ? { kind: "canonical", user, person, organizationId } : { kind: "legacy", user };
    const managerStaff = await loadShopManagerStaffForContact(ctx, shopId, managerContact);
    if (!managerStaff) return "recipient_inactive";
    const lineAccount = await getStaffLineAccount(ctx, managerStaff._id);
    if (
      !lineAccount?.following ||
      lineAccount.shopId !== shopId ||
      lineAccount.lineUserId !== notification.payload.toUserId
    ) {
      return "recipient_inactive";
    }
  }

  const legacyShopMembers =
    !member && shopId
      ? await ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", userId).eq("shopId", shopId).eq("isDeleted", false),
          )
          .take(2)
      : [];
  if (!member && legacyShopMembers.length !== 1) return "recipient_inactive";
  return undefined;
}

async function findOrganizationBusinessNotificationsToCancel(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    cutoffAt: number;
    cutoffVersion: number;
  },
): Promise<Doc<"notificationOutbox">[]> {
  const jobs: Doc<"notificationOutbox">[] = [];
  const seen = new Set<Id<"notificationOutbox">>();
  const cutoff = {
    businessNotificationCutoffAt: args.cutoffAt,
    businessNotificationCutoffVersion: args.cutoffVersion,
  };

  // TODO[narrow]: 全deploymentでm024完走・missingPurpose=0確認後はbusiness indexだけを読む。
  for (const purpose of ["business", undefined] as const) {
    for (const status of ACTIVE_STATUSES) {
      const remaining = ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE - jobs.length;
      if (remaining === 0) return jobs;
      const candidates = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_organizationId_purpose_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("purpose", purpose).eq("status", status),
        )
        .take(remaining);
      for (const candidate of candidates) {
        if (seen.has(candidate._id) || !predatesBusinessNotificationCutoff(candidate, cutoff)) continue;
        seen.add(candidate._id);
        jobs.push(candidate);
      }
    }
  }

  // TODO[narrow]: 全deploymentでm037完走・scope readiness異常0確認後に、このWiden前shop scanを削除する。
  // Widen前に作られたshop-scoped行にはorganizationId/purposeがないため、店舗indexでも拾う。
  const shops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE);
  for (const shop of shops) {
    for (const status of ACTIVE_STATUSES) {
      const remaining = ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE - jobs.length;
      if (remaining === 0) return jobs;
      const candidates = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shop._id).eq("status", status))
        .filter((q) => q.and(q.eq(q.field("organizationId"), undefined), q.neq(q.field("purpose"), "billing")))
        .take(remaining);
      for (const candidate of candidates) {
        if (seen.has(candidate._id) || !predatesBusinessNotificationCutoff(candidate, cutoff)) continue;
        seen.add(candidate._id);
        jobs.push(candidate);
      }
    }
  }
  return jobs;
}

async function cancelActiveNotification(
  ctx: MutationCtx,
  job: Doc<"notificationOutbox">,
  cancelReason: NotificationCancelReason,
  now: number,
) {
  if (!ACTIVE_STATUSES.includes(job.status as (typeof ACTIVE_STATUSES)[number])) return false;
  await ctx.db.patch(job._id, {
    status: "cancelled",
    cancelledAt: now,
    terminalAt: now,
    cancelReason,
    processingStartedAt: undefined,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    updatedAt: now,
  });
  await updateNotificationHistorySendStatus(ctx, job._id, { sendStatus: "cancelled", occurredAt: now });
  await resolveFailureInboxByOutbox(ctx, job._id, { resolutionKind: "superseded" });
  return true;
}

/** 店舗削除cleanupから、通常の取消と同じterminal・Failure Inbox解決契約を適用する。 */
export async function cancelNotificationForInactiveShop(ctx: MutationCtx, job: Doc<"notificationOutbox">, now: number) {
  return await cancelActiveNotification(ctx, job, "shop_inactive", now);
}

/** 組織削除cleanupから、未送信通知を既存のterminal契約で停止する。 */
export async function cancelNotificationForInactiveOrganization(
  ctx: MutationCtx,
  job: Doc<"notificationOutbox">,
  now: number,
) {
  return await cancelActiveNotification(ctx, job, "organization_inactive", now);
}

export const markFailed = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    leaseToken: v.optional(v.string()),
    lastError: v.string(),
    errorName: v.optional(v.string()),
    suppressFailureInbox: v.optional(v.boolean()),
  },
  handler: async (ctx, { outboxId, leaseToken, lastError, suppressFailureInbox }) => {
    const job = await ctx.db.get(outboxId);
    const now = Date.now();
    if (!job) return false;
    if (!hasCurrentProcessingLease(job, leaseToken)) return false;
    const errorCode = safeStoredNotificationError(lastError);

    await ctx.db.patch(outboxId, {
      status: "failed",
      failedAt: now,
      terminalAt: now,
      updatedAt: now,
      lastError: errorCode,
      processingStartedAt: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    });
    await updateNotificationHistorySendStatus(ctx, outboxId, { sendStatus: "failed", occurredAt: now });
    const eventId = await insertDeliveryEvent(ctx, deliveryEventFromJob(job, "final_failed", errorCode));
    if (suppressFailureInbox || !job.shopId) return true;

    const notificationContext = notificationContextForJob(job);
    if (shouldSuppressNotificationFailureInbox(notificationContext)) return true;
    const identity = getNotificationFailureIdentity({
      shopId: job.shopId,
      recruitmentId: job.recruitmentId,
      staffId: job.staffId,
      notificationContext,
    });
    await upsertFailureInbox(ctx, {
      sourceType: "outbox",
      failureKey: identity?.failureKey ?? outboxFailureKey(outboxId),
      shopId: job.shopId,
      recruitmentId: job.recruitmentId,
      staffId: job.staffId,
      userId: job.userId,
      outboxId: job._id,
      channel: job.channel,
      dedupeKey: job.dedupeKey,
      notificationContext,
      attemptCount: job.attemptCount,
      lastFailedAt: now,
      lastEventId: eventId,
      lastError: errorCode,
    });
    return true;
  },
});

export const markRetry = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    leaseToken: v.optional(v.string()),
    lastError: v.string(),
    nextRunAt: v.number(),
    errorName: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, leaseToken, lastError, nextRunAt }) => {
    const job = await ctx.db.get(outboxId);
    if (!job) return false;
    if (!hasCurrentProcessingLease(job, leaseToken)) return false;

    const now = Date.now();
    const errorCode = safeStoredNotificationError(lastError);
    await ctx.db.patch(outboxId, {
      status: "pending",
      nextRunAt,
      updatedAt: now,
      lastError: errorCode,
      processingStartedAt: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    });
    await updateNotificationHistorySendStatus(ctx, outboxId, { sendStatus: "queued", occurredAt: now });
    await insertDeliveryEvent(ctx, deliveryEventFromJob(job, "retry_scheduled", errorCode, { nextRunAt }));
    return true;
  },
});

export const retryFailure = managerMutation({
  args: { failureId: v.id("notificationFailureInbox") },
  returns: failureResendResultValidator,
  handler: async (ctx, { failureId }) => {
    const failure = await ctx.db.get(failureId);
    if (!failure || failure.shopId !== ctx.shop._id || failure.status !== "open") {
      throw new ConvexError("Not found");
    }

    const latestFailure = await prepareFailureForResend(ctx, failure);
    return await retryOutboxFailure(ctx, latestFailure);
  },
});

export const resendFailure = managerMutation({
  args: { failureId: v.id("notificationFailureInbox") },
  returns: failureResendResultValidator,
  handler: async (ctx, { failureId }) => {
    const failure = await ctx.db.get(failureId);
    if (!failure || failure.shopId !== ctx.shop._id || failure.status !== "open") {
      throw new ConvexError("Not found");
    }

    const latestFailure = await prepareFailureForResend(ctx, failure);
    return await requestFailureResend(ctx, latestFailure);
  },
});

export const resendOpenFailures = managerMutation({
  args: {},
  returns: v.object({
    scheduled: v.boolean(),
    scheduledCount: v.number(),
    scheduledFailureIds: v.array(v.id("notificationFailureInbox")),
    skippedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    const failures = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", ctx.shop._id).eq("status", "open"))
      .order("desc")
      .take(FAILURE_RESEND_BATCH_SIZE);

    const scheduledFailureIds: Id<"notificationFailureInbox">[] = [];
    const handledFailureKeys = new Set<string>();
    let skippedCount = 0;
    for (const failure of failures) {
      if (!(await isManagerVisibleNotificationFailure(ctx, failure))) {
        skippedCount += 1;
        continue;
      }

      const failureKey = resendBatchKey(failure);
      if (handledFailureKeys.has(failureKey)) {
        skippedCount += 1;
        continue;
      }
      handledFailureKeys.add(failureKey);

      const latestFailure = await prepareFailureForResend(ctx, failure);
      const latestFailureKey = resendBatchKey(latestFailure);
      if (latestFailureKey !== failureKey) {
        if (handledFailureKeys.has(latestFailureKey)) {
          skippedCount += 1;
          continue;
        }
        handledFailureKeys.add(latestFailureKey);
      }

      const result = await requestFailureResend(ctx, latestFailure);
      if (result.scheduled) {
        scheduledFailureIds.push(latestFailure._id);
      } else {
        skippedCount += 1;
      }
    }

    return {
      scheduled: scheduledFailureIds.length > 0,
      scheduledCount: scheduledFailureIds.length,
      scheduledFailureIds,
      skippedCount,
      hasMore: failures.length === FAILURE_RESEND_BATCH_SIZE,
    };
  },
});

async function prepareFailureForResend(
  ctx: ManagerNotificationOutboxMutationCtx,
  failure: Doc<"notificationFailureInbox">,
) {
  const identity = getNotificationFailureIdentityForDoc(failure);
  if (!identity || !failure.staffId) return failure;

  const openDuplicates = await findOpenFailuresByIdentity(ctx, failure.staffId, identity.failureKey);
  if (openDuplicates.length === 0) return failure;

  const [latest, ...olderFailures] = [...openDuplicates].sort(sortFailureByRecencyDesc);
  const now = Date.now();

  for (const olderFailure of olderFailures) {
    await resolveSupersededFailureInbox(ctx, olderFailure, {
      now,
      reservedFailureKey: identity.failureKey,
    });
  }

  if (latest.failureKey === identity.failureKey) return latest;

  await ctx.db.patch(latest._id, {
    failureKey: identity.failureKey,
    updatedAt: now,
  });
  return { ...latest, failureKey: identity.failureKey, updatedAt: now };
}

async function requestFailureResend(
  ctx: ManagerNotificationOutboxMutationCtx,
  failure: Doc<"notificationFailureInbox">,
) {
  // LINE連携案内は sourceType を問わず、送信のたびに新しいマジックリンクを発行して送り直す。
  // （既存 outbox を再実行すると古いトークンを使い回してしまうため別経路にする）
  if (isLineInviteResendContext(failure.notificationContext)) {
    return await requestLineInviteResend(ctx, failure);
  }

  if (!(await hasOpenRecruitmentScope(ctx, failure))) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  if (failure.sourceType === "outbox") {
    return await retryOutboxFailure(ctx, failure, { throwOnNotFound: false });
  }

  if (failure.shopId !== ctx.shop._id || failure.status !== "open" || !failure.staffId || !failure.recruitmentId) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  const resendKind = getNotificationFailureResendKind(failure.notificationContext);
  if (!resendKind) return { scheduled: false, reason: "notRetryable" as const };

  const allowed = await allowFailureRetry(ctx, failure._id);
  if (!allowed) return { scheduled: false, reason: "rateLimited" as const };

  const staff = await ctx.db.get(failure.staffId);
  if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
    return { scheduled: false, reason: "notRetryable" as const };
  }
  const lineAccount = await getStaffLineAccount(ctx, staff._id);
  if (!staff.email && !(lineAccount?.lineUserId && lineAccount.following)) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  const now = Date.now();
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
  switch (resendKind) {
    case "recruitment":
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendRecruitmentNotificationForStaff, {
        recruitmentId: failure.recruitmentId,
        staffId: failure.staffId,
        notificationContext: failure.notificationContext,
        notificationRunId: now,
        ...notificationOrigin,
      });
      break;
    case "reminder":
      await ctx.scheduler.runAfter(0, internal.notification.reminderActions.sendReminderEmailForStaff, {
        recruitmentId: failure.recruitmentId,
        staffId: failure.staffId,
        notificationRunId: now,
        ...notificationOrigin,
      });
      break;
    case "confirmation":
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendShiftConfirmationEmails, {
        recruitmentId: failure.recruitmentId,
        isResend: true,
        targetStaffIds: [failure.staffId],
        notificationRunId: now,
        ...notificationOrigin,
      });
      break;
    case "reissue":
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendReissueEmail, {
        recruitmentId: failure.recruitmentId,
        staffId: failure.staffId,
        ...notificationOrigin,
      });
      break;
  }

  await markFailureRetrying(ctx, failure._id, now);
  return { scheduled: true as const };
}

async function requestLineInviteResend(
  ctx: ManagerNotificationOutboxMutationCtx,
  failure: Doc<"notificationFailureInbox">,
) {
  if (failure.shopId !== ctx.shop._id || failure.status !== "open" || !failure.staffId) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  const staff = await ctx.db.get(failure.staffId);
  // 連携依頼はメールで送るため、メール未登録のスタッフには再送できない。
  if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted || !staff.email) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  // 通常の個別連携依頼（line.mutations.sendInvite）と同じスタッフ単位のレートリミットを使い、
  // 一斉再通知で同一スタッフへ連携依頼メールが重複送信されるのを防ぐ。
  const { ok } = await rateLimit(ctx, {
    name: "lineInviteShort",
    key: `${ctx.shop._id}:${failure.staffId}`,
  });
  if (!ok) return { scheduled: false, reason: "rateLimited" as const };
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

  // sendInviteEmail は呼ぶたびに新しい連携トークン（マジックリンク）を発行して送り直す。
  await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
    staffId: failure.staffId,
    ...notificationOrigin,
  });
  await markFailureRetrying(ctx, failure._id, Date.now());
  return { scheduled: true as const };
}

async function retryOutboxFailure(
  ctx: ManagerNotificationOutboxMutationCtx,
  failure: Doc<"notificationFailureInbox">,
  opts: { throwOnNotFound?: boolean } = {},
) {
  const throwOnNotFound = opts.throwOnNotFound ?? true;
  if (
    failure.shopId !== ctx.shop._id ||
    failure.status !== "open" ||
    failure.sourceType !== "outbox" ||
    !failure.outboxId
  ) {
    if (!throwOnNotFound) return { scheduled: false, reason: "notRetryable" as const };
    throw new ConvexError("Not found");
  }

  const outbox = await ctx.db.get(failure.outboxId);
  if (!outbox || outbox.shopId !== ctx.shop._id || outbox.status !== "failed") {
    if (!throwOnNotFound) return { scheduled: false, reason: "notRetryable" as const };
    throw new ConvexError("Not found");
  }

  // payloadを破棄済みのterminal jobは配送に戻せない。quota消費やscope判定より前に
  // Inboxを期限切れ解決し、同じ失敗が再送候補として残り続けないようにする。
  if (outbox.payloadRedactedAt !== undefined) {
    await expireAndRedactFailureInbox(ctx, failure, Date.now());
    return { scheduled: false, reason: "notRetryable" as const };
  }

  if (!(await hasOpenRecruitmentScope(ctx, failure))) {
    return { scheduled: false, reason: "notRetryable" as const };
  }

  const allowed = await allowFailureRetry(ctx, failure._id);
  if (!allowed) return { scheduled: false, reason: "rateLimited" as const };

  const now = Date.now();
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
  await ctx.db.patch(outbox._id, {
    status: "pending",
    attemptCount: 0,
    nextRunAt: now,
    lastError: undefined,
    failedAt: undefined,
    processingStartedAt: undefined,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    sentAt: undefined,
    ...(outbox.purpose !== "billing" && notificationOrigin.organizationBillingVersionAtOrigin !== undefined
      ? { organizationBillingVersionAtEnqueue: notificationOrigin.organizationBillingVersionAtOrigin }
      : {}),
    updatedAt: now,
  });
  await updateNotificationHistorySendStatus(ctx, outbox._id, { sendStatus: "queued", occurredAt: now });
  await markFailureRetrying(ctx, failure._id, now);

  return { scheduled: true as const };
}

async function allowFailureRetry(ctx: ManagerNotificationOutboxMutationCtx, failureId: Id<"notificationFailureInbox">) {
  const { ok } = await rateLimit(ctx, {
    name: "notificationFailureRetryShort",
    key: `${ctx.shop._id}:${failureId}`,
  });
  return ok;
}

async function markFailureRetrying(
  ctx: ManagerNotificationOutboxMutationCtx,
  failureId: Id<"notificationFailureInbox">,
  now: number,
) {
  await ctx.db.patch(failureId, {
    status: "retrying",
    retryRequestedAt: now,
    retryRequestedByUserId: ctx.user._id,
    updatedAt: now,
  });
}

export const resolveFailure = managerMutation({
  args: { failureId: v.id("notificationFailureInbox") },
  returns: v.object({ resolved: v.literal(true) }),
  handler: async (ctx, { failureId }) => {
    const failure = await ctx.db.get(failureId);
    if (
      !failure ||
      failure.shopId !== ctx.shop._id ||
      failure.status !== "open" ||
      !(await isManagerVisibleNotificationFailure(ctx, failure))
    ) {
      throw new ConvexError("Not found");
    }

    await resolveFailureInbox(ctx, failure._id, {
      resolutionKind: "dismissed",
      resolvedByUserId: ctx.user._id,
    });

    return { resolved: true as const };
  },
});

export const deleteStaffNotificationHistoryBatch = internalMutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
  },
  handler: async (ctx, { shopId, staffId }) => {
    const histories = await ctx.db
      .query("notificationHistory")
      .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId).eq("staffId", staffId))
      .take(NOTIFICATION_HISTORY_DELETE_BATCH_SIZE);

    for (const history of histories) await ctx.db.delete(history._id);

    if (histories.length === NOTIFICATION_HISTORY_DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
        shopId,
        staffId,
      });
    }

    return { deletedCount: histories.length };
  },
});

export const pruneExpiredEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE);

    for (const event of expired) {
      await ctx.db.delete(event._id);
    }

    if (expired.length === NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.pruneExpiredEvents, {});
    }

    return { deletedCount: expired.length };
  },
});

export const redactExpiredTerminalData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS;
    const expired: Doc<"notificationOutbox">[] = [];

    for (const status of TERMINAL_STATUSES) {
      const remaining = NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE - expired.length;
      if (remaining <= 0) break;

      const jobs = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_payloadRedactedAt_terminalAt", (q) =>
          q.eq("status", status).eq("payloadRedactedAt", undefined).lte("terminalAt", cutoff),
        )
        .order("asc")
        .take(remaining);
      expired.push(...jobs);
    }

    for (const job of expired) {
      const notificationContext = notificationContextForJob(job);
      await ctx.db.patch(job._id, {
        notificationContext,
        deliverySuppressed: notificationDeliverySuppressedForJob(job),
        payload: redactNotificationPayload(job.payload, notificationContext),
        lastError: undefined,
        payloadRedactedAt: now,
        updatedAt: now,
      });
    }

    if (expired.length === NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.redactExpiredTerminalData, {});
    }

    return { redactedCount: expired.length };
  },
});

export const expireOldFailures = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS;
    const expired = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_sensitiveDataRedactedAt_lastFailedAt", (q) =>
        q.eq("sensitiveDataRedactedAt", undefined).lte("lastFailedAt", cutoff),
      )
      .order("asc")
      .take(NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE);

    for (const failure of expired) {
      await expireAndRedactFailureInbox(ctx, failure, now);
    }

    if (expired.length === NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.expireOldFailures, {});
    }

    return { expiredCount: expired.length };
  },
});

type DeliveryEventSharedInput = {
  shopId?: Id<"shops">;
  organizationId?: Id<"organizations">;
  organizationInvitationId?: Id<"organizationInvitations">;
  organizationInvitationVersion?: number;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  outboxId?: Id<"notificationOutbox">;
  channel?: Doc<"notificationOutbox">["channel"];
  dedupeKey?: string;
  notificationContext?: string;
  attemptCount?: number;
  nextRunAt?: number;
  provider?: Doc<"notificationDeliveryEvents">["provider"];
  providerEventId?: string;
  providerEmailId?: string;
  providerEventType?: Doc<"notificationDeliveryEvents">["providerEventType"];
};

type NotificationErrorDeliveryEventType = Exclude<
  Doc<"notificationDeliveryEvents">["eventType"],
  "provider_delivery_update"
>;

type DeliveryEventInput =
  | (DeliveryEventSharedInput & {
      eventType: NotificationErrorDeliveryEventType;
      errorMessage: string;
      errorName?: string;
    })
  | (DeliveryEventSharedInput & {
      eventType: "provider_delivery_update";
      errorMessage?: never;
      errorName?: never;
    });

type RecordResendProviderIssueArgs = {
  providerEventId: string;
  providerEventType: ResendProviderIssueEventType;
  providerEmailId: string;
  outboxIdTag?: string;
  occurredAt: number;
  errorMessage: string;
};

type RecordResendProviderDeliveryUpdateArgs = {
  providerEventId: string;
  providerEventType: Extract<ResendProviderEventType, "email.delivered">;
  providerEmailId: string;
  outboxIdTag?: string;
  occurredAt: number;
};

type EmailNotificationOutbox = Doc<"notificationOutbox"> & {
  channel: "email";
  payload: NotificationEmailPayload;
};

type FailureInboxUpsertInput = {
  sourceType: Doc<"notificationFailureInbox">["sourceType"];
  failureKey: string;
  shopId: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  outboxId?: Id<"notificationOutbox">;
  channel?: Doc<"notificationOutbox">["channel"];
  dedupeKey: string;
  notificationContext: string;
  attemptCount?: number;
  lastFailedAt: number;
  lastEventId?: Id<"notificationDeliveryEvents">;
  lastError: string;
  errorName?: string;
};

function resendProviderIssueDeliveryEventInput(
  args: RecordResendProviderIssueArgs,
  outbox: Doc<"notificationOutbox"> | null,
): DeliveryEventInput {
  const input: DeliveryEventInput = {
    eventType: "provider_delivery_issue",
    provider: "resend",
    providerEventId: args.providerEventId,
    providerEmailId: args.providerEmailId,
    providerEventType: args.providerEventType,
    errorMessage: args.errorMessage,
  };

  if (!outbox) return input;

  return {
    ...input,
    shopId: outbox.shopId,
    recruitmentId: outbox.recruitmentId,
    staffId: outbox.staffId,
    userId: outbox.userId,
    outboxId: outbox._id,
    channel: outbox.channel,
    dedupeKey: outbox.dedupeKey,
    notificationContext: notificationContextForJob(outbox),
    attemptCount: outbox.attemptCount,
  };
}

function resendProviderDeliveryUpdateEventInput(
  args: RecordResendProviderDeliveryUpdateArgs,
  outbox: Doc<"notificationOutbox"> | null,
): DeliveryEventInput {
  const input: DeliveryEventInput = {
    eventType: "provider_delivery_update",
    provider: "resend",
    providerEventId: args.providerEventId,
    providerEmailId: args.providerEmailId,
    providerEventType: args.providerEventType,
  };

  if (!outbox) return input;

  return {
    ...input,
    shopId: outbox.shopId,
    recruitmentId: outbox.recruitmentId,
    staffId: outbox.staffId,
    userId: outbox.userId,
    outboxId: outbox._id,
    channel: outbox.channel,
    dedupeKey: outbox.dedupeKey,
    notificationContext: notificationContextForJob(outbox),
    attemptCount: outbox.attemptCount,
  };
}

function isEmailNotificationOutbox(outbox: Doc<"notificationOutbox"> | null): outbox is EmailNotificationOutbox {
  return (
    outbox?.channel === "email" &&
    (outbox.payload.kind === "email" || outbox.payload.kind === "organizationManagerInvitationEmail")
  );
}

async function patchOutboxResendProviderState(
  ctx: MutationCtx,
  outbox: EmailNotificationOutbox,
  args: RecordResendProviderIssueArgs,
) {
  await ctx.db.patch(outbox._id, {
    ...(outbox.resendEmailId ? {} : { resendEmailId: args.providerEmailId }),
    resendLastEventType: args.providerEventType,
    resendLastEventAt: args.occurredAt,
    resendDeliveryStatus: resendProviderDeliveryStatus(args.providerEventType),
    updatedAt: Date.now(),
  });
}

async function patchOutboxResendProviderEventAt(
  ctx: MutationCtx,
  outbox: EmailNotificationOutbox,
  args: RecordResendProviderDeliveryUpdateArgs,
) {
  await ctx.db.patch(outbox._id, {
    ...(outbox.resendEmailId ? {} : { resendEmailId: args.providerEmailId }),
    resendLastEventAt: args.occurredAt,
    updatedAt: Date.now(),
  });
}

function resendProviderFailureInboxInput(
  outbox: EmailNotificationOutbox,
  args: RecordResendProviderIssueArgs,
  eventId: Id<"notificationDeliveryEvents">,
): FailureInboxUpsertInput | null {
  const notificationContext = notificationContextForJob(outbox);
  if (
    outbox.status === "cancelled" ||
    !outbox.shopId ||
    outbox.payload.suppressFailureInbox ||
    shouldSuppressNotificationFailureInbox(notificationContext)
  ) {
    return null;
  }

  const identity = getNotificationFailureIdentity({
    shopId: outbox.shopId,
    recruitmentId: outbox.recruitmentId,
    staffId: outbox.staffId,
    notificationContext,
  });

  return {
    sourceType: "provider",
    failureKey: identity?.failureKey ?? providerFailureKey(outbox._id),
    shopId: outbox.shopId,
    recruitmentId: outbox.recruitmentId,
    staffId: outbox.staffId,
    userId: outbox.userId,
    outboxId: outbox._id,
    channel: outbox.channel,
    dedupeKey: outbox.dedupeKey,
    notificationContext,
    attemptCount: outbox.attemptCount,
    lastFailedAt: args.occurredAt,
    lastEventId: eventId,
    lastError: args.errorMessage,
  };
}

async function insertDeliveryEvent(ctx: MutationCtx, input: DeliveryEventInput) {
  const now = Date.now();
  return await ctx.db.insert("notificationDeliveryEvents", {
    eventType: input.eventType,
    createdAt: now,
    expiresAt: now + NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
    ...(input.shopId ? { shopId: input.shopId } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.organizationInvitationId ? { organizationInvitationId: input.organizationInvitationId } : {}),
    ...(input.organizationInvitationVersion !== undefined
      ? { organizationInvitationVersion: input.organizationInvitationVersion }
      : {}),
    ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
    ...(input.staffId ? { staffId: input.staffId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.outboxId ? { outboxId: input.outboxId } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.notificationContext ? { notificationContext: input.notificationContext } : {}),
    ...(input.attemptCount !== undefined ? { attemptCount: input.attemptCount } : {}),
    ...(input.nextRunAt !== undefined ? { nextRunAt: input.nextRunAt } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerEventId ? { providerEventId: input.providerEventId } : {}),
    ...(input.providerEmailId ? { providerEmailId: input.providerEmailId } : {}),
    ...(input.providerEventType ? { providerEventType: input.providerEventType } : {}),
    ...(input.eventType === "provider_delivery_update"
      ? {}
      : {
          errorMessage: truncateErrorMessage(
            safeStoredNotificationError(input.errorMessage, fallbackErrorCodeForEvent(input.eventType)),
          ),
        }),
  });
}

async function upsertFailureInbox(ctx: MutationCtx, input: FailureInboxUpsertInput) {
  const now = Date.now();
  const failuresByKey = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_failureKey", (q) => q.eq("failureKey", input.failureKey))
    .take(FAILURE_DUPLICATE_SCAN_LIMIT);
  const failure = selectReusableFailure(failuresByKey);
  const commonPatch = {
    sourceType: input.sourceType,
    status: "open" as const,
    shopId: input.shopId,
    recruitmentId: input.recruitmentId,
    staffId: input.staffId,
    userId: input.userId,
    outboxId: input.outboxId,
    channel: input.channel,
    dedupeKey: input.dedupeKey,
    notificationContext: input.notificationContext,
    lastFailedAt: input.lastFailedAt,
    lastEventId: input.lastEventId,
    attemptCount: input.attemptCount,
    lastError: truncateErrorMessage(safeStoredNotificationError(input.lastError)),
    errorName: undefined,
    sensitiveDataRedactedAt: undefined,
    retryRequestedAt: undefined,
    retryRequestedByUserId: undefined,
    resolvedAt: undefined,
    resolvedByUserId: undefined,
    resolutionKind: undefined,
    updatedAt: now,
  };

  let failureId: Id<"notificationFailureInbox">;
  if (failure) {
    await ctx.db.patch(failure._id, commonPatch);
    failureId = failure._id;
  } else {
    failureId = await ctx.db.insert("notificationFailureInbox", {
      failureKey: input.failureKey,
      ...commonPatch,
      firstFailedAt: input.lastFailedAt,
      createdAt: now,
    });
  }

  await resolveSupersededOpenFailures(ctx, input, failureId, now);
  return failureId;
}

async function resolveFailureInboxByOutbox(
  ctx: MutationCtx,
  outboxId: Id<"notificationOutbox">,
  args: { resolutionKind: "sent" | "dismissed" | "superseded"; resolvedByUserId?: Id<"users"> },
) {
  const failuresByOutbox = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_outboxId", (q) => q.eq("outboxId", outboxId))
    .take(FAILURE_DUPLICATE_SCAN_LIMIT);
  const failuresByLegacyKey = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_failureKey", (q) => q.eq("failureKey", outboxFailureKey(outboxId)))
    .take(FAILURE_DUPLICATE_SCAN_LIMIT);
  const seen = new Set<Id<"notificationFailureInbox">>();
  for (const failure of [...failuresByOutbox, ...failuresByLegacyKey]) {
    if (seen.has(failure._id) || failure.sourceType !== "outbox" || failure.resolutionKind === "superseded") continue;
    seen.add(failure._id);
    await resolveFailureInbox(ctx, failure._id, args);
  }
}

async function resolveProviderFailureInboxByOutbox(
  ctx: MutationCtx,
  outboxId: Id<"notificationOutbox">,
  deliveredAt: number,
) {
  const failures = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_outboxId", (q) => q.eq("outboxId", outboxId))
    .take(FAILURE_DUPLICATE_SCAN_LIMIT);

  for (const failure of failures) {
    if (failure.sourceType !== "provider" || failure.status !== "open" || failure.lastFailedAt > deliveredAt) continue;
    await resolveFailureInbox(ctx, failure._id, { resolutionKind: "sent" });
  }
}

async function resolveFailureInbox(
  ctx: MutationCtx,
  failureId: Id<"notificationFailureInbox">,
  args: { resolutionKind: "sent" | "dismissed" | "superseded"; resolvedByUserId?: Id<"users"> },
) {
  const now = Date.now();
  await ctx.db.patch(failureId, {
    status: "resolved",
    resolvedAt: now,
    resolvedByUserId: args.resolvedByUserId,
    resolutionKind: args.resolutionKind,
    updatedAt: now,
  });
}

async function expireAndRedactFailureInbox(ctx: MutationCtx, failure: Doc<"notificationFailureInbox">, now: number) {
  const shouldExpire = FAILURE_EXPIRE_TARGET_STATUSES.includes(
    failure.status as (typeof FAILURE_EXPIRE_TARGET_STATUSES)[number],
  );
  await ctx.db.patch(failure._id, {
    ...(shouldExpire
      ? {
          status: "resolved" as const,
          resolvedAt: now,
          resolvedByUserId: undefined,
          resolutionKind: "expired" as const,
        }
      : {}),
    lastError: undefined,
    errorName: undefined,
    lastEventId: undefined,
    sensitiveDataRedactedAt: now,
    updatedAt: now,
  });
}

function deliveryEventFromJob(
  job: Doc<"notificationOutbox">,
  eventType: NotificationErrorDeliveryEventType,
  errorMessage: string,
  extra: { nextRunAt?: number; errorName?: string } = {},
): DeliveryEventInput {
  return {
    eventType,
    shopId: job.shopId,
    recruitmentId: job.recruitmentId,
    staffId: job.staffId,
    userId: job.userId,
    outboxId: job._id,
    channel: job.channel,
    dedupeKey: job.dedupeKey,
    notificationContext: notificationContextForJob(job),
    attemptCount: job.attemptCount,
    ...extra,
    errorMessage,
  };
}

// 分析KPIのbounded集計でも通知種別の分類に再利用する
export function notificationContextForJob(job: Doc<"notificationOutbox">) {
  // TODO[narrow]: 全deploymentのm024完走と3 field欠損0確認後にpayload fallbackを削除する。
  return job.notificationContext ?? notificationContextForPayload(job.payload, job.dedupeKey);
}

export function notificationDeliverySuppressedForJob(job: Doc<"notificationOutbox">) {
  // TODO[narrow]: 全deploymentのm024完走と3 field欠損0確認後にpayload fallbackを削除する。
  return job.deliverySuppressed ?? notificationDeliverySuppressedForPayload(job.payload);
}

function dedupeContext(dedupeKey: string) {
  return dedupeKey.split(":").slice(0, 2).join(":");
}

function outboxFailureKey(outboxId: Id<"notificationOutbox">) {
  return `outbox:${outboxId}`;
}

function providerFailureKey(outboxId: Id<"notificationOutbox">) {
  return `provider:resend:${outboxId}`;
}

function enqueueFailureKey(sourceType: "enqueue" | "enqueue_preparation", shopId: Id<"shops">, dedupeKey: string) {
  return `${sourceType}:${shopId}:${dedupeKey}`;
}

async function findOutboxForResendProviderEvent(
  ctx: MutationCtx,
  providerEmailId: string,
  outboxIdTag: string | undefined,
) {
  const outboxByEmailId = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", providerEmailId))
    .first();
  if (outboxByEmailId) return outboxByEmailId;

  if (!outboxIdTag) return null;
  const outboxId = ctx.db.normalizeId("notificationOutbox", outboxIdTag);
  if (!outboxId) return null;
  const outboxByTag = await ctx.db.get(outboxId);
  if (outboxByTag?.resendEmailId && outboxByTag.resendEmailId !== providerEmailId) return null;
  return outboxByTag;
}

function truncateErrorMessage(message: string) {
  if (message.length <= DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH) return message;
  return `${message.slice(0, DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH - 14)}...<truncated>`;
}

function fallbackErrorCodeForEvent(eventType: NotificationErrorDeliveryEventType): SafeNotificationErrorCode {
  if (eventType === "enqueue_failed") return "notification_enqueue_failed";
  if (eventType === "enqueue_preparation_failed") return "notification_preparation_failed";
  if (eventType === "worker_failed") return "notification_worker_failed";
  if (eventType === "provider_delivery_issue") return "email_delivery_failed";
  return "notification_delivery_failed";
}

function resendProviderIssueErrorCode(providerEventType: ResendProviderIssueEventType): SafeNotificationErrorCode {
  if (providerEventType === "email.delivery_delayed") return "email_delivery_delayed";
  if (providerEventType === "email.bounced") return "email_delivery_bounced";
  if (providerEventType === "email.suppressed") return "email_delivery_suppressed";
  return "email_delivery_failed";
}

async function resolveSupersededOpenFailures(
  ctx: MutationCtx,
  input: FailureInboxUpsertInput,
  activeFailureId: Id<"notificationFailureInbox">,
  now: number,
) {
  const identity = getNotificationFailureIdentity(input);
  if (!identity || !input.staffId) return;

  const duplicates = await findOpenFailuresByIdentity(ctx, input.staffId, identity.failureKey);
  for (const duplicate of duplicates) {
    if (duplicate._id === activeFailureId) continue;
    await resolveSupersededFailureInbox(ctx, duplicate, {
      now,
      reservedFailureKey: identity.failureKey,
    });
  }
}

async function findOpenFailuresByIdentity(ctx: Pick<MutationCtx, "db">, staffId: Id<"staffs">, identityKey: string) {
  const failures = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_staffId_status_lastFailedAt", (q) => q.eq("staffId", staffId).eq("status", "open"))
    .order("desc")
    .take(FAILURE_DUPLICATE_SCAN_LIMIT);

  return failures.filter((failure) => getNotificationFailureIdentityForDoc(failure)?.failureKey === identityKey);
}

async function resolveSupersededFailureInbox(
  ctx: Pick<MutationCtx, "db">,
  failure: Doc<"notificationFailureInbox">,
  args: { now: number; reservedFailureKey: string },
) {
  await ctx.db.patch(failure._id, {
    ...(failure.failureKey === args.reservedFailureKey ? { failureKey: supersededFailureKey(failure) } : {}),
    status: "resolved",
    resolvedAt: args.now,
    resolutionKind: "superseded",
    updatedAt: args.now,
  });
}

function selectReusableFailure(failures: Doc<"notificationFailureInbox">[]) {
  const reusable = failures.filter((failure) => !["superseded", "expired"].includes(failure.resolutionKind ?? ""));
  if (reusable.length > 0) return [...reusable].sort(sortFailureByRecencyDesc)[0] ?? null;

  const superseded = failures.filter((failure) => failure.resolutionKind === "superseded");
  return [...superseded].sort(sortFailureByRecencyDesc)[0] ?? null;
}

function sortFailureByRecencyDesc(a: Doc<"notificationFailureInbox">, b: Doc<"notificationFailureInbox">) {
  return (
    b.lastFailedAt - a.lastFailedAt ||
    b.updatedAt - a.updatedAt ||
    b._creationTime - a._creationTime ||
    b._id.localeCompare(a._id)
  );
}

function resendBatchKey(failure: Doc<"notificationFailureInbox">) {
  const identityKey = getNotificationFailureIdentityForDoc(failure)?.failureKey;
  if (identityKey) return identityKey;
  // LINE連携案内は募集に紐づかず論理キーを持たないため、一斉再通知で同一スタッフの
  // 複数行を1回にまとめられるようスタッフ単位のキーを返す。
  if (isLineInviteResendContext(failure.notificationContext) && failure.staffId) {
    return `lineInvite:${failure.shopId}:${failure.staffId}`;
  }
  return `failure:${failure._id}`;
}
