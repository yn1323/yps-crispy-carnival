import { dateToUtcMs, formatUtcDate } from "../_lib/dateFormat";
import type { AnalyticsMetric, AnalyticsRangeDays } from "./dto";

export const ANALYTICS_DASHBOARD_MAX_BODY_BYTES = 16 * 1024;
export const ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES = 512 * 1024;
export const ANALYTICS_DASHBOARD_DEFAULT_PAGE_SIZE = 50;
export const ANALYTICS_DASHBOARD_MAX_PAGE_SIZE = 100;
export const ANALYTICS_DASHBOARD_MAX_SCAN_ROWS = 500;
export const FEATURE_REQUEST_MAX_PAGE_SIZE = 50;
type Pagination = { cursor: string | null; limit: number };
export type AnalyticsOverviewRequest = { endpoint: "overview"; rangeDays: AnalyticsRangeDays };
export type AnalyticsShopsRequest = Pagination & {
  endpoint: "shops";
  search: string;
  date: string | null;
  metric: AnalyticsMetric | null;
};
export type AnalyticsShopRequest = Pagination & { endpoint: "shop"; shopId: string };
export type AnalyticsStaffRequest = Pagination & { endpoint: "staff"; shopId: string; staffId: string };
export type AnalyticsCycleRequest = { endpoint: "cycle"; shopId: string; recruitmentId: string };
export type FeatureRequestsRequest = Pagination & { endpoint: "requests" };
export type FeatureRequestUpdateRequest = { endpoint: "setFeatureRequestDeleted"; id: string; isDeleted: boolean };
export type AnalyticsDashboardRequest =
  | AnalyticsOverviewRequest
  | AnalyticsShopsRequest
  | AnalyticsShopRequest
  | AnalyticsStaffRequest
  | AnalyticsCycleRequest
  | FeatureRequestsRequest;
export type AnalyticsDashboardEndpoint = AnalyticsDashboardRequest["endpoint"];
type ParseResult<T> = { ok: true; value: T } | { ok: false };
const invalid = { ok: false } as const;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const metrics: readonly AnalyticsMetric[] = ["registered", "submitted", "confirmed"];
export function isAnalyticsDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && formatUtcDate(dateToUtcMs(value)) === value;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}
function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function pagination(value: Record<string, unknown>, maximum = 100): Pagination | null {
  const cursor = value.cursor ?? null;
  const limit = value.limit ?? Math.min(50, maximum);
  if (cursor !== null && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 4096)) return null;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > maximum) return null;
  return { cursor, limit };
}
export function parseAnalyticsDashboardRequest(value: unknown): ParseResult<AnalyticsDashboardRequest> {
  if (!isObject(value)) return invalid;
  switch (value.endpoint) {
    case "overview": {
      const rangeDays = value.rangeDays ?? 30;
      return hasOnly(value, ["endpoint", "rangeDays"]) && (rangeDays === 7 || rangeDays === 30 || rangeDays === 90)
        ? { ok: true, value: { endpoint: "overview", rangeDays } }
        : invalid;
    }
    case "shops": {
      const page = pagination(value);
      const search = value.search ?? "";
      const date = value.date ?? null;
      const metric = value.metric ?? null;
      if (
        !hasOnly(value, ["endpoint", "cursor", "limit", "search", "date", "metric"]) ||
        !page ||
        typeof search !== "string" ||
        search.length > 100
      )
        return invalid;
      if (
        (date === null) !== (metric === null) ||
        (date !== null && !isAnalyticsDate(date)) ||
        (metric !== null && !metrics.includes(metric as AnalyticsMetric))
      )
        return invalid;
      return {
        ok: true,
        value: { endpoint: "shops", ...page, search: search.trim(), date, metric: metric as AnalyticsMetric | null },
      };
    }
    case "shop": {
      const page = pagination(value);
      return hasOnly(value, ["endpoint", "shopId", "cursor", "limit"]) && page && validId(value.shopId)
        ? { ok: true, value: { endpoint: "shop", shopId: value.shopId, ...page } }
        : invalid;
    }
    case "staff": {
      const page = pagination({ ...value, limit: value.limit ?? 20 }, 50);
      return hasOnly(value, ["endpoint", "shopId", "staffId", "cursor", "limit"]) &&
        page &&
        validId(value.shopId) &&
        validId(value.staffId)
        ? { ok: true, value: { endpoint: "staff", shopId: value.shopId, staffId: value.staffId, ...page } }
        : invalid;
    }
    case "cycle":
      return hasOnly(value, ["endpoint", "shopId", "recruitmentId"]) &&
        validId(value.shopId) &&
        validId(value.recruitmentId)
        ? { ok: true, value: { endpoint: "cycle", shopId: value.shopId, recruitmentId: value.recruitmentId } }
        : invalid;
    case "requests": {
      const page = pagination(value, FEATURE_REQUEST_MAX_PAGE_SIZE);
      return hasOnly(value, ["endpoint", "cursor", "limit"]) && page
        ? { ok: true, value: { endpoint: "requests", ...page } }
        : invalid;
    }
    default:
      return invalid;
  }
}
export function parseFeatureRequestUpdate(value: unknown): ParseResult<FeatureRequestUpdateRequest> {
  return isObject(value) &&
    hasOnly(value, ["endpoint", "id", "isDeleted"]) &&
    value.endpoint === "setFeatureRequestDeleted" &&
    validId(value.id) &&
    typeof value.isDeleted === "boolean"
    ? { ok: true, value: { endpoint: "setFeatureRequestDeleted", id: value.id, isDeleted: value.isDeleted } }
    : invalid;
}
export function normalizeBrowserRequestInput(
  endpoint: AnalyticsDashboardEndpoint,
  params: URLSearchParams,
  pathIds: { shopId?: string; staffId?: string; recruitmentId?: string } = {},
): ParseResult<AnalyticsDashboardRequest> {
  const value: Record<string, unknown> = { endpoint, ...pathIds };
  for (const [key, input] of params) {
    if (key === "__proto__" || Object.hasOwn(value, key)) return invalid;
    value[key] = key === "limit" || key === "rangeDays" ? Number(input) : input;
  }
  return parseAnalyticsDashboardRequest(value);
}
