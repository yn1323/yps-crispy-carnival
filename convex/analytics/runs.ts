import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { addDays, dateJST, jstDayRangeMs, subtractCalendarMonths } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { ANALYTICS_DEFINITION_VERSION, emptyAnalyticsResultCounts } from "./model";
import { safeAnalyticsErrorCode } from "./observability";
import { type AnalyticsPageArgs, retryAnalyticsRunRef, runAnalyticsPageRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";

type Run = Doc<"analyticsDailyResults">;
export const analyticsPageArgs = { runId: v.id("analyticsDailyResults"), stepVersion: v.number() };

export async function getDailyResult(ctx: QueryCtx | MutationCtx, date: string) {
  return await ctx.db
    .query("analyticsDailyResults")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
}

export function detailRetentionDate(now: number): string {
  return subtractCalendarMonths(dateJST(now), ANALYTICS_POLICY.retention.detailMonths);
}

export function runFenceMatches(run: Run | null, args: AnalyticsPageArgs): run is Run {
  return run !== null && run.status === "running" && run.stepVersion === args.stepVersion;
}

export async function expireRun(ctx: MutationCtx, run: Run, now: number) {
  await ctx.db.patch(run._id, {
    status: "failed",
    retryable: false,
    retryAt: undefined,
    cursorShopId: undefined,
    errorCode: "analytics_retention_expired",
    stepVersion: run.stepVersion + 1,
    updatedAt: now,
  });
}

export async function startDailyRun(ctx: MutationCtx, state: Doc<"analyticsState">, date: string) {
  const now = Date.now();
  if (date < dateJST(state.startedAt) || date >= dateJST(now) || (await getDailyResult(ctx, date))) return;
  const bounds = jstDayRangeMs(date);
  const observationStartAt = Math.max(bounds.startMs, state.startedAt);
  const inputStartDate = [dateJST(state.startedAt), addDays(date, -89)].sort().at(-1)!;
  const expired = inputStartDate < detailRetentionDate(now);
  const runId = await ctx.db.insert("analyticsDailyResults", {
    date,
    definitionVersion: ANALYTICS_DEFINITION_VERSION,
    status: expired ? "failed" : "running",
    observationStartAt,
    observationEndAt: bounds.endMs,
    isPartialDay: observationStartAt > bounds.startMs,
    inputStartDate,
    counts: emptyAnalyticsResultCounts(),
    stepVersion: 0,
    attemptCount: 1,
    retryAttempt: 0,
    retryable: !expired,
    ...(expired ? { errorCode: "analytics_retention_expired" } : {}),
    startedAt: now,
    updatedAt: now,
  });
  if (!expired) await ctx.scheduler.runAfter(0, runAnalyticsPageRef, { runId, stepVersion: 0 });
}

export async function resumeRun(ctx: MutationCtx, run: Run, now: number, resetRetry: boolean) {
  if (!run.retryable || run.status === "complete") return;
  if (run.inputStartDate < detailRetentionDate(now)) {
    await expireRun(ctx, run, now);
    return;
  }
  const stepVersion = run.stepVersion + 1;
  await ctx.db.patch(run._id, {
    status: "running",
    stepVersion,
    retryAt: undefined,
    errorCode: undefined,
    attemptCount: run.attemptCount + 1,
    ...(resetRetry ? { retryAttempt: 0 } : {}),
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, runAnalyticsPageRef, { runId: run._id, stepVersion });
}

export const markFailed = internalMutation({
  args: { ...analyticsPageArgs, errorCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!runFenceMatches(run, args)) return null;
    const now = Date.now();
    const delay = ANALYTICS_POLICY.retryDelaysMs[run.retryAttempt];
    const todayCronAt = jstDayRangeMs(dateJST(now)).startMs + 3 * 60 * 60 * 1000;
    const nextCronAt = now < todayCronAt ? todayCronAt : jstDayRangeMs(dateJST(now)).endMs + 3 * 60 * 60 * 1000;
    const retryAt = delay === undefined ? nextCronAt : now + delay;
    const stepVersion = run.stepVersion + 1;
    const errorCode = safeAnalyticsErrorCode(new Error(args.errorCode));
    await ctx.db.patch(run._id, {
      status: "failed",
      stepVersion,
      errorCode,
      retryAt,
      retryAttempt: run.retryAttempt + (delay === undefined ? 0 : 1),
      updatedAt: now,
    });
    if (delay !== undefined) await ctx.scheduler.runAfter(delay, retryAnalyticsRunRef, { runId: run._id, stepVersion });
    console.error("analytics_run_failed", { date: run.date, errorCode });
    return null;
  },
});

export const retry = internalMutation({
  args: analyticsPageArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const now = Date.now();
    if (
      !run ||
      run.status !== "failed" ||
      run.stepVersion !== args.stepVersion ||
      !run.retryable ||
      run.retryAt === undefined ||
      run.retryAt > now
    )
      return null;
    await resumeRun(ctx, run, now, false);
    return null;
  },
});
