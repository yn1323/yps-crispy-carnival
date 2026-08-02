import { useCallback, useEffect, useState } from "react";
import type {
  OrganizationParams,
  OrganizationsParams,
  OverviewParams,
  SegmentsParams,
  ShopCyclesParams,
  ShopParams,
  ShopsParams,
  TrendsParams,
} from "@/api/analyticsClient";
import type {
  AnalyticsCadenceFilter,
  AnalyticsCompleteness,
  AnalyticsHealthSignalKey,
  AnalyticsLineUsageFilter,
  AnalyticsOrganizationSort,
  AnalyticsPlanKey,
  AnalyticsSegmentDimension,
  AnalyticsShopSizeFilter,
  AnalyticsShopSort,
} from "@/api/analyticsTypes";

export type AnalyticsGranularity = "day" | "week" | "month";
export type SortDirection = "asc" | "desc";

export type AnalyticsSearchState = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  granularity: AnalyticsGranularity;
  organizationId?: string;
  shopId?: string;
  plan?: string;
  shopSize?: string;
  cohort?: string;
  cadence?: string;
  lineUsage?: string;
  health?: string;
  completeness?: string;
  dimension?: string;
  sort?: string;
  direction: SortDirection;
  cursor?: string;
  segmentCursor?: string;
};

const PLANS = ["trial", "free", "pro", "business"] as const;
const COMPLETENESS = ["complete", "partial", "unavailable"] as const;
const ORGANIZATION_SORTS = ["registeredAt", "currentPlan"] as const;
const SHOP_SORTS = ["registeredAt", "currentPlan", "latestActivityAt"] as const;
const SHOP_SIZES = ["1-4", "5-9", "10-19", "20-49", "50+"] as const;
const CADENCES = ["weekly", "biweekly", "monthly", "other", "insufficientData"] as const;
const LINE_USAGE = ["none", "low", "medium", "high"] as const;
const HEALTH = [
  "hasUpcomingCycle",
  "nextCycleMissing",
  "cadenceDelayed",
  "notificationFailure",
  "submissionDrop",
  "confirmationDelay",
  "longInactive",
  "insufficientData",
  "needsAttention",
] as const;
const SEGMENT_DIMENSIONS = [
  "registrationCohort",
  "plan",
  "organizationShopCount",
  "shopStaffSize",
  "cadence",
  "lineUsage",
  "submissionTrend",
  "adoptionAge",
] as const;

function valueIn<const Values extends readonly string[]>(value: string | undefined, values: Values) {
  return value && values.includes(value) ? (value as Values[number]) : undefined;
}

const OPTIONAL_KEYS = [
  "organizationId",
  "shopId",
  "plan",
  "shopSize",
  "cohort",
  "cadence",
  "lineUsage",
  "health",
  "completeness",
  "dimension",
  "sort",
  "cursor",
  "segmentCursor",
] as const;

function toJstDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function differenceInDays(from: string, to: string) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 29;
  return Math.max(0, Math.round((toTime - fromTime) / 86_400_000));
}

function defaultRange() {
  const to = toJstDateString(new Date());
  const from = addDays(to, -29);
  const days = differenceInDays(from, to) + 1;
  return {
    compareFrom: addDays(from, -days),
    compareTo: addDays(from, -1),
    from,
    to,
  };
}

function parseSearch(search: string): AnalyticsSearchState {
  const params = new URLSearchParams(search);
  const defaults = defaultRange();
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;
  const days = differenceInDays(from, to) + 1;
  const granularity = params.get("granularity");
  const direction = params.get("direction");
  const result: AnalyticsSearchState = {
    compareFrom: params.get("compareFrom") ?? addDays(from, -days),
    compareTo: params.get("compareTo") ?? addDays(from, -1),
    direction: direction === "asc" ? "asc" : "desc",
    from,
    granularity: granularity === "day" || granularity === "month" ? granularity : "week",
    to,
  };

  for (const key of OPTIONAL_KEYS) {
    const value = params.get(key);
    if (value) result[key] = value;
  }
  return result;
}

export function overviewParams(search: AnalyticsSearchState): OverviewParams {
  return {
    compareFrom: search.compareFrom,
    compareTo: search.compareTo,
    from: search.from,
    organizationId: search.organizationId,
    shopId: search.shopId,
    to: search.to,
  };
}

export function seriesParams(search: AnalyticsSearchState): OrganizationParams | ShopParams {
  return { from: search.from, granularity: search.granularity, to: search.to };
}

export function organizationDetailParams(search: AnalyticsSearchState): OrganizationParams {
  return {
    cursor: search.cursor,
    from: search.from,
    granularity: search.granularity,
    limit: 50,
    to: search.to,
  };
}

export function trendsParams(search: AnalyticsSearchState): Omit<TrendsParams, "metrics"> {
  return {
    from: search.from,
    granularity: search.granularity,
    organizationId: search.organizationId,
    shopId: search.shopId,
    to: search.to,
  };
}

export function organizationsParams(search: AnalyticsSearchState): OrganizationsParams {
  return {
    completeness: valueIn(search.completeness, COMPLETENESS) as AnalyticsCompleteness | undefined,
    cursor: search.cursor,
    direction: search.direction,
    from: search.from,
    limit: 50,
    plan: valueIn(search.plan, PLANS) as AnalyticsPlanKey | undefined,
    sort: valueIn(search.sort, ORGANIZATION_SORTS) as AnalyticsOrganizationSort | undefined,
    to: search.to,
  };
}

export function shopsParams(search: AnalyticsSearchState): ShopsParams {
  return {
    cadence: valueIn(search.cadence, CADENCES) as AnalyticsCadenceFilter | undefined,
    cohort: search.cohort,
    completeness: valueIn(search.completeness, COMPLETENESS) as AnalyticsCompleteness | undefined,
    cursor: search.cursor,
    direction: search.direction,
    from: search.from,
    health: valueIn(search.health, HEALTH) as AnalyticsHealthSignalKey | "needsAttention" | undefined,
    limit: 50,
    lineUsage: valueIn(search.lineUsage, LINE_USAGE) as AnalyticsLineUsageFilter | undefined,
    organizationId: search.organizationId,
    plan: valueIn(search.plan, PLANS) as AnalyticsPlanKey | undefined,
    shopSize: valueIn(search.shopSize, SHOP_SIZES) as AnalyticsShopSizeFilter | undefined,
    sort: valueIn(search.sort, SHOP_SORTS) as AnalyticsShopSort | undefined,
    to: search.to,
  };
}

export function shopCyclesParams(search: AnalyticsSearchState): ShopCyclesParams {
  return {
    completeness: valueIn(search.completeness, COMPLETENESS) as AnalyticsCompleteness | undefined,
    cursor: search.cursor,
    direction: search.direction,
    from: search.from,
    limit: 50,
    sort: "periodStart",
    to: search.to,
  };
}

export function segmentsParams(search: AnalyticsSearchState): SegmentsParams {
  return {
    completeness: valueIn(search.completeness, COMPLETENESS) as AnalyticsCompleteness | undefined,
    cursor: search.segmentCursor,
    dimension: valueIn(search.dimension, SEGMENT_DIMENSIONS) as AnalyticsSegmentDimension | undefined,
    direction: "asc",
    from: search.from,
    limit: 50,
    sort: "dimension",
    to: search.to,
  };
}

export function useAnalyticsSearch() {
  const [search, setSearch] = useState(() => parseSearch(window.location.search));

  useEffect(() => {
    const handlePopState = () => setSearch(parseSearch(window.location.search));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const update = useCallback((patch: Partial<AnalyticsSearchState>, replace = false) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    if (!("cursor" in patch)) params.delete("cursor");
    if (!("segmentCursor" in patch)) params.delete("segmentCursor");
    const serialized = params.toString();
    const next = serialized ? `${window.location.pathname}?${serialized}` : window.location.pathname;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    if (replace) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return { search, update };
}
