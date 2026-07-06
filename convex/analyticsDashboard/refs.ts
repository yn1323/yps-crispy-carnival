import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type {
  EventTrendsResponse,
  NotificationBreakdownResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopRankingResponse,
  ShopRankingSort,
  ShopStagesResponse,
} from "./dto";

export const getOverviewRef = makeFunctionReference<"query", { from: string; to: string }, OverviewResponse>(
  "analyticsDashboard/queries:getOverview",
) as unknown as FunctionReference<"query", "internal", { from: string; to: string }, OverviewResponse>;

export const getEventTrendsRef = makeFunctionReference<
  "query",
  { from: string; to: string; metrics: string[] },
  EventTrendsResponse
>("analyticsDashboard/queries:getEventTrends") as unknown as FunctionReference<
  "query",
  "internal",
  { from: string; to: string; metrics: string[] },
  EventTrendsResponse
>;

export const getNotificationBreakdownRef = makeFunctionReference<
  "query",
  { from: string; to: string },
  NotificationBreakdownResponse
>("analyticsDashboard/queries:getNotificationBreakdown") as unknown as FunctionReference<
  "query",
  "internal",
  { from: string; to: string },
  NotificationBreakdownResponse
>;

export const getShopStagesRef = makeFunctionReference<"query", { date: string }, ShopStagesResponse>(
  "analyticsDashboard/queries:getShopStages",
) as unknown as FunctionReference<"query", "internal", { date: string }, ShopStagesResponse>;

export const getShopRankingRef = makeFunctionReference<
  "query",
  { date: string; sort: ShopRankingSort; limit: number },
  ShopRankingResponse
>("analyticsDashboard/queries:getShopRanking") as unknown as FunctionReference<
  "query",
  "internal",
  { date: string; sort: ShopRankingSort; limit: number },
  ShopRankingResponse
>;

export const getShopDetailRef = makeFunctionReference<
  "query",
  { shopId: Id<"shops">; from: string; to: string },
  ShopDetailResponse
>("analyticsDashboard/queries:getShopDetail") as unknown as FunctionReference<
  "query",
  "internal",
  { shopId: Id<"shops">; from: string; to: string },
  ShopDetailResponse
>;
