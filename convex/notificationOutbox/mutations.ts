import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { monthJST } from "../_lib/dateFormat";
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

    const now = Date.now();
    for (const status of ACTIVE_STATUSES) {
      const existing = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", args.dedupeKey).eq("status", status))
        .first();
      if (existing) {
        if (existing.status === "pending" && existing.nextRunAt <= now) {
          await ensureProcessPendingScheduled(ctx, now);
        }
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
    await ensureProcessPendingScheduled(ctx, now);
    return { outboxId, deduped: false };
  },
});

async function ensureProcessPendingScheduled(ctx: MutationCtx, now: number) {
  // retry用の未来workerだけでは新規due通知を配送できないため、即時実行できるworkerだけを十分条件にする。
  const scheduledFunctions = await ctx.db.system.query("_scheduled_functions").order("desc").take(100);
  const hasDueWorker = scheduledFunctions.some((job) => {
    return (
      job.state.kind === "pending" &&
      job.scheduledTime <= now &&
      job.name.includes("notificationOutbox/actions") &&
      job.name.includes("processPending")
    );
  });
  if (!hasDueWorker) {
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.actions.processPending, {});
  }
}

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

    // actionリトライ等で再実行されても使用量を二重カウントしない
    if (job.status === "sent") return;
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
