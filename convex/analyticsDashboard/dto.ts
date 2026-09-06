/** 本人用BFFとの契約。集計DTOへ問い合わせの個人情報を混ぜない。 */
export type AnalyticsMetric = "registered" | "submitted" | "confirmed";
export type AnalyticsRangeDays = 7 | 30 | 90;
export type AnalyticsCountsDto = Record<AnalyticsMetric, number>;
export type AnalyticsDayStatus = "before_start" | "pending" | "running" | "failed" | "complete" | "partial";
export type AnalyticsPageInfoDto = {
  cursor: string | null;
  continueCursor: string | null;
  isDone: boolean;
  pageSize: number;
  returnedCount: number;
};
export type AnalyticsDayDto = {
  date: string;
  status: AnalyticsDayStatus;
  counts: AnalyticsCountsDto | null;
  observationStartAt: number | null;
  observationEndAt: number | null;
  computedAt: number | null;
  errorCode: string | null;
};
export type OverviewResponse = {
  kind: "overview";
  asOf: number;
  definitionVersion: number;
  startedAt: number | null;
  nextAggregationAt: number;
  range: { from: string; to: string; days: AnalyticsRangeDays };
  yesterday: AnalyticsDayDto;
  series: AnalyticsDayDto[];
  period: {
    status: "complete" | "partial" | "unavailable";
    counts: AnalyticsCountsDto | null;
    observedDays: number;
    observationStartAt: number | null;
  };
};
export type AnalyticsShopRowDto = {
  shopId: string;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
  registeredAt: number | null;
  isDeleted: boolean;
};
export type AnalyticsShopListRowDto = AnalyticsShopRowDto & {
  staffCount: number | null;
  latestShift: { periodStart: string; periodEnd: string } | null;
};
export type ShopsResponse = {
  kind: "shops";
  asOf: number;
  rows: AnalyticsShopListRowDto[];
  pageInfo: AnalyticsPageInfoDto;
  scope: { date: string; metric: AnalyticsMetric } | null;
  scopeStatus: "current" | "available" | "unavailable" | "outside_retention";
};
export type StaffRowDto = {
  staffId: string;
  name: string;
  accountLinked: boolean;
  isManager: boolean;
  excludedFromShift: boolean;
  lineStatus: "unlinked" | "linked_following" | "linked_unfollowed" | "unavailable";
};
export type CycleRowDto = {
  recruitmentId: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  status: "open" | "confirmed";
  confirmedAt: number | null;
};
export type CycleEvidenceDto = {
  recruitmentId: string;
  isDeleted: boolean;
  firstSubmittedAt: number | null;
  lastSubmittedAt: number | null;
  firstConfirmedAt: number | null;
  lastConfirmedAt: number | null;
  confirmedPeriodStartAt: number | null;
};
export type ShopDetailResponse = {
  kind: "shop";
  asOf: number;
  shop: AnalyticsShopRowDto;
  regularClosedDays: string[];
  submissionPattern: string;
  staff: StaffRowDto[];
  pageInfo: AnalyticsPageInfoDto;
  cycles: CycleRowDto[];
  activity: {
    startedAt: number | null;
    from: string;
    to: string;
    days: Array<{ date: string; registered: boolean; submitted: boolean; confirmed: boolean }>;
    evidence: CycleEvidenceDto[];
    hasMoreEvidence: boolean;
  };
};
export type StaffNotificationDto = {
  id: string;
  channel: "email" | "line";
  notificationKind: string;
  sendStatus: "queued" | "sent" | "failed" | "cancelled";
  deliveryStatus: "not_supported" | "unknown" | "delivered" | "delayed" | "failed" | "bounced" | "suppressed";
  requestedAt: number;
  sentAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
};
export type StaffDetailResponse = {
  kind: "staff";
  asOf: number;
  shop: AnalyticsShopRowDto;
  staff: StaffRowDto & { email: string };
  memberships: Array<{ shopId: string; shopName: string; staffId: string; excludedFromShift: boolean }>;
  submissions: Array<CycleRowDto & { firstSubmittedAt: number | null; submittedAt: number | null }>;
  notifications: StaffNotificationDto[];
  pageInfo: AnalyticsPageInfoDto;
};
export type CycleDetailResponse = {
  kind: "cycle";
  asOf: number;
  shop: AnalyticsShopRowDto;
  cycle: CycleRowDto;
  currentSubmission: { numerator: number; denominator: number; rate: number | null } | null;
  currentSubmissionStatus: "available" | "scan_limit";
  confirmedBeforeStart: boolean | null;
  deadlineSubmissionRate: null;
};
export type FeatureRequestRowDto = {
  id: string;
  targetKind: "shop" | "organization";
  organizationId: string | null;
  organizationName: string | null;
  shopId: string | null;
  shopName: string;
  senderType: "manager" | "staff";
  comment: string;
  createdAt: number;
  isDeleted: boolean;
};
export type FeatureRequestsResponse = {
  kind: "requests";
  asOf: number;
  rows: FeatureRequestRowDto[];
  pageInfo: AnalyticsPageInfoDto;
};
export type FeatureRequestUpdateResponse = { kind: "requestUpdated"; id: string; isDeleted: boolean };
export type AnalyticsDashboardResponse =
  | OverviewResponse
  | ShopsResponse
  | ShopDetailResponse
  | StaffDetailResponse
  | CycleDetailResponse
  | FeatureRequestsResponse;
