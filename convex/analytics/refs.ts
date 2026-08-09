import { type FunctionReference, makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { AnalyticsInvariantRollup } from "./invariants";

export type AnalyticsStepArgs = {
  runId: Id<"analyticsRuns">;
  kind: "daily" | "reset" | "maintenance";
  stepVersion: number;
  stage: string;
  cursor?: string;
  substage?: string;
  sourceEventId?: Id<"analyticsSourceEvents">;
  sourceCursor?: string;
  auditRollup?: AnalyticsInvariantRollup;
};

export const processAnalyticsStepRef = makeFunctionReference<"action", AnalyticsStepArgs, null>(
  "analytics/nightly:processStep",
) as unknown as FunctionReference<"action", "internal", AnalyticsStepArgs, null>;

export const processDailyPageRef = makeFunctionReference<"mutation", AnalyticsStepArgs, null>(
  "analytics/nightly:processPage",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsStepArgs, null>;

export const processResetPageRef = makeFunctionReference<"mutation", AnalyticsStepArgs, null>(
  "analytics/reset:processPage",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsStepArgs, null>;

export const processMaintenancePageRef = makeFunctionReference<"mutation", AnalyticsStepArgs, null>(
  "analytics/maintenance:processPage",
) as unknown as FunctionReference<"mutation", "internal", AnalyticsStepArgs, null>;

export const markAnalyticsRunFailedRef = makeFunctionReference<
  "mutation",
  { runId: Id<"analyticsRuns">; stepVersion: number; stage: string; errorCode: string },
  null
>("analytics/runs:markFailed") as unknown as FunctionReference<
  "mutation",
  "internal",
  { runId: Id<"analyticsRuns">; stepVersion: number; stage: string; errorCode: string },
  null
>;

export const scheduleDailyAnalyticsRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/nightly:schedulePreviousDay",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

export const scheduleAnalyticsMaintenanceRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/maintenance:scheduleWeekly",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;
