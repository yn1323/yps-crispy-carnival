import { dateToUtcMs, formatUtcDate } from "../_lib/dateFormat";
import type {
  AnalyticsCompleteness,
  AnalyticsDirection,
  AnalyticsGranularity,
  AnalyticsHealthSignalKey,
  AnalyticsPlanKey,
  AnalyticsSegmentDimension,
  AnalyticsTrendMetric,
} from "./dto";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COHORT_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const ANALYTICS_DASHBOARD_MAX_BODY_BYTES = 16 * 1024;
export const ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES = 512 * 1024;
export const ANALYTICS_DASHBOARD_DEFAULT_PAGE_SIZE = 50;
export const ANALYTICS_DASHBOARD_MAX_PAGE_SIZE = 100;
export const ANALYTICS_DASHBOARD_MAX_TREND_POINTS = 366;
export const ANALYTICS_DASHBOARD_MAX_RANGE_DAYS = 1_831;
export const ANALYTICS_DASHBOARD_MAX_SCAN_ROWS = 500;
export const FEATURE_REQUEST_MAX_PAGE_SIZE = 50;

const granularities: readonly AnalyticsGranularity[] = ["day", "week", "month"];
const plans: readonly AnalyticsPlanKey[] = ["trial", "free", "pro", "business"];
const completenessValues: readonly AnalyticsCompleteness[] = ["complete", "partial", "unavailable"];
const directions: readonly AnalyticsDirection[] = ["asc", "desc"];
const healthSignals: readonly AnalyticsHealthSignalKey[] = [
  "hasUpcomingCycle",
  "nextCycleMissing",
  "cadenceDelayed",
  "notificationFailure",
  "submissionDrop",
  "confirmationDelay",
  "longInactive",
  "insufficientData",
];
const segmentDimensions: readonly AnalyticsSegmentDimension[] = [
  "registrationCohort",
  "plan",
  "organizationShopCount",
  "shopStaffSize",
  "cadence",
  "lineUsage",
  "submissionTrend",
  "adoptionAge",
];
const trendMetrics: readonly AnalyticsTrendMetric[] = [
  "organizationCount",
  "shopCount",
  "kpiEligibleShopCount",
  "activeShopCount",
  "personCount",
  "staffMembershipCount",
  "unlinkedStaffCount",
  "shiftTargetCount",
  "managerMembershipCount",
  "managerStaffCount",
  "northStarRate",
  "deadlineSubmissionRate",
  "finalSubmissionRate",
];

const organizationSorts = ["registeredAt", "currentPlan"] as const;
const shopSorts = ["registeredAt", "currentPlan", "latestActivityAt"] as const;
const cycleSorts = ["periodStart"] as const;
const segmentSorts = ["dimension"] as const;
const shopSizeFilters = ["1-4", "5-9", "10-19", "20-49", "50+"] as const;
const cadenceFilters = ["weekly", "biweekly", "monthly", "other", "insufficientData"] as const;
const lineUsageFilters = ["none", "low", "medium", "high"] as const;
const shopHealthFilters = [...healthSignals, "needsAttention"] as const;

export type AnalyticsOrganizationSort = (typeof organizationSorts)[number];
export type AnalyticsShopSort = (typeof shopSorts)[number];
export type AnalyticsCycleSort = (typeof cycleSorts)[number];
export type AnalyticsSegmentSort = (typeof segmentSorts)[number];
export type AnalyticsShopSizeFilter = (typeof shopSizeFilters)[number];
export type AnalyticsCadenceFilter = (typeof cadenceFilters)[number];
export type AnalyticsLineUsageFilter = (typeof lineUsageFilters)[number];

type DateRange = { from: string; to: string };
type SeriesRange = DateRange & { granularity: AnalyticsGranularity };
type Pagination = { cursor: string | null; limit: number };
type Sort<T extends string> = { sort: T; direction: AnalyticsDirection };

export type AnalyticsOverviewRequest = {
  endpoint: "overview";
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  organizationId: string | null;
  shopId: string | null;
};

export type AnalyticsTrendsRequest = {
  endpoint: "trends";
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  metrics: AnalyticsTrendMetric[];
  organizationId: string | null;
  shopId: string | null;
};

export type AnalyticsMilestonesRequest = SeriesRange & {
  endpoint: "milestones";
  organizationId: string | null;
  shopId: string | null;
};

export type AnalyticsHealthRequest = SeriesRange & {
  endpoint: "health";
  organizationId: string | null;
  shopId: string | null;
};

export type AnalyticsOrganizationsRequest = DateRange &
  Pagination &
  Sort<AnalyticsOrganizationSort> & {
    endpoint: "organizations";
    plan: AnalyticsPlanKey | null;
    completeness: AnalyticsCompleteness | null;
  };

export type AnalyticsOrganizationRequest = SeriesRange &
  Pagination & {
    endpoint: "organization";
    organizationId: string;
  };

export type AnalyticsShopsRequest = DateRange &
  Pagination &
  Sort<AnalyticsShopSort> & {
    endpoint: "shops";
    organizationId: string | null;
    plan: AnalyticsPlanKey | null;
    shopSize: AnalyticsShopSizeFilter | null;
    cohort: string | null;
    cadence: AnalyticsCadenceFilter | null;
    lineUsage: AnalyticsLineUsageFilter | null;
    health: AnalyticsHealthSignalKey | "needsAttention" | null;
    completeness: AnalyticsCompleteness | null;
  };

export type AnalyticsShopRequest = SeriesRange & {
  endpoint: "shop";
  shopId: string;
};

export type AnalyticsShopCyclesRequest = DateRange &
  Pagination &
  Sort<AnalyticsCycleSort> & {
    endpoint: "shopCycles";
    shopId: string;
    completeness: AnalyticsCompleteness | null;
  };

export type AnalyticsCycleRequest = {
  endpoint: "cycle";
  shopId: string;
  recruitmentId: string;
};

export type AnalyticsSegmentsRequest = DateRange &
  Pagination &
  Sort<AnalyticsSegmentSort> & {
    endpoint: "segments";
    dimension: AnalyticsSegmentDimension | null;
    completeness: AnalyticsCompleteness | null;
  };

export type FeatureRequestsRequest = Pagination & { endpoint: "requests" };

export type AnalyticsDashboardRequest =
  | AnalyticsOverviewRequest
  | AnalyticsTrendsRequest
  | AnalyticsMilestonesRequest
  | AnalyticsHealthRequest
  | AnalyticsOrganizationsRequest
  | AnalyticsOrganizationRequest
  | AnalyticsShopsRequest
  | AnalyticsShopRequest
  | AnalyticsShopCyclesRequest
  | AnalyticsCycleRequest
  | AnalyticsSegmentsRequest
  | FeatureRequestsRequest;

export type AnalyticsDashboardEndpoint = AnalyticsDashboardRequest["endpoint"];

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAllowedKeys(input: Record<string, unknown>, allowed: readonly string[]): ParseResult<null> {
  const allowedSet = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedSet.has(key))) {
    return { ok: false, message: "対応していないquery parameterが含まれています" };
  }
  return { ok: true, value: null };
}

function parseDate(value: unknown, key: string): ParseResult<{ value: string; utcMs: number }> {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return { ok: false, message: `${key}はYYYY-MM-DD形式で指定してください` };
  }
  const utcMs = dateToUtcMs(value);
  if (!Number.isFinite(utcMs) || formatUtcDate(utcMs) !== value) {
    return { ok: false, message: `${key}が正しくありません` };
  }
  return { ok: true, value: { value, utcMs } };
}

function readDateRange(input: Record<string, unknown>, series: boolean): ParseResult<SeriesRange> {
  const from = parseDate(input.from, "from");
  if (!from.ok) return from;
  const to = parseDate(input.to, "to");
  if (!to.ok) return to;
  const dayCount = Math.floor((to.value.utcMs - from.value.utcMs) / MS_PER_DAY) + 1;
  if (dayCount < 1) return { ok: false, message: "fromはto以前にしてください" };
  if (dayCount > ANALYTICS_DASHBOARD_MAX_RANGE_DAYS) {
    return { ok: false, message: "取得期間は5年以内にしてください" };
  }
  const granularity = readEnum(input.granularity, "granularity", granularities, "day");
  if (!granularity.ok) return granularity;
  if (granularity.value === null) return { ok: false, message: "granularityが正しくありません" };
  if (series && granularity.value === "day" && dayCount > ANALYTICS_DASHBOARD_MAX_TREND_POINTS) {
    return { ok: false, message: "日次trendは366日以内にしてください" };
  }
  return { ok: true, value: { from: from.value.value, to: to.value.value, granularity: granularity.value } };
}

function readNullableDateRange(
  input: Record<string, unknown>,
  fromKey: string,
  toKey: string,
): ParseResult<{ from: string | null; to: string | null }> {
  const fromValue = input[fromKey];
  const toValue = input[toKey];
  if (fromValue === null && toValue === null) return { ok: true, value: { from: null, to: null } };
  if (fromValue === null || toValue === null) {
    return { ok: false, message: `${fromKey}と${toKey}は両方指定してください` };
  }
  const from = parseDate(fromValue, fromKey);
  if (!from.ok) return from;
  const to = parseDate(toValue, toKey);
  if (!to.ok) return to;
  const dayCount = Math.floor((to.value.utcMs - from.value.utcMs) / MS_PER_DAY) + 1;
  if (dayCount < 1) return { ok: false, message: `${fromKey}は${toKey}以前にしてください` };
  if (dayCount > ANALYTICS_DASHBOARD_MAX_RANGE_DAYS) {
    return { ok: false, message: "比較期間は5年以内にしてください" };
  }
  return { ok: true, value: { from: from.value.value, to: to.value.value } };
}

function readEnum<T extends string>(
  value: unknown,
  key: string,
  allowed: readonly T[],
  defaultValue: T | null,
): ParseResult<T | null> {
  if (value === null) return { ok: true, value: defaultValue };
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return { ok: false, message: `${key}が正しくありません` };
  }
  return { ok: true, value: value as T };
}

function readOpaqueId(value: unknown, key: string, required: true): ParseResult<string>;
function readOpaqueId(value: unknown, key: string, required: false): ParseResult<string | null>;
function readOpaqueId(value: unknown, key: string, required: boolean): ParseResult<string | null> {
  if (value === null && !required) return { ok: true, value: null };
  if (typeof value !== "string" || !OPAQUE_ID_PATTERN.test(value)) {
    return { ok: false, message: `${key}が正しくありません` };
  }
  return { ok: true, value };
}

function readCohort(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !COHORT_PATTERN.test(value)) {
    return { ok: false, message: "cohortが正しくありません" };
  }
  return { ok: true, value };
}

function readCursor(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || hasControlCharacter(value)) {
    return { ok: false, message: "cursorが正しくありません" };
  }
  return { ok: true, value };
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function readPagination(input: Record<string, unknown>): ParseResult<Pagination> {
  const cursor = readCursor(input.cursor);
  if (!cursor.ok) return cursor;
  const limit = input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > ANALYTICS_DASHBOARD_MAX_PAGE_SIZE) {
    return { ok: false, message: `limitは1から${ANALYTICS_DASHBOARD_MAX_PAGE_SIZE}で指定してください` };
  }
  return { ok: true, value: { cursor: cursor.value, limit } };
}

function readScope(input: Record<string, unknown>) {
  const organizationId = readOpaqueId(input.organizationId, "organizationId", false);
  if (!organizationId.ok) return organizationId;
  const shopId = readOpaqueId(input.shopId, "shopId", false);
  if (!shopId.ok) return shopId;
  if (organizationId.value !== null && shopId.value !== null) {
    return { ok: false as const, message: "organizationIdとshopIdは同時に指定できません" };
  }
  return { ok: true as const, value: { organizationId: organizationId.value, shopId: shopId.value } };
}

function readTrendMetrics(value: unknown): ParseResult<AnalyticsTrendMetric[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > trendMetrics.length) {
    return { ok: false, message: "metricsが正しくありません" };
  }
  const unique = [...new Set(value)];
  if (
    !unique.every(
      (metric): metric is AnalyticsTrendMetric =>
        typeof metric === "string" && trendMetrics.includes(metric as AnalyticsTrendMetric),
    )
  ) {
    return { ok: false, message: "対応していないmetricが含まれています" };
  }
  return { ok: true, value: unique };
}

function readSeriesRequest(input: Record<string, unknown>, allowedKeys: readonly string[]) {
  const keys = validateAllowedKeys(input, ["endpoint", "from", "to", "granularity", ...allowedKeys]);
  if (!keys.ok) return keys;
  const range = readDateRange(input, true);
  if (!range.ok) return range;
  return { ok: true as const, value: range.value };
}

export function parseAnalyticsDashboardRequest(inputValue: unknown): ParseResult<AnalyticsDashboardRequest> {
  if (!isRecord(inputValue) || typeof inputValue.endpoint !== "string") {
    return { ok: false, message: "リクエスト形式が正しくありません" };
  }
  const input = inputValue;

  if (input.endpoint === "overview") {
    const keys = validateAllowedKeys(input, [
      "endpoint",
      "from",
      "to",
      "compareFrom",
      "compareTo",
      "organizationId",
      "shopId",
    ]);
    if (!keys.ok) return keys;
    const range = readDateRange({ ...input, granularity: "day" }, false);
    if (!range.ok) return range;
    const comparison = readNullableDateRange(input, "compareFrom", "compareTo");
    if (!comparison.ok) return comparison;
    const scope = readScope(input);
    if (!scope.ok) return scope;
    return {
      ok: true,
      value: {
        endpoint: "overview",
        from: range.value.from,
        to: range.value.to,
        compareFrom: comparison.value.from,
        compareTo: comparison.value.to,
        ...scope.value,
      },
    };
  }

  if (input.endpoint === "trends") {
    const series = readSeriesRequest(input, ["metrics", "organizationId", "shopId"]);
    if (!series.ok) return series;
    const metrics = readTrendMetrics(input.metrics);
    if (!metrics.ok) return metrics;
    const scope = readScope(input);
    if (!scope.ok) return scope;
    return { ok: true, value: { endpoint: "trends", ...series.value, metrics: metrics.value, ...scope.value } };
  }

  if (input.endpoint === "milestones" || input.endpoint === "health") {
    const series = readSeriesRequest(input, ["organizationId", "shopId"]);
    if (!series.ok) return series;
    const scope = readScope(input);
    if (!scope.ok) return scope;
    return { ok: true, value: { endpoint: input.endpoint, ...series.value, ...scope.value } };
  }

  if (input.endpoint === "organizations") {
    const keys = validateAllowedKeys(input, [
      "endpoint",
      "from",
      "to",
      "cursor",
      "limit",
      "sort",
      "direction",
      "plan",
      "completeness",
    ]);
    if (!keys.ok) return keys;
    const range = readDateRange({ ...input, granularity: "day" }, false);
    if (!range.ok) return range;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    const sort = readEnum(input.sort, "sort", organizationSorts, "registeredAt");
    if (!sort.ok || sort.value === null) return sort as ParseResult<never>;
    const direction = readEnum(input.direction, "direction", directions, "desc");
    if (!direction.ok || direction.value === null) return direction as ParseResult<never>;
    const plan = readEnum(input.plan, "plan", plans, null);
    if (!plan.ok) return plan;
    const completeness = readEnum(input.completeness, "completeness", completenessValues, null);
    if (!completeness.ok) return completeness;
    return {
      ok: true,
      value: {
        endpoint: "organizations",
        from: range.value.from,
        to: range.value.to,
        ...pagination.value,
        sort: sort.value,
        direction: direction.value,
        plan: plan.value,
        completeness: completeness.value,
      },
    };
  }

  if (input.endpoint === "organization") {
    const series = readSeriesRequest(input, ["organizationId", "cursor", "limit"]);
    if (!series.ok) return series;
    const organizationId = readOpaqueId(input.organizationId, "organizationId", true);
    if (!organizationId.ok) return organizationId;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    return {
      ok: true,
      value: { endpoint: "organization", ...series.value, ...pagination.value, organizationId: organizationId.value },
    };
  }

  if (input.endpoint === "shops") {
    const keys = validateAllowedKeys(input, [
      "endpoint",
      "from",
      "to",
      "cursor",
      "limit",
      "sort",
      "direction",
      "organizationId",
      "plan",
      "shopSize",
      "cohort",
      "cadence",
      "lineUsage",
      "health",
      "completeness",
    ]);
    if (!keys.ok) return keys;
    const range = readDateRange({ ...input, granularity: "day" }, false);
    if (!range.ok) return range;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    const sort = readEnum(input.sort, "sort", shopSorts, "latestActivityAt");
    if (!sort.ok || sort.value === null) return sort as ParseResult<never>;
    const direction = readEnum(input.direction, "direction", directions, "desc");
    if (!direction.ok || direction.value === null) return direction as ParseResult<never>;
    const organizationId = readOpaqueId(input.organizationId, "organizationId", false);
    if (!organizationId.ok) return organizationId;
    const plan = readEnum(input.plan, "plan", plans, null);
    if (!plan.ok) return plan;
    const shopSize = readEnum(input.shopSize, "shopSize", shopSizeFilters, null);
    if (!shopSize.ok) return shopSize;
    const cohort = readCohort(input.cohort);
    if (!cohort.ok) return cohort;
    const cadence = readEnum(input.cadence, "cadence", cadenceFilters, null);
    if (!cadence.ok) return cadence;
    const lineUsage = readEnum(input.lineUsage, "lineUsage", lineUsageFilters, null);
    if (!lineUsage.ok) return lineUsage;
    const health = readEnum(input.health, "health", shopHealthFilters, null);
    if (!health.ok) return health;
    const completeness = readEnum(input.completeness, "completeness", completenessValues, null);
    if (!completeness.ok) return completeness;
    return {
      ok: true,
      value: {
        endpoint: "shops",
        from: range.value.from,
        to: range.value.to,
        ...pagination.value,
        sort: sort.value,
        direction: direction.value,
        organizationId: organizationId.value,
        plan: plan.value,
        shopSize: shopSize.value,
        cohort: cohort.value,
        cadence: cadence.value,
        lineUsage: lineUsage.value,
        health: health.value,
        completeness: completeness.value,
      },
    };
  }

  if (input.endpoint === "shop") {
    const series = readSeriesRequest(input, ["shopId"]);
    if (!series.ok) return series;
    const shopId = readOpaqueId(input.shopId, "shopId", true);
    if (!shopId.ok) return shopId;
    return { ok: true, value: { endpoint: "shop", ...series.value, shopId: shopId.value } };
  }

  if (input.endpoint === "shopCycles") {
    const keys = validateAllowedKeys(input, [
      "endpoint",
      "from",
      "to",
      "cursor",
      "limit",
      "sort",
      "direction",
      "shopId",
      "completeness",
    ]);
    if (!keys.ok) return keys;
    const range = readDateRange({ ...input, granularity: "day" }, false);
    if (!range.ok) return range;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    const sort = readEnum(input.sort, "sort", cycleSorts, "periodStart");
    if (!sort.ok || sort.value === null) return sort as ParseResult<never>;
    const direction = readEnum(input.direction, "direction", directions, "desc");
    if (!direction.ok || direction.value === null) return direction as ParseResult<never>;
    const shopId = readOpaqueId(input.shopId, "shopId", true);
    if (!shopId.ok) return shopId;
    const completeness = readEnum(input.completeness, "completeness", completenessValues, null);
    if (!completeness.ok) return completeness;
    return {
      ok: true,
      value: {
        endpoint: "shopCycles",
        from: range.value.from,
        to: range.value.to,
        ...pagination.value,
        sort: sort.value,
        direction: direction.value,
        shopId: shopId.value,
        completeness: completeness.value,
      },
    };
  }

  if (input.endpoint === "cycle") {
    const keys = validateAllowedKeys(input, ["endpoint", "shopId", "recruitmentId"]);
    if (!keys.ok) return keys;
    const shopId = readOpaqueId(input.shopId, "shopId", true);
    if (!shopId.ok) return shopId;
    const recruitmentId = readOpaqueId(input.recruitmentId, "recruitmentId", true);
    if (!recruitmentId.ok) return recruitmentId;
    return { ok: true, value: { endpoint: "cycle", shopId: shopId.value, recruitmentId: recruitmentId.value } };
  }

  if (input.endpoint === "segments") {
    const keys = validateAllowedKeys(input, [
      "endpoint",
      "from",
      "to",
      "cursor",
      "limit",
      "sort",
      "direction",
      "dimension",
      "completeness",
    ]);
    if (!keys.ok) return keys;
    const range = readDateRange({ ...input, granularity: "day" }, false);
    if (!range.ok) return range;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    const sort = readEnum(input.sort, "sort", segmentSorts, "dimension");
    if (!sort.ok || sort.value === null) return sort as ParseResult<never>;
    const direction = readEnum(input.direction, "direction", directions, "asc");
    if (!direction.ok || direction.value === null) return direction as ParseResult<never>;
    const dimension = readEnum(input.dimension, "dimension", segmentDimensions, null);
    if (!dimension.ok) return dimension;
    const completeness = readEnum(input.completeness, "completeness", completenessValues, null);
    if (!completeness.ok) return completeness;
    return {
      ok: true,
      value: {
        endpoint: "segments",
        from: range.value.from,
        to: range.value.to,
        ...pagination.value,
        sort: sort.value,
        direction: direction.value,
        dimension: dimension.value,
        completeness: completeness.value,
      },
    };
  }

  if (input.endpoint === "requests") {
    const keys = validateAllowedKeys(input, ["endpoint", "cursor", "limit"]);
    if (!keys.ok) return keys;
    const pagination = readPagination(input);
    if (!pagination.ok) return pagination;
    if (pagination.value.limit > FEATURE_REQUEST_MAX_PAGE_SIZE) {
      return { ok: false, message: `limitは1から${FEATURE_REQUEST_MAX_PAGE_SIZE}で指定してください` };
    }
    return { ok: true, value: { endpoint: "requests", ...pagination.value } };
  }

  return { ok: false, message: "endpointが正しくありません" };
}

export function parseSearchParams(params: URLSearchParams): ParseResult<Record<string, string | null>> {
  const result = Object.create(null) as Record<string, string | null>;
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (values.length !== 1) return { ok: false, message: `${key}は一つだけ指定してください` };
    result[key] = values[0] ?? null;
  }
  return { ok: true, value: result };
}

export function normalizeBrowserRequestInput(
  endpoint: AnalyticsDashboardEndpoint,
  params: URLSearchParams,
  pathIds: { organizationId?: string; shopId?: string; recruitmentId?: string } = {},
): ParseResult<AnalyticsDashboardRequest> {
  const parsedParams = parseSearchParams(params);
  if (!parsedParams.ok) return parsedParams;
  const reservedKeys = ["endpoint", ...Object.keys(pathIds)];
  if (reservedKeys.some((key) => Object.hasOwn(parsedParams.value, key))) {
    return { ok: false, message: "pathで指定する値をquery parameterへ重複指定できません" };
  }
  const raw: Record<string, unknown> = { ...parsedParams.value, endpoint, ...pathIds };
  if (endpoint === "overview") {
    raw.compareFrom ??= null;
    raw.compareTo ??= null;
    raw.organizationId ??= null;
    raw.shopId ??= null;
  }
  if (["trends", "milestones", "health", "organization", "shop"].includes(endpoint)) {
    raw.granularity ??= "day";
  }
  if (["trends", "milestones", "health"].includes(endpoint)) {
    raw.organizationId ??= null;
    raw.shopId ??= null;
  }
  if (["organizations", "organization", "shops", "shopCycles", "segments", "requests"].includes(endpoint)) {
    raw.cursor ??= null;
    raw.limit =
      raw.limit === null || raw.limit === undefined ? ANALYTICS_DASHBOARD_DEFAULT_PAGE_SIZE : Number(raw.limit);
  }
  if (["organizations", "shops", "shopCycles", "segments"].includes(endpoint)) {
    raw.sort ??= null;
    raw.direction ??= null;
    raw.completeness ??= null;
  }
  if (endpoint === "organizations") raw.plan ??= null;
  if (endpoint === "shops") {
    raw.organizationId ??= null;
    raw.plan ??= null;
    raw.shopSize ??= null;
    raw.cohort ??= null;
    raw.cadence ??= null;
    raw.lineUsage ??= null;
    raw.health ??= null;
  }
  if (endpoint === "segments") raw.dimension ??= null;
  if (endpoint === "trends") {
    raw.metrics = typeof raw.metrics === "string" ? raw.metrics.split(",").filter(Boolean) : raw.metrics;
  }
  return parseAnalyticsDashboardRequest(raw);
}
