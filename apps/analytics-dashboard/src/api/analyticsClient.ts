import type { AnalyticsPlanIdVersionParams } from "./analyticsPlanIds";
import type {
  AnalyticsApiEnvelope,
  AnalyticsCadenceFilter,
  AnalyticsCompleteness,
  AnalyticsCycleSort,
  AnalyticsDirection,
  AnalyticsGranularity,
  AnalyticsHealthSignalKey,
  AnalyticsLineUsageFilter,
  AnalyticsOrganizationSort,
  AnalyticsSegmentDimension,
  AnalyticsSegmentSort,
  AnalyticsShopSizeFilter,
  AnalyticsShopSort,
  AnalyticsShopUsageFilter,
  AnalyticsTrendMetric,
  CanonicalAnalyticsPlanKey,
  CycleDetailResponse,
  FeatureRequestsResponse,
  HealthResponse,
  MilestonesResponse,
  OrganizationDetailResponse,
  OrganizationsResponse,
  OverviewResponse,
  SegmentsResponse,
  ShopCyclesResponse,
  ShopDetailResponse,
  ShopsResponse,
  TrendsResponse,
} from "./analyticsTypes";

type SearchValue = string | number | readonly string[] | null | undefined;

export type AnalyticsDateRangeParams = AnalyticsPlanIdVersionParams & { from: string; to: string };

export type AnalyticsSeriesParams = AnalyticsDateRangeParams & {
  granularity?: AnalyticsGranularity;
};

export type AnalyticsPaginationParams = {
  cursor?: string | null;
  limit?: number;
};

export type OverviewParams = AnalyticsDateRangeParams & {
  compareFrom?: string | null;
  compareTo?: string | null;
  organizationId?: string | null;
  shopId?: string | null;
};

export type TrendsParams = AnalyticsSeriesParams & {
  metrics: readonly AnalyticsTrendMetric[];
  organizationId?: string | null;
  shopId?: string | null;
};

export type ScopedSeriesParams = AnalyticsSeriesParams & {
  organizationId?: string | null;
  shopId?: string | null;
};

export type OrganizationsParams = AnalyticsDateRangeParams &
  AnalyticsPaginationParams & {
    sort?: AnalyticsOrganizationSort;
    direction?: AnalyticsDirection;
    plan?: CanonicalAnalyticsPlanKey | null;
    completeness?: AnalyticsCompleteness | null;
  };

export type OrganizationParams = AnalyticsSeriesParams & AnalyticsPaginationParams;

export type ShopsParams = AnalyticsDateRangeParams &
  AnalyticsPaginationParams & {
    sort?: AnalyticsShopSort;
    direction?: AnalyticsDirection;
    organizationId?: string | null;
    plan?: CanonicalAnalyticsPlanKey | null;
    shopSize?: AnalyticsShopSizeFilter | null;
    cohort?: string | null;
    cadence?: AnalyticsCadenceFilter | null;
    lineUsage?: AnalyticsLineUsageFilter | null;
    health?: AnalyticsHealthSignalKey | "needsAttention" | null;
    completeness?: AnalyticsCompleteness | null;
    usage?: AnalyticsShopUsageFilter | null;
  };

export type ShopParams = AnalyticsSeriesParams;

export type ShopCyclesParams = AnalyticsDateRangeParams &
  AnalyticsPaginationParams & {
    sort?: AnalyticsCycleSort;
    direction?: AnalyticsDirection;
    completeness?: AnalyticsCompleteness | null;
  };

export type SegmentsParams = AnalyticsDateRangeParams &
  AnalyticsPaginationParams & {
    sort?: AnalyticsSegmentSort;
    direction?: AnalyticsDirection;
    dimension?: AnalyticsSegmentDimension | null;
    completeness?: AnalyticsCompleteness | null;
  };

export type FeatureRequestsParams = AnalyticsPaginationParams;

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

export class AnalyticsApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AnalyticsApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  return Number(value) * 1_000;
}

function buildUrl(path: string, params: Record<string, SearchValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function fetchEndpoint<T>(path: string, params: Record<string, SearchValue>): Promise<AnalyticsApiEnvelope<T>> {
  const response = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const body = (await response.json().catch(() => null)) as (AnalyticsApiEnvelope<T> & ErrorResponse) | null;
  if (!response.ok) {
    throw new AnalyticsApiError(
      body?.error?.message ?? "分析データを読み込めませんでした",
      response.status,
      retryAfterMs(response),
    );
  }
  if (!body || !("data" in body)) {
    throw new AnalyticsApiError("分析データの形式が正しくありません", response.status);
  }
  return body;
}

export function fetchOverview(params: OverviewParams) {
  return fetchEndpoint<OverviewResponse>("/api/analytics/overview", params);
}

export function fetchTrends(params: TrendsParams) {
  return fetchEndpoint<TrendsResponse>("/api/analytics/trends", params);
}

export function fetchMilestones(params: ScopedSeriesParams) {
  return fetchEndpoint<MilestonesResponse>("/api/analytics/milestones", params);
}

export function fetchHealth(params: ScopedSeriesParams) {
  return fetchEndpoint<HealthResponse>("/api/analytics/health", params);
}

export function fetchOrganizations(params: OrganizationsParams) {
  return fetchEndpoint<OrganizationsResponse>("/api/analytics/organizations", params);
}

export function fetchOrganization(organizationId: string, params: OrganizationParams) {
  return fetchEndpoint<OrganizationDetailResponse>(
    `/api/analytics/organizations/${encodeURIComponent(organizationId)}`,
    params,
  );
}

export function fetchShops(params: ShopsParams) {
  return fetchEndpoint<ShopsResponse>("/api/analytics/shops", params);
}

export function fetchShop(shopId: string, params: ShopParams) {
  return fetchEndpoint<ShopDetailResponse>(`/api/analytics/shops/${encodeURIComponent(shopId)}`, params);
}

export function fetchShopCycles(shopId: string, params: ShopCyclesParams) {
  return fetchEndpoint<ShopCyclesResponse>(`/api/analytics/shops/${encodeURIComponent(shopId)}/cycles`, params);
}

export function fetchCycle(shopId: string, recruitmentId: string, params: AnalyticsPlanIdVersionParams) {
  return fetchEndpoint<CycleDetailResponse>(
    `/api/analytics/shops/${encodeURIComponent(shopId)}/cycles/${encodeURIComponent(recruitmentId)}`,
    params,
  );
}

export function fetchSegments(params: SegmentsParams) {
  return fetchEndpoint<SegmentsResponse>("/api/analytics/segments", params);
}

export function fetchFeatureRequests(params: FeatureRequestsParams = {}) {
  return fetchEndpoint<FeatureRequestsResponse>("/api/requests", params);
}
