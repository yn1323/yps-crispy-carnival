export const FUNCTION_TYPES = ["query", "mutation", "action", "http_action"] as const;
export const FUNCTION_STATUSES = ["success", "failure"] as const;
export const RUN_REASONS = [
  "initialSubscription",
  "dataChange",
  "identityChange",
  "webSocket",
  "httpApi",
  "httpEndpoint",
  "cron",
  "scheduler",
  "action",
  "tester",
] as const;

export type FunctionType = (typeof FUNCTION_TYPES)[number];
export type FunctionStatus = (typeof FUNCTION_STATUSES)[number];
export type RunReason = (typeof RUN_REASONS)[number] | "unspecified" | "other";

export type UsageMetrics = {
  databaseIoReadBytes: number;
  databaseIoWriteBytes: number;
  databaseReadDocuments: number;
  databaseWriteDocuments: number;
  textSearchQueryBytes: number;
  textSearchWriteQueryBytes: number;
  vectorSearchQueryBytes: number;
  vectorSearchWriteQueryBytes: number;
  fileStorageReadBytes: number;
  networkEgressBytes: number;
  auditLogEgressBytes: number;
};

export type ReportMetadata = {
  releaseId: string;
  periodStart: string;
  periodEnd: string;
};

export type InputStats = {
  totalRecords: number;
  includedEvents: number;
  duplicateEvents: number;
  invalidRecords: number;
  ignoredRecords: number;
  outsidePeriodEvents: number;
};

export type ExecutionMetrics = {
  calls: number;
  successCalls: number;
  failureCalls: number;
  cachedCalls: number;
  runReasons: Record<string, number>;
  usageTotals: UsageMetrics;
  usagePerCall: UsageMetrics;
  executionTimeMs: {
    p50: number | null;
    p95: number | null;
  };
  mutationRetryCalls: number;
  mutationRetryCount: number;
  occCalls: number;
  occRetryCount: number;
};

export type FunctionIdentity = {
  deployment: {
    name: string;
    type: string;
    projectSlug: string | null;
  };
  function: {
    path: string;
    type: FunctionType;
  };
};

export type FunctionExecutionAggregate = FunctionIdentity & {
  metrics: ExecutionMetrics;
};

export type FunctionExecutionSummaryReport = {
  schemaVersion: 1;
  reportType: "summary";
  metadata: ReportMetadata;
  input: InputStats;
  observedWindow: {
    firstTimestamp: string | null;
    lastTimestamp: string | null;
  };
  overall: ExecutionMetrics;
  functions: FunctionExecutionAggregate[];
};

export type NumericDelta = {
  baseline: number;
  current: number;
  absolute: number;
  percent: number | null;
};

export type ExecutionMetricsDelta = {
  calls: NumericDelta;
  successCalls: NumericDelta;
  failureCalls: NumericDelta;
  cachedCalls: NumericDelta;
  runReasons: Record<string, NumericDelta>;
  usageTotals: Record<keyof UsageMetrics, NumericDelta>;
  usagePerCall: Record<keyof UsageMetrics, NumericDelta>;
  executionTimeMs: {
    p50: NumericDelta;
    p95: NumericDelta;
  };
  mutationRetryCalls: NumericDelta;
  mutationRetryCount: NumericDelta;
  occCalls: NumericDelta;
  occRetryCount: NumericDelta;
};

export type FunctionExecutionComparisonReport = {
  schemaVersion: 1;
  reportType: "comparison";
  baseline: Omit<FunctionExecutionSummaryReport, "functions" | "reportType" | "schemaVersion">;
  current: Omit<FunctionExecutionSummaryReport, "functions" | "reportType" | "schemaVersion">;
  overallDelta: ExecutionMetricsDelta;
  functions: Array<
    FunctionIdentity & {
      change: "persisting" | "added" | "removed";
      baseline: ExecutionMetrics | null;
      current: ExecutionMetrics | null;
      delta: ExecutionMetricsDelta;
    }
  >;
};

export type NormalizedFunctionExecution = FunctionIdentity & {
  timestamp: number;
  requestId: string;
  cached: boolean;
  status: FunctionStatus;
  runReason: RunReason;
  executionTimeMs: number;
  mutationRetryCount: number;
  occ: boolean;
  occRetryCount: number;
  usage: UsageMetrics;
};

export type ParsedFunctionExecutionInput = {
  metadata: ReportMetadata;
  input: InputStats;
  events: NormalizedFunctionExecution[];
};

export const createZeroUsage = (): UsageMetrics => ({
  databaseIoReadBytes: 0,
  databaseIoWriteBytes: 0,
  databaseReadDocuments: 0,
  databaseWriteDocuments: 0,
  textSearchQueryBytes: 0,
  textSearchWriteQueryBytes: 0,
  vectorSearchQueryBytes: 0,
  vectorSearchWriteQueryBytes: 0,
  fileStorageReadBytes: 0,
  networkEgressBytes: 0,
  auditLogEgressBytes: 0,
});

export const USAGE_KEYS = Object.keys(createZeroUsage()) as Array<keyof UsageMetrics>;

export const compareStrings = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

export const roundMetric = (value: number) => Number(value.toFixed(6));

export const divide = (value: number, divisor: number) => (divisor === 0 ? 0 : roundMetric(value / divisor));

export const functionIdentityKey = (identity: FunctionIdentity) =>
  [
    identity.deployment.projectSlug ?? "",
    identity.deployment.name,
    identity.deployment.type,
    identity.function.path,
    identity.function.type,
  ].join("\u0000");
