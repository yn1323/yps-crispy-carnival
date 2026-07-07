export type AnalyticsPlanKey = "free" | "standard" | "premium";

export type AnalyticsDashboardRange = {
  from: string;
  to: string;
};

export type AnalyticsDashboardRequest =
  | { kind: "overview"; from: string; to: string }
  | { kind: "eventTrends"; from: string; to: string; metrics: string[] }
  | { kind: "notificationBreakdown"; from: string; to: string }
  | { kind: "shopStages"; date: string }
  | { kind: "shopRanking"; date: string; sort: ShopRankingSort; limit: number }
  | { kind: "shopDetail"; shopId: string; from: string; to: string };

export type AnalyticsDashboardResponse =
  | OverviewResponse
  | EventTrendsResponse
  | NotificationBreakdownResponse
  | ShopStagesResponse
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
  // ステージ集計導入前のスナップショットは null
  shopStageCounts: ShopStageCounts | null;
  computedAt: number;
};

// ========================================
// 店舗ライフサイクルステージ（convex/analytics/stage.ts の分類結果）
// ========================================

export type ShopStageKey = "beforeStart" | "activeTrial" | "activeTrialDormant" | "retained" | "retainedDormant";

export type ShopStageCounts = Record<ShopStageKey, number>;

export type StageTransitionMetricDto = {
  numerator: number;
  denominator: number;
  rate: number | null;
};

export type StageTransitionSummaryDto = {
  fromDate: string;
  toDate: string;
  beforeStartToActiveTrial: StageTransitionMetricDto;
  activeTrialToRetained: StageTransitionMetricDto;
  retainedToDormant: StageTransitionMetricDto;
  dormantToRecovered: StageTransitionMetricDto;
};

export type ShopStageRowDto = {
  shopId: string;
  shopName: string;
  shopCreatedAt: number | null;
  planKey: AnalyticsPlanKey;
  /** ステージ集計導入前のスナップショットは null（再集計待ち） */
  stage: ShopStageKey | null;
  staffCount: number;
  shiftTargetStaffCount: number;
  lineLinkedStaffCount: number;
  recruitmentCount: number | null;
  confirmedRecruitmentCount: number | null;
  openRecruitmentCount: number;
  openRecruitmentSubmittedCount: number | null;
  submittedRecruitmentCount: number | null;
  openNotificationFailureCount: number | null;
  recruitmentCreatedLast30Days: number | null;
  submissionRate: number | null;
  averageFirstSubmissionLeadTimeMs: number | null;
  averageConfirmationLeadTimeMs: number | null;
  emailNotificationSentCount: number | null;
  lineNotificationSentCount: number | null;
  notificationLineSentRate: number | null;
  postReminderSubmissionRate: number | null;
  resubmissionRate: number | null;
  lastRecruitmentSubmissionRate: number | null;
  lastRecruitmentCreatedAt: number | null;
  lastRecruitmentConfirmedAt: number | null;
  lastConfirmedRecruitmentLeadTimeMs: number | null;
  firstRecruitmentCreatedAt: number | null;
  firstRecruitmentDeadline: string | null;
  hasSubmission: boolean | null;
  hasNotificationSent: boolean | null;
  hasCurrentOrFutureConfirmedShift: boolean | null;
  hasCurrentConfirmedShift: boolean | null;
  hadActiveOrRetainedStage: boolean | null;
  hadRetainedStage: boolean | null;
  lastActivityAt: number | null;
  /** ステージ判定の基準時刻（対象JST日の終端） */
  stageReferenceAt: number | null;
  /** 最終活動からの停止日数（スナップショット計算時点基準） */
  stalledDays: number | null;
  /** オンボーディングの最終到達ステップ（日本語ラベル） */
  onboardingStepLabel: string | null;
  /** 気になる点タグ（原因断定はしない） */
  alerts: string[];
  computedAt: number;
};

export type ShopStagesResponse = {
  kind: "shopStages";
  date: string;
  stageCounts: ShopStageCounts;
  /** ステージ集計導入前のスナップショットしかない店舗数 */
  unclassifiedCount: number;
  rows: ShopStageRowDto[];
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
  stageTransitions: StageTransitionSummaryDto | null;
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
