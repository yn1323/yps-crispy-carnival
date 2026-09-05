import { type DefaultFunctionArgs, type FunctionReference, makeFunctionReference } from "convex/server";
import type {
  CycleDetailResponse,
  FeatureRequestsResponse,
  FeatureRequestUpdateResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopsResponse,
  StaffDetailResponse,
} from "./dto";
import type {
  AnalyticsCycleRequest,
  AnalyticsOverviewRequest,
  AnalyticsShopRequest,
  AnalyticsShopsRequest,
  AnalyticsStaffRequest,
  FeatureRequestsRequest,
} from "./schemas";

type QueryArgs<T extends { endpoint: string }> = Omit<T, "endpoint"> & { asOf: number };
function queryRef<A extends DefaultFunctionArgs, R>(name: string) {
  return makeFunctionReference<"query", A, R>(name) as unknown as FunctionReference<"query", "internal", A, R>;
}
export const getOverviewRef = queryRef<QueryArgs<AnalyticsOverviewRequest>, OverviewResponse>(
  "analyticsDashboard/queries:getOverview",
);
export const getShopsRef = queryRef<QueryArgs<AnalyticsShopsRequest>, ShopsResponse>(
  "analyticsDashboard/queries:getShops",
);
export const getShopRef = queryRef<QueryArgs<AnalyticsShopRequest>, ShopDetailResponse | null>(
  "analyticsDashboard/queries:getShop",
);
export const getStaffRef = queryRef<QueryArgs<AnalyticsStaffRequest>, StaffDetailResponse | null>(
  "analyticsDashboard/queries:getStaff",
);
export const getCycleRef = queryRef<QueryArgs<AnalyticsCycleRequest>, CycleDetailResponse | null>(
  "analyticsDashboard/queries:getCycle",
);
export const getFeatureRequestsRef = queryRef<QueryArgs<FeatureRequestsRequest>, FeatureRequestsResponse>(
  "analyticsDashboard/queries:getFeatureRequests",
);
export const setFeatureRequestDeletedRef = makeFunctionReference<
  "mutation",
  { id: string; isDeleted: boolean },
  FeatureRequestUpdateResponse | null
>("analyticsDashboard/mutations:setFeatureRequestDeleted") as unknown as FunctionReference<
  "mutation",
  "internal",
  { id: string; isDeleted: boolean },
  FeatureRequestUpdateResponse | null
>;
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
