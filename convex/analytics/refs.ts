import { type FunctionReference, makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";

export const recoverAnalyticsJobsRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/pipeline:recoverJobs",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

export const processAnalyticsJobRef = makeFunctionReference<
  "mutation",
  { jobId: Id<"analyticsAggregationJobs">; leaseToken: string },
  null
>("analytics/pipeline:processJob") as unknown as FunctionReference<
  "mutation",
  "internal",
  { jobId: Id<"analyticsAggregationJobs">; leaseToken: string },
  null
>;

export const ensureProjectionJobRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/pipeline:ensureProjectionJob",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

export const startDeferredDailyAggregationRef = makeFunctionReference<
  "mutation",
  { date: string; generation: string },
  null
>("analytics/pipeline:startDeferredDailyAggregation") as unknown as FunctionReference<
  "mutation",
  "internal",
  { date: string; generation: string },
  null
>;

export const scheduleDailyAggregationRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/pipeline:schedulePreviousDay",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

export const scheduleRetentionCleanupRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/pipeline:scheduleRetentionCleanup",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;
