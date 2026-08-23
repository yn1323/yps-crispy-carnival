import { describe, expect, it } from "vitest";
import {
  compareFunctionExecutionReports,
  formatFunctionExecutionSummaryMarkdown,
  nearestRankPercentile,
  type ReportMetadata,
  summarizeFunctionExecutionInput,
} from "./summarizeConvexFunctionExecutions";

const PERIOD_START = "2026-08-01T00:00:00.000Z";
const PERIOD_END = "2026-08-02T00:00:00.000Z";
const BASE_TIMESTAMP = Date.parse(PERIOD_START) + 1_000;

const metadata = (releaseId: string): ReportMetadata => ({
  releaseId,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
});

type EventOptions = {
  cached?: boolean;
  executionTimeMs?: number;
  extra?: Record<string, unknown>;
  functionPath?: string;
  functionType?: "query" | "mutation" | "action" | "http_action";
  requestId?: string;
  runReason?: string;
  status?: "success" | "failure";
  timestamp?: number;
  usage?: Partial<{
    audit_log_egress_bytes: number;
    database_io_read_bytes: number;
    database_io_write_bytes: number;
    database_read_documents: number;
    database_write_documents: number;
    file_storage_read_bytes: number;
    network_egress_bytes: number;
    text_search_query_bytes: number;
    text_search_write_query_bytes: number;
    vector_search_query_bytes: number;
    vector_search_write_query_bytes: number;
  }>;
};

const functionExecution = ({
  cached = false,
  executionTimeMs = 10,
  extra = {},
  functionPath = "dashboard/queries:getSummary",
  functionType = "query",
  requestId = "request-1",
  runReason = "initialSubscription",
  status = "success",
  timestamp = BASE_TIMESTAMP,
  usage = {},
}: EventOptions = {}) => ({
  topic: "function_execution",
  timestamp,
  convex: {
    deployment_name: "production-capybara-123",
    deployment_type: "prod",
    project_name: "Shiftori production",
    project_slug: "yps-crispy-carnival",
  },
  function: {
    type: functionType,
    path: functionPath,
    cached,
    request_id: requestId,
  },
  execution_time_ms: executionTimeMs,
  status,
  run_reason: runReason,
  usage: {
    database_io_read_bytes: 100,
    database_io_write_bytes: 0,
    database_read_documents: 1,
    database_write_documents: 0,
    text_search_query_bytes: 0,
    text_search_write_query_bytes: 0,
    vector_search_query_bytes: 0,
    vector_search_write_query_bytes: 0,
    file_storage_read_bytes: 0,
    network_egress_bytes: 10,
    audit_log_egress_bytes: 0,
    ...usage,
  },
  ...extra,
});

describe("summarizeFunctionExecutionInput", () => {
  it("JSONL、Axiom wrapper、不正行、対象外topicを区別する", () => {
    const source = [
      JSON.stringify(functionExecution({ functionPath: "b:list", requestId: "request-b" })),
      JSON.stringify({ data: functionExecution({ functionPath: "a:list", requestId: "request-a" }) }),
      "{invalid-json",
      JSON.stringify({ topic: "console", message: "ignored" }),
      JSON.stringify(42),
    ].join("\n");

    const report = summarizeFunctionExecutionInput(source, metadata("release-a"));

    expect(report.input).toEqual({
      totalRecords: 5,
      includedEvents: 2,
      duplicateEvents: 0,
      invalidRecords: 2,
      ignoredRecords: 1,
      outsidePeriodEvents: 0,
    });
    expect(report.functions.map(({ function: entry }) => entry.path)).toEqual(["a:list", "b:list"]);
  });

  it("重複を除外し、status・cache・run reason・利用量・retry・OCC・percentileを集計する", () => {
    const first = functionExecution({
      executionTimeMs: 10,
      requestId: "request-1",
      usage: { database_io_read_bytes: 100, database_read_documents: 1 },
    });
    const events = [
      first,
      first,
      functionExecution({
        cached: true,
        executionTimeMs: 20,
        requestId: "request-2",
        runReason: "dataChange",
        timestamp: BASE_TIMESTAMP + 1,
        usage: { database_io_read_bytes: 200, database_read_documents: 2 },
      }),
      functionExecution({
        executionTimeMs: 30,
        requestId: "request-3",
        runReason: "futureReason",
        status: "failure",
        timestamp: BASE_TIMESTAMP + 2,
        usage: { database_io_read_bytes: 300, database_read_documents: 3 },
      }),
      functionExecution({
        executionTimeMs: 100,
        extra: { mutation_retry_count: 2, occ_info: { document_id: "secret-id", retry_count: 1 } },
        functionType: "mutation",
        requestId: "request-4",
        runReason: "webSocket",
        timestamp: BASE_TIMESTAMP + 3,
        usage: {
          database_io_read_bytes: 400,
          database_io_write_bytes: 80,
          database_read_documents: 4,
          database_write_documents: 2,
          network_egress_bytes: 20,
        },
      }),
      functionExecution({
        requestId: "outside-period",
        timestamp: Date.parse(PERIOD_END),
      }),
    ];

    const report = summarizeFunctionExecutionInput(JSON.stringify(events), metadata("release-a"));

    expect(report.input).toMatchObject({ includedEvents: 4, duplicateEvents: 1, outsidePeriodEvents: 1 });
    expect(report.overall).toMatchObject({
      calls: 4,
      successCalls: 3,
      failureCalls: 1,
      cachedCalls: 1,
      runReasons: { dataChange: 1, initialSubscription: 1, other: 1, webSocket: 1 },
      usageTotals: {
        databaseIoReadBytes: 1_000,
        databaseIoWriteBytes: 80,
        databaseReadDocuments: 10,
        databaseWriteDocuments: 2,
        networkEgressBytes: 50,
      },
      usagePerCall: {
        databaseIoReadBytes: 250,
        databaseReadDocuments: 2.5,
      },
      executionTimeMs: { p50: 20, p95: 100 },
      mutationRetryCalls: 1,
      mutationRetryCount: 2,
      occCalls: 1,
      occRetryCount: 1,
    });
  });

  it("引数・戻り値・error・OCC document・未知run reasonをJSONとMarkdownへ出さない", () => {
    const secret = "private@example.com";
    const report = summarizeFunctionExecutionInput(
      JSON.stringify([
        functionExecution({
          extra: {
            args: { token: secret },
            error_message: secret,
            function_args_bytes: 999,
            function_returns_bytes: 888,
            occ_info: { document_id: secret, retry_count: 1, table_name: secret, write_source: secret },
            returns: { email: secret },
          },
          runReason: secret,
          status: "failure",
        }),
      ]),
      metadata("release-a"),
    );
    const json = JSON.stringify(report);
    const markdown = formatFunctionExecutionSummaryMarkdown(report);

    for (const forbidden of [
      secret,
      "error_message",
      "function_args_bytes",
      "function_returns_bytes",
      "request_id",
      "document_id",
    ]) {
      expect(json).not.toContain(forbidden);
      expect(markdown).not.toContain(forbidden);
    }
    expect(report.overall.runReasons).toEqual({ other: 1 });
  });
});

describe("compareFunctionExecutionReports", () => {
  it("継続・追加・削除functionをstable sortし、totalとper-callの差分を分ける", () => {
    const baseline = summarizeFunctionExecutionInput(
      JSON.stringify([
        functionExecution({
          functionPath: "b:removed",
          requestId: "baseline-b",
          usage: { database_io_read_bytes: 5, database_read_documents: 1 },
        }),
        functionExecution({
          functionPath: "a:persisting",
          requestId: "baseline-a",
          usage: { database_io_read_bytes: 100, database_read_documents: 10 },
        }),
      ]),
      metadata("baseline-sha"),
    );
    const current = summarizeFunctionExecutionInput(
      JSON.stringify([
        functionExecution({
          functionPath: "c:added",
          requestId: "current-c",
          usage: { database_io_read_bytes: 7, database_read_documents: 1 },
        }),
        functionExecution({
          functionPath: "a:persisting",
          requestId: "current-a-1",
          usage: { database_io_read_bytes: 100, database_read_documents: 10 },
        }),
        functionExecution({
          functionPath: "a:persisting",
          requestId: "current-a-2",
          timestamp: BASE_TIMESTAMP + 1,
          usage: { database_io_read_bytes: 200, database_read_documents: 20 },
        }),
      ]),
      metadata("current-sha"),
    );

    const comparison = compareFunctionExecutionReports(baseline, current);

    expect(comparison.functions.map(({ change, function: entry }) => [entry.path, change])).toEqual([
      ["a:persisting", "persisting"],
      ["b:removed", "removed"],
      ["c:added", "added"],
    ]);
    const persisting = comparison.functions[0];
    expect(persisting?.delta.calls).toEqual({ baseline: 1, current: 2, absolute: 1, percent: 100 });
    expect(persisting?.delta.usageTotals.databaseReadDocuments).toEqual({
      baseline: 10,
      current: 30,
      absolute: 20,
      percent: 200,
    });
    expect(persisting?.delta.usagePerCall.databaseReadDocuments).toEqual({
      baseline: 10,
      current: 15,
      absolute: 5,
      percent: 50,
    });
    expect(comparison.functions[1]?.delta.calls.absolute).toBe(-1);
    expect(comparison.functions[2]?.delta.calls).toMatchObject({ baseline: 0, current: 1, percent: null });
  });
});

describe("nearestRankPercentile", () => {
  it("入力を変更せずnearest-rankのp50とp95を返す", () => {
    const values = [100, 10, 30, 20];

    expect(nearestRankPercentile(values, 0.5)).toBe(20);
    expect(nearestRankPercentile(values, 0.95)).toBe(100);
    expect(values).toEqual([100, 10, 30, 20]);
  });
});
