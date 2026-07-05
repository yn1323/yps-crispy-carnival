export type AnalyticsPlanKey = "free" | "standard" | "premium";

export type AnalyticsDashboardRange = {
  from: string;
  to: string;
};

export type AnalyticsDashboardRequest =
  | { kind: "overview"; from: string; to: string }
  | { kind: "eventTrends"; from: string; to: string; metrics: string[] }
  | { kind: "notificationBreakdown"; from: string; to: string }
  | { kind: "shopRanking"; date: string; sort: ShopRankingSort; limit: number }
  | { kind: "shopDetail"; shopId: string; from: string; to: string };

export type AnalyticsDashboardResponse =
  | OverviewResponse
  | EventTrendsResponse
  | NotificationBreakdownResponse
  | ShopRankingResponse
  | ShopDetailResponse;

export type ServiceSnapshotDto = {
  date: string;
  shopCount: number;
  shopCountByPlan: Record<AnalyticsPlanKey, number>;
  staffCount: number;
  shiftTargetStaffCount: number;
  lineLinkedStaffCount: number;
  lineFollowingStaffCount: number;
  openRecruitmentCount: number;
  pendingRegistrationRequestCount: number;
  computedAt: number;
};

export type EventCountDto = {
  date: string;
  metric: string;
  count: number;
  valueSum: number | null;
};

export type EventMetricTotalDto = {
  metric: string;
  count: number;
  valueSum: number | null;
};

export type OverviewResponse = {
  kind: "overview";
  range: AnalyticsDashboardRange;
  latestServiceSnapshot: ServiceSnapshotDto | null;
  serviceSnapshots: ServiceSnapshotDto[];
  eventTotals: EventMetricTotalDto[];
};

export type EventTrendsResponse = {
  kind: "eventTrends";
  range: AnalyticsDashboardRange;
  metrics: string[];
  series: EventCountDto[];
  totals: EventMetricTotalDto[];
};

export type NotificationBreakdownRow = {
  metric: string;
  channel: "email" | "line";
  outcome: "sent" | "failed";
  notificationKind: "recruitment" | "reminder" | "confirmation" | "lineInvite" | "other";
  count: number;
};

export type NotificationBreakdownResponse = {
  kind: "notificationBreakdown";
  range: AnalyticsDashboardRange;
  rows: NotificationBreakdownRow[];
  series: EventCountDto[];
};

export type ShopRankingSort = "staffCount" | "shiftTargetStaffCount" | "lineLinkedRate" | "openRecruitmentCount";

export type ShopSnapshotDto = {
  date: string;
  shopId: string;
  shopName: string;
  planKey: AnalyticsPlanKey;
  staffCount: number;
  shiftTargetStaffCount: number;
  lineLinkedStaffCount: number;
  lineFollowingStaffCount: number;
  openRecruitmentCount: number;
  lineLinkedRate: number | null;
  lineFollowingRate: number | null;
  computedAt: number;
};

export type ShopRankingResponse = {
  kind: "shopRanking";
  date: string;
  sort: ShopRankingSort;
  rows: ShopSnapshotDto[];
};

export type ShopDetailResponse = {
  kind: "shopDetail";
  range: AnalyticsDashboardRange;
  shopId: string;
  shopName: string;
  series: ShopSnapshotDto[];
};
