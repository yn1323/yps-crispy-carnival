#!/usr/bin/env tsx

import process from "node:process";
import { fileURLToPath } from "node:url";
import { runConvexUsageCli } from "./convexUsage/cli";

export type {
  ExecutionMetrics,
  ExecutionMetricsDelta,
  FunctionExecutionAggregate,
  FunctionExecutionComparisonReport,
  FunctionExecutionSummaryReport,
  FunctionIdentity,
  InputStats,
  NumericDelta,
  ReportMetadata,
  UsageMetrics,
} from "./convexUsage/model";
export {
  compareFunctionExecutionReports,
  formatFunctionExecutionComparisonMarkdown,
  formatFunctionExecutionSummaryMarkdown,
  nearestRankPercentile,
  summarizeFunctionExecutionInput,
} from "./convexUsage/report";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runConvexUsageCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Convex usage summary failed.");
    process.exitCode = 1;
  });
}
