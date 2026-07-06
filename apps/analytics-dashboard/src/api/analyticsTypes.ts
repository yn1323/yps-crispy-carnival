export type {
  AnalyticsDashboardRequest,
  AnalyticsDashboardResponse,
  AnalyticsPlanKey,
  EventCountDto,
  EventMetricTotalDto,
  EventTrendsResponse,
  NotificationBreakdownResponse,
  NotificationBreakdownRow,
  OverviewResponse,
  ServiceSnapshotDto,
  ShopDetailResponse,
  ShopRankingResponse,
  ShopRankingSort,
  ShopSnapshotDto,
  ShopStageCounts,
  ShopStageKey,
  ShopStageRowDto,
  ShopStagesResponse,
} from "@convex/analyticsDashboard/dto";

export type AnalyticsApiEnvelope<T> = {
  env: {
    label: string;
    convexHost: string | null;
  };
  data: T;
};
