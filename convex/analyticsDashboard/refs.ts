import { type DefaultFunctionArgs, type FunctionReference, makeFunctionReference } from "convex/server";
import type {
  CycleDetailResponse,
  FeatureRequestsResponse,
  FeatureRequestUpdateResponse,
  MagicLinkLookupResponse,
  NotificationSearchResponse,
  NotificationSummaryResponse,
  OrganizationEventsResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopsResponse,
  StaffDetailResponse,
  StaffTimelineResponse,
} from "./dto";
import type {
  AnalyticsCycleRequest,
  AnalyticsOverviewRequest,
  AnalyticsShopRequest,
  AnalyticsShopsRequest,
  AnalyticsStaffRequest,
  FeatureRequestsRequest,
  MagicLinkLookupRequest,
  NotificationSearchRequest,
  NotificationSummaryRequest,
  OrganizationEventsRequest,
  StaffTimelineRequest,
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
export const getNotificationsRef = queryRef<QueryArgs<NotificationSearchRequest>, NotificationSearchResponse | null>(
  "analyticsDashboard/investigationQueries:getNotifications",
);
export const getNotificationSummaryRef = queryRef<QueryArgs<NotificationSummaryRequest>, NotificationSummaryResponse>(
  "analyticsDashboard/investigationQueries:getNotificationSummary",
);
export const getStaffTimelineRef = queryRef<QueryArgs<StaffTimelineRequest>, StaffTimelineResponse | null>(
  "analyticsDashboard/investigationQueries:getStaffTimeline",
);
export const getOrganizationEventsRef = queryRef<
  QueryArgs<OrganizationEventsRequest>,
  OrganizationEventsResponse | null
>("analyticsDashboard/investigationQueries:getOrganizationEvents");
export const getMagicLinkLookupRef = queryRef<QueryArgs<MagicLinkLookupRequest>, MagicLinkLookupResponse>(
  "analyticsDashboard/investigationQueries:getMagicLinkLookup",
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
