import {
  compareStrings,
  createZeroUsage,
  divide,
  type ExecutionMetrics,
  type ExecutionMetricsDelta,
  type FunctionExecutionAggregate,
  type FunctionExecutionComparisonReport,
  type FunctionExecutionSummaryReport,
  type FunctionIdentity,
  functionIdentityKey,
  type NormalizedFunctionExecution,
  type NumericDelta,
  type ReportMetadata,
  type RunReason,
  roundMetric,
  USAGE_KEYS,
  type UsageMetrics,
} from "./model";
import { parseFunctionExecutionInput } from "./parse";

type MutableExecutionMetrics = {
  calls: number;
  successCalls: number;
  failureCalls: number;
  cachedCalls: number;
  runReasons: Map<RunReason, number>;
  usageTotals: UsageMetrics;
  executionTimes: number[];
  mutationRetryCalls: number;
  mutationRetryCount: number;
  occCalls: number;
  occRetryCount: number;
};

const createMutableMetrics = (): MutableExecutionMetrics => ({
  calls: 0,
  successCalls: 0,
  failureCalls: 0,
  cachedCalls: 0,
  runReasons: new Map(),
  usageTotals: createZeroUsage(),
  executionTimes: [],
  mutationRetryCalls: 0,
  mutationRetryCount: 0,
  occCalls: 0,
  occRetryCount: 0,
});

const addEventToMetrics = (metrics: MutableExecutionMetrics, event: NormalizedFunctionExecution) => {
  metrics.calls += 1;
  metrics.successCalls += event.status === "success" ? 1 : 0;
  metrics.failureCalls += event.status === "failure" ? 1 : 0;
  metrics.cachedCalls += event.cached ? 1 : 0;
  metrics.runReasons.set(event.runReason, (metrics.runReasons.get(event.runReason) ?? 0) + 1);
  metrics.executionTimes.push(event.executionTimeMs);
  metrics.mutationRetryCalls += event.mutationRetryCount > 0 ? 1 : 0;
  metrics.mutationRetryCount += event.mutationRetryCount;
  metrics.occCalls += event.occ ? 1 : 0;
  metrics.occRetryCount += event.occRetryCount;
  for (const key of USAGE_KEYS) metrics.usageTotals[key] += event.usage[key];
};

export const nearestRankPercentile = (values: number[], percentile: number): number | null => {
  if (values.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error("percentile must be greater than 0 and at most 1");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1] ?? null;
};

const finalizeMetrics = (metrics: MutableExecutionMetrics): ExecutionMetrics => {
  const usagePerCall = createZeroUsage();
  for (const key of USAGE_KEYS) usagePerCall[key] = divide(metrics.usageTotals[key], metrics.calls);
  const runReasons = Object.fromEntries(
    [...metrics.runReasons.entries()].sort(([left], [right]) => compareStrings(left, right)),
  );

  return {
    calls: metrics.calls,
    successCalls: metrics.successCalls,
    failureCalls: metrics.failureCalls,
    cachedCalls: metrics.cachedCalls,
    runReasons,
    usageTotals: { ...metrics.usageTotals },
    usagePerCall,
    executionTimeMs: {
      p50: nearestRankPercentile(metrics.executionTimes, 0.5),
      p95: nearestRankPercentile(metrics.executionTimes, 0.95),
    },
    mutationRetryCalls: metrics.mutationRetryCalls,
    mutationRetryCount: metrics.mutationRetryCount,
    occCalls: metrics.occCalls,
    occRetryCount: metrics.occRetryCount,
  };
};

export function summarizeFunctionExecutionInput(
  source: string,
  metadata: ReportMetadata,
): FunctionExecutionSummaryReport {
  const parsed = parseFunctionExecutionInput(source, metadata);
  const overall = createMutableMetrics();
  const grouped = new Map<string, { identity: FunctionIdentity; metrics: MutableExecutionMetrics }>();
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const event of parsed.events) {
    addEventToMetrics(overall, event);
    firstTimestamp = firstTimestamp === null ? event.timestamp : Math.min(firstTimestamp, event.timestamp);
    lastTimestamp = lastTimestamp === null ? event.timestamp : Math.max(lastTimestamp, event.timestamp);

    const key = functionIdentityKey(event);
    const existing = grouped.get(key);
    if (existing) addEventToMetrics(existing.metrics, event);
    else {
      const metrics = createMutableMetrics();
      addEventToMetrics(metrics, event);
      grouped.set(key, { identity: { deployment: event.deployment, function: event.function }, metrics });
    }
  }

  const functions = [...grouped.values()]
    .sort((left, right) => compareStrings(functionIdentityKey(left.identity), functionIdentityKey(right.identity)))
    .map(({ identity, metrics }) => ({ ...identity, metrics: finalizeMetrics(metrics) }));

  return {
    schemaVersion: 1,
    reportType: "summary",
    metadata: parsed.metadata,
    input: parsed.input,
    observedWindow: {
      firstTimestamp: firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
      lastTimestamp: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
    },
    overall: finalizeMetrics(overall),
    functions,
  };
}

const numericDelta = (baseline: number, current: number): NumericDelta => ({
  baseline,
  current,
  absolute: roundMetric(current - baseline),
  percent: baseline === 0 ? null : roundMetric(((current - baseline) / baseline) * 100),
});

const usageDelta = (baseline: UsageMetrics, current: UsageMetrics): Record<keyof UsageMetrics, NumericDelta> => {
  const result = {} as Record<keyof UsageMetrics, NumericDelta>;
  for (const key of USAGE_KEYS) result[key] = numericDelta(baseline[key], current[key]);
  return result;
};

const compareMetrics = (baseline: ExecutionMetrics, current: ExecutionMetrics): ExecutionMetricsDelta => {
  const runReasons: Record<string, NumericDelta> = {};
  const runReasonKeys = [...new Set([...Object.keys(baseline.runReasons), ...Object.keys(current.runReasons)])].sort(
    compareStrings,
  );
  for (const key of runReasonKeys) {
    runReasons[key] = numericDelta(baseline.runReasons[key] ?? 0, current.runReasons[key] ?? 0);
  }

  return {
    calls: numericDelta(baseline.calls, current.calls),
    successCalls: numericDelta(baseline.successCalls, current.successCalls),
    failureCalls: numericDelta(baseline.failureCalls, current.failureCalls),
    cachedCalls: numericDelta(baseline.cachedCalls, current.cachedCalls),
    runReasons,
    usageTotals: usageDelta(baseline.usageTotals, current.usageTotals),
    usagePerCall: usageDelta(baseline.usagePerCall, current.usagePerCall),
    executionTimeMs: {
      p50: numericDelta(baseline.executionTimeMs.p50 ?? 0, current.executionTimeMs.p50 ?? 0),
      p95: numericDelta(baseline.executionTimeMs.p95 ?? 0, current.executionTimeMs.p95 ?? 0),
    },
    mutationRetryCalls: numericDelta(baseline.mutationRetryCalls, current.mutationRetryCalls),
    mutationRetryCount: numericDelta(baseline.mutationRetryCount, current.mutationRetryCount),
    occCalls: numericDelta(baseline.occCalls, current.occCalls),
    occRetryCount: numericDelta(baseline.occRetryCount, current.occRetryCount),
  };
};

export function compareFunctionExecutionReports(
  baseline: FunctionExecutionSummaryReport,
  current: FunctionExecutionSummaryReport,
): FunctionExecutionComparisonReport {
  const baselineByKey = new Map(baseline.functions.map((entry) => [functionIdentityKey(entry), entry]));
  const currentByKey = new Map(current.functions.map((entry) => [functionIdentityKey(entry), entry]));
  const keys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort(compareStrings);
  const zero = finalizeMetrics(createMutableMetrics());

  const functions = keys.map((key) => {
    const baselineEntry = baselineByKey.get(key);
    const currentEntry = currentByKey.get(key);
    const identity = baselineEntry ?? currentEntry;
    if (!identity) throw new Error("比較対象のfunction identityが見つかりません。");
    return {
      deployment: identity.deployment,
      function: identity.function,
      change: baselineEntry ? (currentEntry ? "persisting" : "removed") : "added",
      baseline: baselineEntry?.metrics ?? null,
      current: currentEntry?.metrics ?? null,
      delta: compareMetrics(baselineEntry?.metrics ?? zero, currentEntry?.metrics ?? zero),
    } as const;
  });

  const toSource = ({ metadata, input, observedWindow, overall }: FunctionExecutionSummaryReport) => ({
    metadata,
    input,
    observedWindow,
    overall,
  });
  return {
    schemaVersion: 1,
    reportType: "comparison",
    baseline: toSource(baseline),
    current: toSource(current),
    overallDelta: compareMetrics(baseline.overall, current.overall),
    functions,
  };
}

const escapeMarkdown = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ");

const formatRunReasons = (runReasons: Record<string, number>) =>
  Object.entries(runReasons)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(", ") || "-";

const formatDelta = (delta: NumericDelta) => {
  const sign = delta.absolute > 0 ? "+" : "";
  const percentage = delta.percent === null ? "n/a" : `${delta.percent > 0 ? "+" : ""}${delta.percent}%`;
  return `${sign}${delta.absolute} (${percentage})`;
};

const summaryTable = (functions: FunctionExecutionAggregate[]) => [
  "| Deployment | Function | Type | Calls | Success | Failure | Cached | Run reason | Read docs total | Read docs/call | Read bytes total | Read bytes/call | Write docs total | Write bytes total | Network egress | p50 ms | p95 ms | Mutation retries | OCC calls |",
  "|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...functions.map(({ deployment, function: functionMetadata, metrics }) =>
    [
      escapeMarkdown(deployment.name),
      escapeMarkdown(functionMetadata.path),
      functionMetadata.type,
      metrics.calls,
      metrics.successCalls,
      metrics.failureCalls,
      metrics.cachedCalls,
      escapeMarkdown(formatRunReasons(metrics.runReasons)),
      metrics.usageTotals.databaseReadDocuments,
      metrics.usagePerCall.databaseReadDocuments,
      metrics.usageTotals.databaseIoReadBytes,
      metrics.usagePerCall.databaseIoReadBytes,
      metrics.usageTotals.databaseWriteDocuments,
      metrics.usageTotals.databaseIoWriteBytes,
      metrics.usageTotals.networkEgressBytes,
      metrics.executionTimeMs.p50 ?? "-",
      metrics.executionTimeMs.p95 ?? "-",
      metrics.mutationRetryCount,
      metrics.occCalls,
    ]
      .join(" | ")
      .replace(/^/, "| ")
      .concat(" |"),
  ),
];

export function formatFunctionExecutionSummaryMarkdown(report: FunctionExecutionSummaryReport): string {
  const overall = report.overall;
  return [
    "# Convex function execution summary",
    "",
    `- Release: ${escapeMarkdown(report.metadata.releaseId)}`,
    `- Period: ${report.metadata.periodStart} to ${report.metadata.periodEnd} (end exclusive)`,
    `- Observed: ${report.observedWindow.firstTimestamp ?? "none"} to ${report.observedWindow.lastTimestamp ?? "none"}`,
    `- Input: ${report.input.totalRecords} records / ${report.input.includedEvents} included / ${report.input.duplicateEvents} duplicate / ${report.input.invalidRecords} invalid / ${report.input.ignoredRecords} ignored / ${report.input.outsidePeriodEvents} outside period`,
    "",
    "## Overall",
    "",
    `Calls ${overall.calls}; success ${overall.successCalls}; failure ${overall.failureCalls}; cached ${overall.cachedCalls}; ` +
      `read documents ${overall.usageTotals.databaseReadDocuments}; read bytes ${overall.usageTotals.databaseIoReadBytes}; ` +
      `write documents ${overall.usageTotals.databaseWriteDocuments}; write bytes ${overall.usageTotals.databaseIoWriteBytes}; ` +
      `network egress ${overall.usageTotals.networkEgressBytes}; p50 ${overall.executionTimeMs.p50 ?? "-"} ms; ` +
      `p95 ${overall.executionTimeMs.p95 ?? "-"} ms.`,
    "",
    "## Functions",
    "",
    ...summaryTable(report.functions),
  ].join("\n");
}

export function formatFunctionExecutionComparisonMarkdown(report: FunctionExecutionComparisonReport): string {
  const rows = report.functions.map((entry) =>
    [
      entry.change,
      escapeMarkdown(entry.deployment.name),
      escapeMarkdown(entry.function.path),
      entry.function.type,
      formatDelta(entry.delta.calls),
      formatDelta(entry.delta.usageTotals.databaseReadDocuments),
      formatDelta(entry.delta.usagePerCall.databaseReadDocuments),
      formatDelta(entry.delta.usageTotals.databaseIoReadBytes),
      formatDelta(entry.delta.usagePerCall.databaseIoReadBytes),
      formatDelta(entry.delta.usageTotals.databaseWriteDocuments),
      formatDelta(entry.delta.usageTotals.databaseIoWriteBytes),
      formatDelta(entry.delta.usageTotals.networkEgressBytes),
      formatDelta(entry.delta.executionTimeMs.p95),
    ]
      .join(" | ")
      .replace(/^/, "| ")
      .concat(" |"),
  );

  return [
    "# Convex function execution comparison",
    "",
    `- Baseline: ${escapeMarkdown(report.baseline.metadata.releaseId)} / ${report.baseline.metadata.periodStart} to ${report.baseline.metadata.periodEnd}`,
    `- Current: ${escapeMarkdown(report.current.metadata.releaseId)} / ${report.current.metadata.periodStart} to ${report.current.metadata.periodEnd}`,
    `- Overall calls: ${formatDelta(report.overallDelta.calls)}`,
    `- Overall read documents/call: ${formatDelta(report.overallDelta.usagePerCall.databaseReadDocuments)}`,
    `- Overall read bytes/call: ${formatDelta(report.overallDelta.usagePerCall.databaseIoReadBytes)}`,
    "",
    "| Change | Deployment | Function | Type | Calls delta | Read docs total delta | Read docs/call delta | Read bytes total delta | Read bytes/call delta | Write docs total delta | Write bytes total delta | Network egress delta | p95 delta |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}
