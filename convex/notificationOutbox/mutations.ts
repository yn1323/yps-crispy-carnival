import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { NOTIFICATION_OUTBOX_SHOP_ACTIVE_LIMIT, NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE } from "../constants";
import { notificationChannelValidator, notificationPayloadValidator } from "./schemas";

const ACTIVE_STATUSES = ["pending", "processing"] as const;

export const enqueue = internalMutation({
  args: {
    channel: notificationChannelValidator,
    shopId: v.id("shops"),
    staffId: v.optional(v.id("staffs")),
    dedupeKey: v.string(),
    payload: notificationPayloadValidator,
  },
  handler: async (ctx, args) => {
    if (args.channel !== args.payload.kind) {
      throw new ConvexError("Notification channel does not match payload");
    }

    for (const status of ACTIVE_STATUSES) {
      const existing = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", args.dedupeKey).eq("status", status))
        .first();
      if (existing) {
        return { outboxId: existing._id, deduped: true };
      }
    }

    const [pending, processing] = await Promise.all(
      ACTIVE_STATUSES.map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", args.shopId).eq("status", status))
          .take(NOTIFICATION_OUTBOX_SHOP_ACTIVE_LIMIT + 1),
      ),
    );
    if (pending.length + processing.length >= NOTIFICATION_OUTBOX_SHOP_ACTIVE_LIMIT) {
      throw new ConvexError("Notification queue is busy. Please try again later.");
    }

    const now = Date.now();
    const duePendingBeforeInsert = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_nextRunAt", (q) => q.eq("status", "pending").lte("nextRunAt", now))
      .first();
    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: args.channel,
      status: "pending",
      dedupeKey: args.dedupeKey,
      shopId: args.shopId,
      ...(args.staffId ? { staffId: args.staffId } : {}),
      payload: args.payload,
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
    if (!duePendingBeforeInsert) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.actions.processPending, {});
    }
    return { outboxId, deduped: false };
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
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
      lastError: undefined,
    });
  },
});

export const markFailed = internalMutation({
  args: { outboxId: v.id("notificationOutbox"), lastError: v.string() },
  handler: async (ctx, { outboxId, lastError }) => {
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "failed",
      failedAt: now,
      updatedAt: now,
      lastError,
    });
  },
});

export const markRetry = internalMutation({
  args: {
    outboxId: v.id("notificationOutbox"),
    lastError: v.string(),
    nextRunAt: v.number(),
  },
  handler: async (ctx, { outboxId, lastError, nextRunAt }) => {
    await ctx.db.patch(outboxId, {
      status: "pending",
      nextRunAt,
      updatedAt: Date.now(),
      lastError,
    });
    await ctx.scheduler.runAfter(
      Math.max(nextRunAt - Date.now(), 0),
      internal.notificationOutbox.actions.processPending,
      {},
    );
  },
});
