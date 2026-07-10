import { dateToUtcMs, formatUtcDate } from "../_lib/dateFormat";
import { ANALYTICS_METRICS, allNotificationEventMetrics } from "../analytics/metrics";
import { ANALYTICS_QUERY_RANGE_LIMIT, FEATURE_REQUEST_LIST_LIMIT } from "../constants";
import type { AnalyticsDashboardRequest, ShopRankingSort } from "./dto";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EVENT_TREND_METRICS = 12;
const MAX_SHOP_RANKING_LIMIT = 100;
export const ANALYTICS_DASHBOARD_MAX_BODY_BYTES = 16 * 1024;
export const ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT = 500;

const allowedMetrics = new Set<string>([...Object.values(ANALYTICS_METRICS), ...allNotificationEventMetrics()]);
const shopRankingSorts: readonly ShopRankingSort[] = [
  "staffCount",
  "shiftTargetStaffCount",
  "lineLinkedRate",
  "openRecruitmentCount",
];

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDateParts(value: string): ParseResult<{ utcMs: number }> {
  if (!DATE_PATTERN.test(value)) return { ok: false, message: "日付はYYYY-MM-DDで指定してください" };
  const utcMs = dateToUtcMs(value);
  if (formatUtcDate(utcMs) !== value) {
    return { ok: false, message: "日付が正しくありません" };
  }
  return { ok: true, value: { utcMs } };
}

function validateDateRange(from: string, to: string): ParseResult<{ from: string; to: string }> {
  const fromDate = parseDateParts(from);
  if (!fromDate.ok) return fromDate;
  const toDate = parseDateParts(to);
  if (!toDate.ok) return toDate;
  const dayCount = Math.floor((toDate.value.utcMs - fromDate.value.utcMs) / MS_PER_DAY) + 1;
  if (dayCount < 1) return { ok: false, message: "開始日は終了日以前にしてください" };
  if (dayCount > ANALYTICS_QUERY_RANGE_LIMIT) {
    return { ok: false, message: `取得期間は${ANALYTICS_QUERY_RANGE_LIMIT}日以内にしてください` };
  }
  return { ok: true, value: { from, to } };
}

function readString(input: Record<string, unknown>, key: string): ParseResult<string> {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: `${key}を指定してください` };
  }
  return { ok: true, value };
}

function readRange(input: Record<string, unknown>): ParseResult<{ from: string; to: string }> {
  const from = readString(input, "from");
  if (!from.ok) return from;
  const to = readString(input, "to");
  if (!to.ok) return to;
  return validateDateRange(from.value, to.value);
}

function readFeatureRequestPagination(
  input: Record<string, unknown>,
): ParseResult<{ cursor: string | null; limit: number }> {
  const cursor = input.cursor;
  if (cursor !== null && typeof cursor !== "string") {
    return { ok: false, message: "cursorが正しくありません" };
  }
  const limit = input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > FEATURE_REQUEST_LIST_LIMIT) {
    return { ok: false, message: `limitは1から${FEATURE_REQUEST_LIST_LIMIT}で指定してください` };
  }
  return { ok: true, value: { cursor, limit } };
}

function readMetrics(input: Record<string, unknown>): ParseResult<string[]> {
  const metrics = input.metrics;
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return { ok: false, message: "集計項目を1件以上指定してください" };
  }
  if (metrics.length > MAX_EVENT_TREND_METRICS) {
    return { ok: false, message: `集計項目は${MAX_EVENT_TREND_METRICS}件以内にしてください` };
  }
  const uniqueMetrics = [...new Set(metrics)];
  if (!uniqueMetrics.every((metric): metric is string => typeof metric === "string" && allowedMetrics.has(metric))) {
    return { ok: false, message: "対応していない集計項目が含まれています" };
  }
  return { ok: true, value: uniqueMetrics };
}

export function parseAnalyticsDashboardRequest(input: unknown): ParseResult<AnalyticsDashboardRequest> {
  if (!isRecord(input)) return { ok: false, message: "リクエスト形式が正しくありません" };
  const kind = input.kind;
  if (kind === "overview") {
    const range = readRange(input);
    if (!range.ok) return range;
    return { ok: true, value: { kind, ...range.value } };
  }
  if (kind === "eventTrends") {
    const range = readRange(input);
    if (!range.ok) return range;
    const metrics = readMetrics(input);
    if (!metrics.ok) return metrics;
    return { ok: true, value: { kind, ...range.value, metrics: metrics.value } };
  }
  if (kind === "notificationBreakdown") {
    const range = readRange(input);
    if (!range.ok) return range;
    return { ok: true, value: { kind, ...range.value } };
  }
  if (kind === "shopStages") {
    const date = readString(input, "date");
    if (!date.ok) return date;
    const parsedDate = parseDateParts(date.value);
    if (!parsedDate.ok) return parsedDate;
    return { ok: true, value: { kind, date: date.value } };
  }
  if (kind === "shopRanking") {
    const date = readString(input, "date");
    if (!date.ok) return date;
    const parsedDate = parseDateParts(date.value);
    if (!parsedDate.ok) return parsedDate;
    const sort = input.sort;
    if (typeof sort !== "string" || !shopRankingSorts.includes(sort as ShopRankingSort)) {
      return { ok: false, message: "並び順が正しくありません" };
    }
    const limit = input.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_SHOP_RANKING_LIMIT) {
      return { ok: false, message: `limitは1から${MAX_SHOP_RANKING_LIMIT}で指定してください` };
    }
    return { ok: true, value: { kind, date: date.value, sort: sort as ShopRankingSort, limit } };
  }
  if (kind === "shopRecruitments") {
    const shopId = readString(input, "shopId");
    if (!shopId.ok) return shopId;
    return { ok: true, value: { kind, shopId: shopId.value } };
  }
  if (kind === "featureRequests") {
    const pagination = readFeatureRequestPagination(input);
    if (!pagination.ok) return pagination;
    return { ok: true, value: { kind, ...pagination.value } };
  }
  if (kind === "shopDetail") {
    const range = readRange(input);
    if (!range.ok) return range;
    const shopId = readString(input, "shopId");
    if (!shopId.ok) return shopId;
    return { ok: true, value: { kind, ...range.value, shopId: shopId.value } };
  }
  return { ok: false, message: "取得種別が正しくありません" };
}
