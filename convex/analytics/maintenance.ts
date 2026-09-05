import { v } from "convex/values";
import { dateJST, jstDayRangeMs, subtractCalendarMonths } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { legacyAnalyticsStepArgs } from "./nightly";
import { type AnalyticsPruneArgs, pruneAnalyticsPageRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";
import { detailRetentionDate, expireRun } from "./runs";

export const scheduleWeekly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    await ctx.scheduler.runAfter(0, pruneAnalyticsPageRef, {
      phase: "running",
      beforeDate: detailRetentionDate(now),
      resultBeforeDate: subtractCalendarMonths(dateJST(now), ANALYTICS_POLICY.retention.resultMonths),
    });
    return null;
  },
});

export const prunePage = internalMutation({
  args: {
    phase: v.union(
      v.literal("running"),
      v.literal("failed"),
      v.literal("shopDays"),
      v.literal("cycles"),
      v.literal("results"),
    ),
    beforeDate: v.string(),
    resultBeforeDate: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const limit = ANALYTICS_POLICY.retention.pageSize;
    let processed: number;
    let next: AnalyticsPruneArgs["phase"] | undefined;
    if (args.phase === "running" || args.phase === "failed") {
      const runs = await ctx.db
        .query("analyticsDailyResults")
        .withIndex("by_status_and_retryable_and_inputStartDate", (q) =>
          q
            .eq("status", args.phase as "running" | "failed")
            .eq("retryable", true)
            .lt("inputStartDate", args.beforeDate),
        )
        .take(limit);
      for (const run of runs) await expireRun(ctx, run, Date.now());
      processed = runs.length;
      next = args.phase === "running" ? "failed" : "shopDays";
    } else if (args.phase === "shopDays") {
      const days = await ctx.db
        .query("analyticsShopDays")
        .withIndex("by_date_and_shopId", (q) => q.lt("date", args.beforeDate))
        .take(limit);
      for (const day of days) await ctx.db.delete(day._id);
      processed = days.length;
      next = "cycles";
    } else if (args.phase === "cycles") {
      const cycles = await ctx.db
        .query("analyticsCycleEvidence")
        .withIndex("by_lastObservedAt", (q) => q.lt("lastObservedAt", jstDayRangeMs(args.beforeDate).startMs))
        .take(limit);
      for (const cycle of cycles) await ctx.db.delete(cycle._id);
      processed = cycles.length;
      next = "results";
    } else {
      const runs = await ctx.db
        .query("analyticsDailyResults")
        .withIndex("by_date", (q) => q.lt("date", args.resultBeforeDate))
        .take(limit);
      for (const run of runs) await ctx.db.delete(run._id);
      processed = runs.length;
    }
    const phase = processed === limit ? args.phase : next;
    if (phase) await ctx.scheduler.runAfter(0, pruneAnalyticsPageRef, { ...args, phase });
    return null;
  },
});

export const processPage = internalMutation({
  args: legacyAnalyticsStepArgs,
  returns: v.null(),
  handler: async () => null,
});
