import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { addDays, dateJST } from "../_lib/dateFormat";
import {
  observedInternalAction as internalAction,
  observedInternalMutation as internalMutation,
} from "../_lib/errorObservability";
import { ANALYTICS_DEFINITION_VERSION, ANALYTICS_METRICS, ANALYTICS_PERIOD_DAYS } from "./model";
import { safeAnalyticsErrorCode } from "./observability";
import { ensureAnalyticsState } from "./record";
import { aggregateAnalyticsPageRef, failAnalyticsPageRef, recoverAnalyticsDatesRef, runAnalyticsPageRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";
import { analyticsPageArgs, detailRetentionDate, expireRun, resumeRun, runFenceMatches, startDailyRun } from "./runs";

export const aggregatePage = internalMutation({
  args: analyticsPageArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!runFenceMatches(run, args)) return null;
    if (run.definitionVersion !== ANALYTICS_DEFINITION_VERSION) throw new Error("analytics_definition_mismatch");
    if (run.inputStartDate < detailRetentionDate(Date.now())) {
      await expireRun(ctx, run, Date.now());
      return null;
    }
    const counts = {
      day: { ...run.counts.day },
      days7: { ...run.counts.days7 },
      days30: { ...run.counts.days30 },
      days90: { ...run.counts.days90 },
    };
    let cursorShopId: Id<"shops"> | undefined = run.cursorShopId;
    let done = false;
    for (let i = 0; i < ANALYTICS_POLICY.shopsPerPage; i++) {
      // 店舗IDを超えるindex seekなので、その店舗の全履歴を読み飛ばす必要がない。
      const next = await ctx.db
        .query("analyticsShopDays")
        .withIndex("by_shopId_and_date", (q) => (cursorShopId ? q.gt("shopId", cursorShopId) : q))
        .first();
      if (!next) {
        done = true;
        break;
      }
      const days = await ctx.db
        .query("analyticsShopDays")
        .withIndex("by_shopId_and_date", (q) =>
          q.eq("shopId", next.shopId).gte("date", run.inputStartDate).lte("date", run.date),
        )
        .take(91);
      if (days.length > 90) throw new Error("analytics_shop_day_duplicate");
      for (const metric of ANALYTICS_METRICS) {
        if (days.some((day) => day.date === run.date && day[metric])) counts.day[metric]++;
        for (const period of ANALYTICS_PERIOD_DAYS) {
          const from = addDays(run.date, 1 - period);
          if (days.some((day) => day.date >= from && day[metric])) counts[`days${period}`][metric]++;
        }
      }
      cursorShopId = next.shopId;
    }
    const now = Date.now();
    const stepVersion = run.stepVersion + 1;
    if (done) {
      for (const metric of ANALYTICS_METRICS) {
        const values = [counts.day[metric], counts.days7[metric], counts.days30[metric], counts.days90[metric]];
        if (values.some((value, i) => !Number.isSafeInteger(value) || value < 0 || (i > 0 && value < values[i - 1]))) {
          throw new Error("analytics_run_invariant_failed");
        }
      }
    }
    await ctx.db.patch(run._id, {
      counts,
      cursorShopId: done ? undefined : cursorShopId,
      stepVersion,
      updatedAt: now,
      ...(done ? { status: "complete" as const, completedAt: now, retryAt: undefined, errorCode: undefined } : {}),
    });
    if (!done) await ctx.scheduler.runAfter(0, runAnalyticsPageRef, { runId: run._id, stepVersion });
    return null;
  },
});

export const runPage = internalAction({
  args: analyticsPageArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(aggregateAnalyticsPageRef, args);
    } catch (error) {
      await ctx.runMutation(failAnalyticsPageRef, { ...args, errorCode: safeAnalyticsErrorCode(error) });
    }
    return null;
  },
});

export const recoverMissingDates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ensureAnalyticsState(ctx);
    const today = dateJST(Date.now());
    let date = state.nextRecoveryDate;
    for (let i = 0; i < ANALYTICS_POLICY.recoveryDaysPerTick && date < today; i++) {
      await startDailyRun(ctx, state, date);
      date = addDays(date, 1);
    }
    if (date !== state.nextRecoveryDate) await ctx.db.patch(state._id, { nextRecoveryDate: date });
    if (date < today) await ctx.scheduler.runAfter(0, recoverAnalyticsDatesRef, {});
    return null;
  },
});

export const schedulePreviousDay = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ensureAnalyticsState(ctx);
    const now = Date.now();
    await startDailyRun(ctx, state, addDays(dateJST(now), -1));
    const failed = await ctx.db
      .query("analyticsDailyResults")
      .withIndex("by_status_and_retryAt", (q) => q.eq("status", "failed").gte("retryAt", 0).lte("retryAt", now))
      .take(ANALYTICS_POLICY.recoveryRunsPerStatus);
    for (const run of failed) await resumeRun(ctx, run, now, true);
    const stale = await ctx.db
      .query("analyticsDailyResults")
      .withIndex("by_status_and_updatedAt", (q) =>
        q.eq("status", "running").lte("updatedAt", now - ANALYTICS_POLICY.staleRunMs),
      )
      .take(ANALYTICS_POLICY.recoveryRunsPerStatus);
    for (const run of stale) await resumeRun(ctx, run, now, true);
    await ctx.scheduler.runAfter(0, recoverAnalyticsDatesRef, {});
    return null;
  },
});

// 旧runの予約済みcallは、新しいtableへ一切触れず終了する。
export const legacyAnalyticsStepArgs = {
  runId: v.string(),
  kind: v.string(),
  stepVersion: v.number(),
  stage: v.string(),
  cursor: v.optional(v.string()),
  substage: v.optional(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceCursor: v.optional(v.string()),
  auditRollup: v.optional(v.any()),
};
export const processStep = internalAction({
  args: legacyAnalyticsStepArgs,
  returns: v.null(),
  handler: async () => null,
});
export const processPage = internalMutation({
  args: legacyAnalyticsStepArgs,
  returns: v.null(),
  handler: async () => null,
});
