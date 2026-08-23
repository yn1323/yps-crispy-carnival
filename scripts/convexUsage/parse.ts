import {
  FUNCTION_STATUSES,
  FUNCTION_TYPES,
  functionIdentityKey,
  type NormalizedFunctionExecution,
  type ParsedFunctionExecutionInput,
  type ReportMetadata,
  RUN_REASONS,
  type RunReason,
  type UsageMetrics,
} from "./model";

const functionTypeSet = new Set<string>(FUNCTION_TYPES);
const functionStatusSet = new Set<string>(FUNCTION_STATUSES);
const runReasonSet = new Set<string>(RUN_REASONS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  isNonNegativeFiniteNumber(value) && Number.isInteger(value);

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

const hasControlCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const isSafeFunctionPath = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512 && !hasControlCharacter(value);

const isSafeRequestId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && !hasControlCharacter(value);

const parseJsonRecords = (source: string) => {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { records: [] as unknown[], invalidRecords: 0 };

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { records: Array.isArray(parsed) ? parsed : [parsed], invalidRecords: 0 };
  } catch {
    const records: unknown[] = [];
    let invalidRecords = 0;

    for (const line of source.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (Array.isArray(parsed)) records.push(...parsed);
        else records.push(parsed);
      } catch {
        invalidRecords += 1;
      }
    }

    return { records, invalidRecords };
  }
};

const readOptionalUsageNumber = (usage: Record<string, unknown>, field: string): number | null => {
  const value = usage[field];
  if (value === undefined) return 0;
  return isNonNegativeFiniteNumber(value) ? value : null;
};

const normalizeUsage = (usage: Record<string, unknown>): UsageMetrics | null => {
  const databaseIoReadBytes = usage.database_io_read_bytes;
  const databaseIoWriteBytes = usage.database_io_write_bytes;
  const databaseReadDocuments = usage.database_read_documents;
  const databaseWriteDocuments = usage.database_write_documents;

  if (
    !isNonNegativeFiniteNumber(databaseIoReadBytes) ||
    !isNonNegativeFiniteNumber(databaseIoWriteBytes) ||
    !isNonNegativeInteger(databaseReadDocuments) ||
    !isNonNegativeInteger(databaseWriteDocuments)
  ) {
    return null;
  }

  const optional = {
    textSearchQueryBytes: readOptionalUsageNumber(usage, "text_search_query_bytes"),
    textSearchWriteQueryBytes: readOptionalUsageNumber(usage, "text_search_write_query_bytes"),
    vectorSearchQueryBytes: readOptionalUsageNumber(usage, "vector_search_query_bytes"),
    vectorSearchWriteQueryBytes: readOptionalUsageNumber(usage, "vector_search_write_query_bytes"),
    fileStorageReadBytes: readOptionalUsageNumber(usage, "file_storage_read_bytes"),
    networkEgressBytes: readOptionalUsageNumber(usage, "network_egress_bytes"),
    auditLogEgressBytes: readOptionalUsageNumber(usage, "audit_log_egress_bytes"),
  };
  if (Object.values(optional).some((value) => value === null)) return null;

  return {
    databaseIoReadBytes,
    databaseIoWriteBytes,
    databaseReadDocuments,
    databaseWriteDocuments,
    textSearchQueryBytes: optional.textSearchQueryBytes ?? 0,
    textSearchWriteQueryBytes: optional.textSearchWriteQueryBytes ?? 0,
    vectorSearchQueryBytes: optional.vectorSearchQueryBytes ?? 0,
    vectorSearchWriteQueryBytes: optional.vectorSearchWriteQueryBytes ?? 0,
    fileStorageReadBytes: optional.fileStorageReadBytes ?? 0,
    networkEgressBytes: optional.networkEgressBytes ?? 0,
    auditLogEgressBytes: optional.auditLogEgressBytes ?? 0,
  };
};

const normalizeRunReason = (value: unknown): RunReason => {
  if (typeof value !== "string") return "unspecified";
  return runReasonSet.has(value) ? (value as RunReason) : "other";
};

const normalizeFunctionExecution = (record: unknown): "ignored" | null | NormalizedFunctionExecution => {
  if (!isRecord(record)) return null;
  const data = isRecord(record.data) ? record.data : record;
  if (typeof data.topic !== "string") return null;
  if (data.topic !== "function_execution") return "ignored";

  const convex = isRecord(data.convex) ? data.convex : isRecord(record.convex) ? record.convex : null;
  const functionMetadata = isRecord(data.function) ? data.function : null;
  const usageMetadata = isRecord(data.usage) ? data.usage : null;
  if (!convex || !functionMetadata || !usageMetadata) return null;

  const deploymentName = convex.deployment_name;
  const deploymentType = convex.deployment_type;
  const projectSlug = convex.project_slug;
  const functionPath = functionMetadata.path;
  const functionType = functionMetadata.type;
  const requestId = functionMetadata.request_id;
  const cached = functionMetadata.cached;
  const timestamp = data.timestamp;
  const executionTimeMs = data.execution_time_ms;
  const status = data.status;
  const mutationRetryCount = data.mutation_retry_count;
  const occInfo = data.occ_info;
  const usage = normalizeUsage(usageMetadata);

  if (
    !isSafeIdentifier(deploymentName) ||
    !isSafeIdentifier(deploymentType) ||
    (projectSlug !== undefined && !isSafeIdentifier(projectSlug)) ||
    !isSafeFunctionPath(functionPath) ||
    typeof functionType !== "string" ||
    !functionTypeSet.has(functionType) ||
    !isSafeRequestId(requestId) ||
    (cached !== undefined && typeof cached !== "boolean") ||
    !isNonNegativeInteger(timestamp) ||
    !isNonNegativeFiniteNumber(executionTimeMs) ||
    typeof status !== "string" ||
    !functionStatusSet.has(status) ||
    (mutationRetryCount !== undefined && !isNonNegativeInteger(mutationRetryCount)) ||
    (occInfo !== undefined && !isRecord(occInfo)) ||
    !usage
  ) {
    return null;
  }

  const occRetryCount = isRecord(occInfo) ? occInfo.retry_count : undefined;
  if (occRetryCount !== undefined && !isNonNegativeInteger(occRetryCount)) return null;

  return {
    deployment: {
      name: deploymentName,
      type: deploymentType,
      projectSlug: typeof projectSlug === "string" ? projectSlug : null,
    },
    function: {
      path: functionPath,
      type: functionType as NormalizedFunctionExecution["function"]["type"],
    },
    timestamp,
    requestId,
    cached: cached === true,
    status: status as NormalizedFunctionExecution["status"],
    runReason: normalizeRunReason(data.run_reason),
    executionTimeMs,
    mutationRetryCount: mutationRetryCount ?? 0,
    occ: occInfo !== undefined,
    occRetryCount: occRetryCount ?? 0,
    usage,
  };
};

const parseMetadata = (metadata: ReportMetadata) => {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(metadata.releaseId)) {
    throw new Error("release IDは英数字、ドット、underscore、hyphenの128文字以内で指定してください。");
  }
  const periodStartMs = Date.parse(metadata.periodStart);
  const periodEndMs = Date.parse(metadata.periodEnd);
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs) || periodStartMs >= periodEndMs) {
    throw new Error("計測期間はperiod startよりperiod endが後になるISO 8601形式で指定してください。");
  }
  return {
    metadata: {
      releaseId: metadata.releaseId,
      periodStart: new Date(periodStartMs).toISOString(),
      periodEnd: new Date(periodEndMs).toISOString(),
    },
    periodStartMs,
    periodEndMs,
  };
};

const dedupeKey = (event: NormalizedFunctionExecution) =>
  [functionIdentityKey(event), event.requestId, String(event.timestamp)].join("\u0000");

export function parseFunctionExecutionInput(source: string, metadata: ReportMetadata): ParsedFunctionExecutionInput {
  const period = parseMetadata(metadata);
  const parsed = parseJsonRecords(source);
  const input = {
    totalRecords: parsed.records.length + parsed.invalidRecords,
    includedEvents: 0,
    duplicateEvents: 0,
    invalidRecords: parsed.invalidRecords,
    ignoredRecords: 0,
    outsidePeriodEvents: 0,
  };
  const dedupeKeys = new Set<string>();
  const events: NormalizedFunctionExecution[] = [];

  for (const record of parsed.records) {
    const normalized = normalizeFunctionExecution(record);
    if (normalized === "ignored") {
      input.ignoredRecords += 1;
      continue;
    }
    if (!normalized) {
      input.invalidRecords += 1;
      continue;
    }
    const key = dedupeKey(normalized);
    if (dedupeKeys.has(key)) {
      input.duplicateEvents += 1;
      continue;
    }
    dedupeKeys.add(key);
    if (normalized.timestamp < period.periodStartMs || normalized.timestamp >= period.periodEndMs) {
      input.outsidePeriodEvents += 1;
      continue;
    }
    events.push(normalized);
  }

  input.includedEvents = events.length;
  return { metadata: period.metadata, input, events };
}
