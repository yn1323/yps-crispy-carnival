import { paginationOptsValidator } from "convex/server";
import { managerQuery } from "../_lib/functions";

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

export const listOpenFailures = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    if (!ctx.shop) return EMPTY_PAGE;
    const shop = ctx.shop;

    const result = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open"))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((failure) => ({
        _id: failure._id,
        sourceType: failure.sourceType,
        status: failure.status,
        shopId: failure.shopId,
        recruitmentId: failure.recruitmentId,
        staffId: failure.staffId,
        userId: failure.userId,
        outboxId: failure.outboxId,
        channel: failure.channel,
        dedupeKey: failure.dedupeKey,
        notificationContext: failure.notificationContext,
        firstFailedAt: failure.firstFailedAt,
        lastFailedAt: failure.lastFailedAt,
        attemptCount: failure.attemptCount,
        lastError: failure.lastError,
        errorName: failure.errorName,
        canRetry: failure.sourceType === "outbox" && Boolean(failure.outboxId),
      })),
    };
  },
});

export const hasOpenFailures = managerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.shop) return false;
    const shop = ctx.shop;
    const failures = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open"))
      .take(1);
    return failures.length > 0;
  },
});
