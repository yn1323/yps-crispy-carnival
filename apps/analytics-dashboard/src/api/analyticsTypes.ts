export type {
  AnalyticsDashboardRequest,
  AnalyticsDashboardResponse,
  AnalyticsPlanKey,
  EventCountDto,
  EventMetricTotalDto,
  EventTrendsResponse,
  FeatureRequestRowDto,
  FeatureRequestsResponse,
  NotificationBreakdownResponse,
  NotificationBreakdownRow,
  OverviewResponse,
  ServiceSnapshotDto,
  ShopDetailResponse,
  ShopRankingResponse,
  ShopRankingSort,
  ShopRecruitmentRowDto,
  ShopRecruitmentsResponse,
  ShopSnapshotDto,
  ShopStageCounts,
  ShopStageKey,
  ShopStageRowDto,
  ShopStagesResponse,
  StageTransitionMetricDto,
  StageTransitionSummaryDto,
} from "@convex/analyticsDashboard/dto";

export type AnalyticsApiEnvelope<T> = {
  env: {
    label: string;
    convexHost: string | null;
  };
  data: T;
};
