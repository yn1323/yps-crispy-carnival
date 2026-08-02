import type { DefaultFunctionArgs, FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type {
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
} from "./dto";
import type {
  AnalyticsCycleRequest,
  AnalyticsHealthRequest,
  AnalyticsMilestonesRequest,
  AnalyticsOrganizationRequest,
  AnalyticsOrganizationsRequest,
  AnalyticsOverviewRequest,
  AnalyticsSegmentsRequest,
  AnalyticsShopCyclesRequest,
  AnalyticsShopRequest,
  AnalyticsShopsRequest,
  AnalyticsTrendsRequest,
  FeatureRequestsRequest,
} from "./schemas";

type WithoutEndpoint<T extends { endpoint: string }> = Omit<T, "endpoint">;

function internalQueryRef<Args extends DefaultFunctionArgs, Result>(name: string) {
  return makeFunctionReference<"query", Args, Result>(name) as unknown as FunctionReference<
    "query",
    "internal",
    Args,
    Result
  >;
}

export const getOverviewRef = internalQueryRef<WithoutEndpoint<AnalyticsOverviewRequest>, OverviewResponse | null>(
  "analyticsDashboard/queries:getOverview",
);
export const getTrendsRef = internalQueryRef<WithoutEndpoint<AnalyticsTrendsRequest>, TrendsResponse | null>(
  "analyticsDashboard/queries:getTrends",
);
export const getMilestonesRef = internalQueryRef<
  WithoutEndpoint<AnalyticsMilestonesRequest>,
  MilestonesResponse | null
>("analyticsDashboard/queries:getMilestones");
export const getHealthRef = internalQueryRef<WithoutEndpoint<AnalyticsHealthRequest>, HealthResponse | null>(
  "analyticsDashboard/queries:getHealth",
);
export const getOrganizationsRef = internalQueryRef<
  WithoutEndpoint<AnalyticsOrganizationsRequest>,
  OrganizationsResponse
>("analyticsDashboard/queries:getOrganizations");
export const getOrganizationRef = internalQueryRef<
  WithoutEndpoint<AnalyticsOrganizationRequest>,
  OrganizationDetailResponse | null
>("analyticsDashboard/queries:getOrganization");
export const getShopsRef = internalQueryRef<WithoutEndpoint<AnalyticsShopsRequest>, ShopsResponse | null>(
  "analyticsDashboard/queries:getShops",
);
export const getShopRef = internalQueryRef<WithoutEndpoint<AnalyticsShopRequest>, ShopDetailResponse | null>(
  "analyticsDashboard/queries:getShop",
);
export const getShopCyclesRef = internalQueryRef<
  WithoutEndpoint<AnalyticsShopCyclesRequest>,
  ShopCyclesResponse | null
>("analyticsDashboard/queries:getShopCycles");
export const getCycleRef = internalQueryRef<WithoutEndpoint<AnalyticsCycleRequest>, CycleDetailResponse | null>(
  "analyticsDashboard/queries:getCycle",
);
export const getSegmentsRef = internalQueryRef<WithoutEndpoint<AnalyticsSegmentsRequest>, SegmentsResponse>(
  "analyticsDashboard/queries:getSegments",
);
export const getFeatureRequestsRef = internalQueryRef<WithoutEndpoint<FeatureRequestsRequest>, FeatureRequestsResponse>(
  "analyticsDashboard/queries:getFeatureRequests",
);

export const consumeServiceRequestRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { allowed: boolean; retryAt: number | null }
>("analyticsDashboard/rateLimit:consumeServiceRequest") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  { allowed: boolean; retryAt: number | null }
>;
