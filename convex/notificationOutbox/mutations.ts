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
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE,
} from "../constants";
import {
  notificationChannelValidator,
  notificationDeliveryEventTypeValidator,
  notificationPayloadValidator,
} from "./schemas";

const ACTIVE_STATUSES = ["pending", "processing"] as const;
const DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH = 2_000;

export const enqueue = internalMutation({
  args: {
    channel: notificationChannelValidator,
    shopId: v.id("shops"),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    dedupeKey: v.string(),
    payload: notificationPayloadValidator,
  },
  handler: async (ctx, args) => {
    if (args.channel !== args.payload.kind) {
      throw new ConvexError("Notification channel does not match payload");
    }

    const now = Date.now();
    // worker が別ジョブの status を高頻度に更新するため、enqueue の読み取りは dedupeKey 単位に絞る。
    for (const status of ACTIVE_STATUSES) {
      const existing = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", args.dedupeKey).eq("status", status))
        .first();
      if (existing) {
        return { outboxId: existing._id, deduped: true };
      }
    }

    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: args.channel,
      status: "pending",
      dedupeKey: args.dedupeKey,
      shopId: args.shopId,
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
    await upsertFailureInbox(ctx, {
      sourceType,
      failureKey: enqueueFailureKey(sourceType, args.shopId, args.dedupeKey),
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      userId: args.userId,
      outboxId: args.outboxId,
      channel: args.channel,
      dedupeKey: args.dedupeKey,
      notificationContext: args.notificationContext ?? dedupeContext(args.dedupeKey),
      attemptCount: args.attemptCount,
      lastFailedAt: Date.now(),
      lastEventId: eventId,
      lastError: args.errorMessage,
      errorName: args.errorName,
    });
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

export const markSent = internalMutation({
  args: { outboxId: v.id("notificationOutbox") },
  handler: async (ctx, { outboxId }) => {
    const job = await ctx.db.get(outboxId);
    if (!job) return;

    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
      lastError: undefined,
    });
    await resolveFailureInboxByOutbox(ctx, outboxId, { resolutionKind: "sent" });

    // actionリトライ等で再実行されても使用量を二重カウントしない
    if (job.status === "sent") return;
    // dry-run等で実際には配送していないジョブは課金対象外なのでカウントしない（送信時と同じ最終ゲートで判定）
    if (isNotificationDeliverySuppressed({ suppressDelivery: job.payload.suppressDelivery })) return;
    await incrementNotificationUsage(ctx, job.shopId, job.channel, now);
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

    await ctx.db.patch(outboxId, {
      status: "failed",
      failedAt: now,
      updatedAt: now,
      lastError,
    });
    const eventId = await insertDeliveryEvent(ctx, deliveryEventFromJob(job, "final_failed", lastError, { errorName }));
    if (suppressFailureInbox) return;

    await upsertFailureInbox(ctx, {
      sourceType: "outbox",
      failureKey: outboxFailureKey(outboxId),
      shopId: job.shopId,
      recruitmentId: job.recruitmentId,
      staffId: job.staffId,
      userId: job.userId,
      outboxId: job._id,
      channel: job.channel,
      dedupeKey: job.dedupeKey,
      notificationContext: notificationContextForJob(job),
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
  handler: async (ctx, { failureId }) => {
    const failure = await ctx.db.get(failureId);
    if (
      !failure ||
      failure.shopId !== ctx.shop._id ||
      failure.status !== "open" ||
      failure.sourceType !== "outbox" ||
      !failure.outboxId
    ) {
      throw new ConvexError("Not found");
    }

    const outbox = await ctx.db.get(failure.outboxId);
    if (!outbox || outbox.shopId !== ctx.shop._id || outbox.status !== "failed") {
      throw new ConvexError("Not found");
    }

    const { ok } = await rateLimit(ctx, {
      name: "notificationFailureRetryShort",
      key: `${ctx.shop._id}:${failure._id}`,
    });
    if (!ok) {
      return { scheduled: false, reason: "rateLimited" as const };
    }

    const now = Date.now();
    await ctx.db.patch(outbox._id, {
      status: "pending",
      attemptCount: 0,
      nextRunAt: now,
      lastError: undefined,
      failedAt: undefined,
      processingStartedAt: undefined,
      sentAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(failure._id, {
      status: "retrying",
      retryRequestedAt: now,
      retryRequestedByUserId: ctx.user._id,
      updatedAt: now,
    });

    return { scheduled: true };
  },
});

export const resolveFailure = managerMutation({
  args: { failureId: v.id("notificationFailureInbox") },
  handler: async (ctx, { failureId }) => {
    const failure = await ctx.db.get(failureId);
    if (!failure || failure.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    await resolveFailureInbox(ctx, failure._id, {
      resolutionKind: "dismissed",
      resolvedByUserId: ctx.user._id,
    });

    return { resolved: true };
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

type DeliveryEventInput = {
  eventType: Doc<"notificationDeliveryEvents">["eventType"];
  shopId?: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  outboxId?: Id<"notificationOutbox">;
  channel?: Doc<"notificationOutbox">["channel"];
  dedupeKey?: string;
  notificationContext?: string;
  attemptCount?: number;
  nextRunAt?: number;
  errorMessage: string;
  errorName?: string;
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

async function insertDeliveryEvent(ctx: MutationCtx, input: DeliveryEventInput) {
  const now = Date.now();
  return await ctx.db.insert("notificationDeliveryEvents", {
    eventType: input.eventType,
    createdAt: now,
    expiresAt: now + NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
    ...(input.shopId ? { shopId: input.shopId } : {}),
    ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
    ...(input.staffId ? { staffId: input.staffId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.outboxId ? { outboxId: input.outboxId } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.notificationContext ? { notificationContext: input.notificationContext } : {}),
    ...(input.attemptCount !== undefined ? { attemptCount: input.attemptCount } : {}),
    ...(input.nextRunAt !== undefined ? { nextRunAt: input.nextRunAt } : {}),
    errorMessage: truncateErrorMessage(input.errorMessage),
    ...(input.errorName ? { errorName: input.errorName } : {}),
  });
}

async function upsertFailureInbox(ctx: MutationCtx, input: FailureInboxUpsertInput) {
  const now = Date.now();
  const failure = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_failureKey", (q) => q.eq("failureKey", input.failureKey))
    .first();
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

  if (failure) {
    await ctx.db.patch(failure._id, commonPatch);
    return failure._id;
  }

  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: input.failureKey,
    ...commonPatch,
    firstFailedAt: input.lastFailedAt,
    createdAt: now,
  });
}

async function resolveFailureInboxByOutbox(
  ctx: MutationCtx,
  outboxId: Id<"notificationOutbox">,
  args: { resolutionKind: "sent" | "dismissed" | "superseded"; resolvedByUserId?: Id<"users"> },
) {
  const failure = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_failureKey", (q) => q.eq("failureKey", outboxFailureKey(outboxId)))
    .first();
  if (!failure) return;
  await resolveFailureInbox(ctx, failure._id, args);
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

function notificationContextForJob(job: Doc<"notificationOutbox">) {
  if (job.payload.kind === "email") return job.payload.context;
  return job.payload.fallbackEmail?.payload.context ?? dedupeContext(job.dedupeKey);
}

function dedupeContext(dedupeKey: string) {
  return dedupeKey.split(":").slice(0, 2).join(":");
}

function outboxFailureKey(outboxId: Id<"notificationOutbox">) {
  return `outbox:${outboxId}`;
}

function enqueueFailureKey(sourceType: "enqueue" | "enqueue_preparation", shopId: Id<"shops">, dedupeKey: string) {
  return `${sourceType}:${shopId}:${dedupeKey}`;
}

function truncateErrorMessage(message: string) {
  if (message.length <= DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH) return message;
  return `${message.slice(0, DELIVERY_EVENT_ERROR_MESSAGE_MAX_LENGTH - 14)}...<truncated>`;
}
