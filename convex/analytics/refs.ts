import { type FunctionReference, makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";

export type AnalyticsPageArgs = { runId: Id<"analyticsDailyResults">; stepVersion: number };
export type AnalyticsPruneArgs = {
  phase: "running" | "failed" | "shopDays" | "cycles" | "results";
  beforeDate: string;
  resultBeforeDate: string;
};

export const runAnalyticsPageRef = makeFunctionReference<"action", AnalyticsPageArgs, null>(
  "analytics/nightly:runPage",
) as unknown as FunctionReference<"action", "internal", AnalyticsPageArgs, null>;
export const aggregateAnalyticsPageRef = makeFunctionReference<"mutation", AnalyticsPageArgs, null>(
  "analytics/nightly:aggregatePage",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsPageArgs, null>;
export const failAnalyticsPageRef = makeFunctionReference<"mutation", AnalyticsPageArgs & { errorCode: string }, null>(
  "analytics/runs:markFailed",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsPageArgs & { errorCode: string }, null>;
export const retryAnalyticsRunRef = makeFunctionReference<"mutation", AnalyticsPageArgs, null>(
  "analytics/runs:retry",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsPageArgs, null>;
export const recoverAnalyticsDatesRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/nightly:recoverMissingDates",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;
export const scheduleDailyAnalyticsRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/nightly:schedulePreviousDay",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;
export const scheduleAnalyticsMaintenanceRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/maintenance:scheduleWeekly",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;
export const pruneAnalyticsPageRef = makeFunctionReference<"mutation", AnalyticsPruneArgs, null>(
  "analytics/maintenance:prunePage",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsPruneArgs, null>;
