import { useCallback, useEffect, useRef, useState } from "react";
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
  AnalyticsShopUsageFilter,
} from "@/api/analyticsTypes";

export type AnalyticsGranularity = "day" | "week" | "month";
export type SortDirection = "asc" | "desc";

export type AnalyticsSearchState = {
  from: string;
  to: string;
  compareFrom?: string;
  compareTo?: string;
  granularity: AnalyticsGranularity;
  organizationId?: string;
  shopId?: string;
  plan?: AnalyticsPlanKey;
  shopSize?: string;
  cohort?: string;
  cadence?: string;
  lineUsage?: string;
  health?: string;
  usage?: AnalyticsShopUsageFilter;
  completeness?: string;
  dimension?: string;
  sort?: string;
  direction: SortDirection;
  cursor?: string;
  segmentCursor?: string;
};

const PLANS = ["trial", "free", "standard", "pro"] as const satisfies readonly AnalyticsPlanKey[];
const COMPLETENESS = ["complete", "partial", "unavailable"] as const;
const ORGANIZATION_SORTS = ["registeredAt", "currentPlan"] as const;
const SHOP_SORTS = ["registeredAt", "currentPlan", "latestActivityAt"] as const;
const SHOP_SIZES = ["1-4", "5-9", "10-19", "20-49", "50+"] as const;
const SHOP_USAGE = ["candidate", "high", "possible", "unknown"] as const;
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

export function comparisonPeriodFor(from: string, to: string, dataStartDate?: string | null) {
  const days = differenceInDays(from, to) + 1;
  const compareFrom = addDays(from, -days);
  const compareTo = addDays(from, -1);
  if (dataStartDate && compareFrom < dataStartDate) return null;
  return { compareFrom, compareTo };
}

function defaultRange() {
  const to = toJstDateString(new Date());
  const from = addDays(to, -29);
  return {
    from,
    to,
  };
}

function parseSearch(search: string) {
  const originalParams = new URLSearchParams(search);
  const params = new URLSearchParams(search);
  const defaults = defaultRange();
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;
  const granularity = params.get("granularity");
  const direction = params.get("direction");
  const result: AnalyticsSearchState = {
    direction: direction === "asc" ? "asc" : "desc",
    from,
    granularity: granularity === "day" || granularity === "month" ? granularity : "week",
    to,
  };

  const compareFrom = params.get("compareFrom");
  const compareTo = params.get("compareTo");
  if (compareFrom && compareTo) {
    result.compareFrom = compareFrom;
    result.compareTo = compareTo;
  }

  for (const key of OPTIONAL_KEYS) {
    const value = params.get(key);
    if (value) result[key] = value;
  }
  const rawPlan = params.get("plan") ?? undefined;
  const plan = valueIn(rawPlan, PLANS);
  if (plan) result.plan = plan;
  if (params.has("plan") && plan === undefined) {
    delete result.cursor;
    params.delete("cursor");
    params.delete("plan");
  }
  const rawUsage = params.get("usage") ?? undefined;
  const usage = valueIn(rawUsage, SHOP_USAGE);
  if (usage) result.usage = usage;
  const hasInvalidUsage = params.has("usage") && usage === undefined;
  if (hasInvalidUsage) {
    delete result.cursor;
    params.delete("cursor");
    params.delete("usage");
  }
  const normalizedSearch = params.toString();
  return {
    hasExplicitRange: params.has("from") && params.has("to"),
    needsUrlNormalization: normalizedSearch !== originalParams.toString(),
    normalizedSearch,
    search: result,
  };
}

function replaceNormalizedSearchUrl(normalizedSearch: string) {
  window.history.replaceState(
    null,
    "",
    normalizedSearch ? `${window.location.pathname}?${normalizedSearch}` : window.location.pathname,
  );
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
  return {
    from: search.from,
    granularity: search.granularity,
    to: search.to,
  };
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
    cursor: search.cursor,
    direction: search.direction,
    from: search.from,
    limit: 50,
    plan: search.plan,
    sort: valueIn(search.sort, ORGANIZATION_SORTS) as AnalyticsOrganizationSort | undefined,
    to: search.to,
  };
}

export function shopsParams(search: AnalyticsSearchState): ShopsParams {
  return {
    cadence: valueIn(search.cadence, CADENCES) as AnalyticsCadenceFilter | undefined,
    cursor: search.cursor,
    direction: search.direction,
    from: search.from,
    health: valueIn(search.health, HEALTH) as AnalyticsHealthSignalKey | "needsAttention" | undefined,
    limit: 50,
    lineUsage: valueIn(search.lineUsage, LINE_USAGE) as AnalyticsLineUsageFilter | undefined,
    organizationId: search.organizationId,
    plan: search.plan,
    shopSize: valueIn(search.shopSize, SHOP_SIZES) as AnalyticsShopSizeFilter | undefined,
    sort: valueIn(search.sort, SHOP_SORTS) as AnalyticsShopSort | undefined,
    to: search.to,
    usage: search.usage,
  };
}

export function shopCyclesParams(search: AnalyticsSearchState): ShopCyclesParams {
  return {
    completeness: valueIn(search.completeness, COMPLETENESS) as AnalyticsCompleteness | undefined,
    cursor: search.cursor,
    direction: "desc",
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
  const initial = useRef<ReturnType<typeof parseSearch> | null>(null);
  if (initial.current === null) initial.current = parseSearch(window.location.search);
  const [search, setSearch] = useState(initial.current.search);
  const hasExplicitRange = useRef(initial.current.hasExplicitRange);

  useEffect(() => {
    if (initial.current?.needsUrlNormalization) {
      replaceNormalizedSearchUrl(initial.current.normalizedSearch);
    }

    const handlePopState = () => {
      const parsed = parseSearch(window.location.search);
      if (parsed.needsUrlNormalization) replaceNormalizedSearchUrl(parsed.normalizedSearch);
      hasExplicitRange.current = parsed.hasExplicitRange;
      setSearch(parsed.search);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const update = useCallback((patch: Partial<AnalyticsSearchState>, replace = false) => {
    if ("from" in patch || "to" in patch) hasExplicitRange.current = true;
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

  const applyMetadataDefaults = useCallback(
    (metadata?: { dataStartDate: string | null; latestCompleteSnapshotDate: string | null }) => {
      if (hasExplicitRange.current || !metadata?.dataStartDate) return;

      const fallbackTo = defaultRange().to;
      const toCandidate = metadata.latestCompleteSnapshotDate ?? fallbackTo;
      const to = toCandidate < metadata.dataStartDate ? metadata.dataStartDate : toCandidate;
      const rangeStart = addDays(to, -29);
      const from = rangeStart < metadata.dataStartDate ? metadata.dataStartDate : rangeStart;
      const comparison = comparisonPeriodFor(from, to, metadata.dataStartDate);
      const nextSearch: AnalyticsSearchState = {
        ...search,
        compareFrom: comparison?.compareFrom,
        compareTo: comparison?.compareTo,
        from,
        to,
      };

      if (
        search.from === nextSearch.from &&
        search.to === nextSearch.to &&
        search.compareFrom === nextSearch.compareFrom &&
        search.compareTo === nextSearch.compareTo
      ) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      params.set("from", from);
      params.set("to", to);
      if (comparison) {
        params.set("compareFrom", comparison.compareFrom);
        params.set("compareTo", comparison.compareTo);
      } else {
        params.delete("compareFrom");
        params.delete("compareTo");
      }
      params.delete("cursor");
      params.delete("segmentCursor");
      const serialized = params.toString();
      window.history.replaceState(
        null,
        "",
        serialized ? `${window.location.pathname}?${serialized}` : window.location.pathname,
      );
      setSearch(nextSearch);
    },
    [search],
  );

  return { applyMetadataDefaults, search, update };
}
