import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { monthJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { isNotificationDeliverySuppressed } from "../_lib/notificationDelivery";
import { rateLimit } from "../_lib/rateLimits";
import {
  NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE,
  NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
  NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE,
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE,
} from "../constants";
import { getStaffLineAccount } from "../line/service";
import { deriveOrganizationBillingPolicy, getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import { resolveOrganizationInvitationEligibility } from "../organizationInvitation/service";
import { hasOpenRecruitmentScope, isManagerVisibleNotificationFailure } from "./failureEligibility";
import {
  getNotificationFailureIdentity,
  getNotificationFailureIdentityForDoc,
  supersededFailureKey,
} from "./failureIdentity";
import { getNotificationFailureResendKind, isLineInviteResendContext } from "./failureResend";
import { shouldSuppressNotificationFailureInbox } from "./failureSuppress";
import { getBusinessNotificationOrigin } from "./origin";
import { type ResendProviderIssueEventType, resendProviderDeliveryStatus } from "./resendProviderEvents";
import {
  notificationChannelValidator,
  notificationDeliveryEventTypeValidator,
  notificationPayloadValidator,
  notificationPurposeValidator,
  resendProviderIssueEventTypeValidator,
} from "./schemas";
import type {
  NotificationCancelReason,
  NotificationChannel,
  NotificationEmailPayload,
  NotificationPayload,
  NotificationPurpose,
} from "./types";
import { notificationChannelForPayload } from "./types";

const ACTIVE_STATUSES = ["pending", "processing"] as const;
const DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH = 2_000;
const FAILURE_RESEND_BATCH_SIZE = 50;
const FAILURE_DUPLICATE_SCAN_LIMIT = 50;
const FAILURE_EXPIRE_TARGET_STATUSES = ["open", "retrying"] as const;
const ORGANIZATION_NOTIFICATION_CANCEL_BATCH_SIZE = 100;
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

export const enqueue = internalMutation({
  args: {
    channel: notificationChannelValidator,
    shopId: v.optional(v.id("shops")),
    organizationId: v.optional(v.id("organizations")),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
    organizationInvitationId: v.optional(v.id("organizationInvitations")),
    organizationInvitationVersion: v.optional(v.number()),
    purpose: v.optional(notificationPurposeValidator),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    dedupeKey: v.string(),
    payload: notificationPayloadValidator,
  },
  handler: async (ctx, args) => {
    if (args.channel !== notificationChannelForPayload(args.payload)) {
      throw new ConvexError("Notification channel does not match payload");
    }

    const now = Date.now();
    const purpose = args.purpose ?? "business";
    const eligibility = await getNotificationEligibility(ctx, { ...args, purpose }, now);
    if (eligibility.cancelReason) {
      if (eligibility.cancelReason !== "unsupported_channel" && eligibility.cancelReason !== "invalid_scope") {
        return null;
      }
      throw new ConvexError("Notification cannot be enqueued");
    }

    // worker が別ジョブの status を高頻度に更新するため、enqueue の読み取りは dedupeKey 単位に絞る。
    for (const status of ACTIVE_STATUSES) {
      const existing = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", args.dedupeKey).eq("status", status))
        .first();
      if (existing) {
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
      payload: args.payload,
      attemptCount: 0,
      nextRunAt: now + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
      createdAt: now,
      updatedAt: now,
    });
    return { outboxId, deduped: false };
  },
});

export const recordDeliveryEvent = internalMutation({
  args: {
    eventType: notificationDeliveryEventTypeValidator,
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
    const eventId = await insertDeliveryEvent(ctx, args);
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
      lastError: args.errorMessage,
      errorName: args.errorName,
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
    const existingEvent = await ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_providerEventId", (q) => q.eq("providerEventId", args.providerEventId))
      .first();
    if (existingEvent) return { recorded: false as const, reason: "duplicate" as const };

    const outbox = await findOutboxForResendProviderIssue(ctx, args.providerEmailId, args.outboxIdTag);
    const eventId = await insertDeliveryEvent(ctx, resendProviderIssueDeliveryEventInput(args, outbox));

    if (!isEmailNotificationOutbox(outbox)) {
      return { recorded: true as const, inboxed: false as const, reason: "outboxNotFound" as const };
    }

    await patchOutboxResendProviderState(ctx, outbox, args);

    const inboxInput = resendProviderFailureInboxInput(outbox, args, eventId);
    if (!inboxInput) {
      return { recorded: true as const, inboxed: false as const, reason: "suppressed" as const };
    }

    const failureId = await upsertFailureInbox(ctx, inboxInput);

    return { recorded: true as const, inboxed: true as const, failureId };
  },
});

export const claimDue = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const jobs = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_nextRunAt", (q) => q.eq("status", "pending").lte("nextRunAt", now))
      .order("asc")
      .take(NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE);

    const claimed = [];
    for (const job of jobs) {
      const nextAttemptCount = job.attemptCount + 1;
      await ctx.db.patch(job._id, {
        status: "processing",
        attemptCount: nextAttemptCount,
        processingStartedAt: now,
        updatedAt: now,
      });
      claimed.push({
        ...job,
        status: "processing" as const,
        attemptCount: nextAttemptCount,
        processingStartedAt: now,
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
  args: { outboxId: v.id("notificationOutbox"), now: v.number() },
  handler: async (ctx, { outboxId, now }) => {
    const job = await ctx.db.get(outboxId);
    if (job?.status !== "processing") return null;

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
  args: { outboxId: v.id("notificationOutbox"), now: v.number() },
  handler: async (ctx, { outboxId, now }) => {
    const job = await ctx.db.get(outboxId);
    if (job?.status !== "processing") return null;

    const eligibility = await getNotificationEligibility(ctx, job, now);
    if (eligibility.cancelReason) {
      await cancelActiveNotification(ctx, job, eligibility.cancelReason, now);
      return null;
    }
    if (
      job.payload.kind !== "organizationManagerInvitationEmail" ||
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
  },
) {
  const candidates = new Map<Id<"notificationOutbox">, Doc<"notificationOutbox">>();
  const staffIds = new Set(args.staffIds ?? []);
  const invitationIds = new Set(args.invitationIds ?? []);

  for (const status of ACTIVE_STATUSES) {
    for (const staffId of staffIds) {
      const jobs = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_staffId_status", (q) => q.eq("staffId", staffId).eq("status", status))
        .collect();
      for (const job of jobs) candidates.set(job._id, job);
    }
    if (args.userId) {
      const jobs = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", status))
        .collect();
      for (const job of jobs) candidates.set(job._id, job);
    }
    if (invitationIds.size > 0) {
      for (const purpose of ["business", undefined] as const) {
        const jobs = await ctx.db
          .query("notificationOutbox")
          .withIndex("by_organizationId_purpose_status", (q) =>
            q.eq("organizationId", args.organizationId).eq("purpose", purpose).eq("status", status),
          )
          .collect();
        for (const job of jobs) {
          if (job.organizationInvitationId && invitationIds.has(job.organizationInvitationId)) {
            candidates.set(job._id, job);
          }
        }
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
  if (job.organizationId !== undefined) return job.organizationId === organizationId;
  if (!job.shopId) return false;
  const shop = await ctx.db.get(job.shopId);
  return shop?.organizationId === organizationId;
}

export const markSent = internalMutation({
  args: { outboxId: v.id("notificationOutbox"), resendEmailId: v.optional(v.string()) },
  handler: async (ctx, { outboxId, resendEmailId }) => {
    const job = await ctx.db.get(outboxId);
    if (!job) return;

    // cancellationだけは、遅れて完了したworkerで上書きしない。
    if (job.status === "cancelled") return;
    const wasSent = job.status === "sent";

    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
      lastError: undefined,
      ...(resendEmailId ? { resendEmailId } : {}),
    });
    await resolveFailureInboxByOutbox(ctx, outboxId, { resolutionKind: "sent" });

    // actionリトライ等で再実行されても使用量を二重カウントしない。
    if (wasSent) return;
    // dry-run等で実際には配送していないジョブは課金対象外なのでカウントしない（送信時と同じ最終ゲートで判定）
    if (isNotificationDeliverySuppressed({ suppressDelivery: job.payload.suppressDelivery })) return;
    if (job.shopId) await incrementNotificationUsage(ctx, job.shopId, job.channel, now);
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

async function getNotificationEligibility(
  ctx: MutationCtx,
  notification: NotificationEligibilityInput,
  now: number,
): Promise<NotificationEligibility> {
  const purpose = notification.purpose ?? "business";
  if (notification.channel !== notificationChannelForPayload(notification.payload)) {
    return { cancelReason: "unsupported_channel" };
  }
  const isInvitationPayload = notification.payload.kind === "organizationManagerInvitationEmail";
  const hasInvitationId = notification.organizationInvitationId !== undefined;
  const hasInvitationVersion = notification.organizationInvitationVersion !== undefined;
  if ((purpose === "billing" || hasInvitationId || hasInvitationVersion) && notification.channel !== "email") {
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
    if (!shop || shop.isDeleted || (shop.operatingStatus !== undefined && shop.operatingStatus !== "active")) {
      return { organizationId, cancelReason: "shop_inactive" };
    }
  }
  if (!organizationId) {
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
    if (
      expectedStateKind &&
      (billingState?.state.kind !== expectedStateKind ||
        (notification.organizationBillingVersionAtEnqueue !== undefined &&
          notification.organizationBillingVersionAtEnqueue !== billingState.version))
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
  if (
    notification.purpose === "billing" ||
    !notification.organizationInvitationId ||
    notification.organizationInvitationVersion === undefined ||
    !Number.isSafeInteger(notification.organizationInvitationVersion) ||
    notification.organizationInvitationVersion < 1 ||
    notification.payload.kind !== "organizationManagerInvitationEmail"
  ) {
    return "invitation_inactive";
  }

  const invitation = await ctx.db.get(notification.organizationInvitationId);
  if (
    !invitation ||
    invitation.organizationId !== organizationId ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= now ||
    invitation.version !== notification.organizationInvitationVersion ||
    normalizeEmail(invitation.emailNormalized) !== normalizeEmail(notification.payload.to)
  ) {
    return "invitation_inactive";
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
    cancelReason,
    processingStartedAt: undefined,
    updatedAt: now,
  });
  await resolveFailureInboxByOutbox(ctx, job._id, { resolutionKind: "superseded" });
  return true;
}

/** 店舗削除cleanupから、通常の取消と同じterminal・Failure Inbox解決契約を適用する。 */
export async function cancelNotificationForInactiveShop(ctx: MutationCtx, job: Doc<"notificationOutbox">, now: number) {
  return await cancelActiveNotification(ctx, job, "shop_inactive", now);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const markFailed = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    lastError: v.string(),
    errorName: v.optional(v.string()),
    suppressFailureInbox: v.optional(v.boolean()),
  },
  handler: async (ctx, { outboxId, lastError, errorName, suppressFailureInbox }) => {
    const job = await ctx.db.get(outboxId);
    const now = Date.now();
    if (!job) {
      await insertDeliveryEvent(ctx, {
        eventType: "worker_failed",
        outboxId,
        errorMessage: `notificationOutbox job not found while marking failed: ${lastError}`,
      });
      return;
    }
    if (job.status === "cancelled") return;

    await ctx.db.patch(outboxId, {
      status: "failed",
      failedAt: now,
      updatedAt: now,
      lastError,
    });
    const eventId = await insertDeliveryEvent(ctx, deliveryEventFromJob(job, "final_failed", lastError, { errorName }));
    if (suppressFailureInbox || !job.shopId) return;

    const notificationContext = notificationContextForJob(job);
    if (shouldSuppressNotificationFailureInbox(notificationContext)) return;
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
      lastError,
      errorName,
    });
  },
});

export const markRetry = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    lastError: v.string(),
    nextRunAt: v.number(),
    errorName: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, lastError, nextRunAt, errorName }) => {
    const job = await ctx.db.get(outboxId);
    if (!job) {
      await insertDeliveryEvent(ctx, {
        eventType: "worker_failed",
        outboxId,
        errorMessage: `notificationOutbox job not found while scheduling retry: ${lastError}`,
      });
      return;
    }
    if (job.status === "cancelled") return;

    await ctx.db.patch(outboxId, {
      status: "pending",
      nextRunAt,
      updatedAt: Date.now(),
      lastError,
    });
    await insertDeliveryEvent(ctx, deliveryEventFromJob(job, "retry_scheduled", lastError, { nextRunAt, errorName }));
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
    sentAt: undefined,
    ...(outbox.purpose !== "billing" && notificationOrigin.organizationBillingVersionAtOrigin !== undefined
      ? { organizationBillingVersionAtEnqueue: notificationOrigin.organizationBillingVersionAtOrigin }
      : {}),
    updatedAt: now,
  });
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

export const expireOldFailures = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS;
    const expired: Doc<"notificationFailureInbox">[] = [];

    for (const status of FAILURE_EXPIRE_TARGET_STATUSES) {
      const remaining = NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE - expired.length;
      if (remaining <= 0) break;

      const failures = await ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_status_firstFailedAt", (q) => q.eq("status", status).lte("firstFailedAt", cutoff))
        .order("asc")
        .take(remaining);
      expired.push(...failures);
    }

    for (const failure of expired) {
      await ctx.db.patch(failure._id, {
        status: "resolved",
        resolvedAt: now,
        resolvedByUserId: undefined,
        resolutionKind: "expired",
        updatedAt: now,
      });
    }

    if (expired.length === NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.expireOldFailures, {});
    }

    return { expiredCount: expired.length };
  },
});

type DeliveryEventInput = {
  eventType: Doc<"notificationDeliveryEvents">["eventType"];
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
  errorMessage: string;
  errorName?: string;
};

type RecordResendProviderIssueArgs = {
  providerEventId: string;
  providerEventType: ResendProviderIssueEventType;
  providerEmailId: string;
  outboxIdTag?: string;
  occurredAt: number;
  errorMessage: string;
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

function isEmailNotificationOutbox(outbox: Doc<"notificationOutbox"> | null): outbox is EmailNotificationOutbox {
  return outbox?.channel === "email" && outbox.payload.kind !== "line";
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
    errorMessage: truncateErrorMessage(input.errorMessage),
    ...(input.errorName ? { errorName: input.errorName } : {}),
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
    lastError: truncateErrorMessage(input.lastError),
    errorName: input.errorName,
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

function deliveryEventFromJob(
  job: Doc<"notificationOutbox">,
  eventType: Doc<"notificationDeliveryEvents">["eventType"],
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

// 分析KPI（analytics/dailyAggregation）でも通知種別の分類に再利用する
export function notificationContextForJob(job: Doc<"notificationOutbox">) {
  if (job.payload.kind !== "line") return job.payload.context;
  return job.payload.fallbackEmail?.payload.context ?? dedupeContext(job.dedupeKey);
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

async function findOutboxForResendProviderIssue(
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
