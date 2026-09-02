export type AnalyticsCompleteness = "complete" | "partial" | "unavailable";

export type AnalyticsAvailability = "available" | "unavailable";

export type AnalyticsGranularity = "day" | "week" | "month";

export type CanonicalAnalyticsPlanKey = "trial" | "free" | "standard" | "pro";
export type AnalyticsPlanKey = CanonicalAnalyticsPlanKey;

export type AnalyticsDirection = "asc" | "desc";

export type AnalyticsMilestoneKey =
  | "registered"
  | "firstRecruitment"
  | "firstSubmission"
  | "firstConfirmed"
  | "secondConfirmed";

export type AnalyticsHealthSignalKey =
  | "hasUpcomingCycle"
  | "nextCycleMissing"
  | "cadenceDelayed"
  | "notificationFailure"
  | "submissionDrop"
  | "confirmationDelay"
  | "longInactive"
  | "insufficientData";

export type AnalyticsSegmentDimension =
  | "registrationCohort"
  | "plan"
  | "organizationShopCount"
  | "shopStaffSize"
  | "cadence"
  | "lineUsage"
  | "submissionTrend"
  | "adoptionAge";

export type AnalyticsTrendMetric =
  | "organizationCount"
  | "shopCount"
  | "kpiEligibleShopCount"
  | "activeShopCount"
  | "personCount"
  | "staffMembershipCount"
  | "unlinkedStaffCount"
  | "shiftTargetCount"
  | "managerMembershipCount"
  | "managerStaffCount"
  | "northStarRate"
  | "deadlineSubmissionRate"
  | "finalSubmissionRate";

export type AnalyticsPageInfoDto = {
  cursor: string | null;
  continueCursor: string | null;
  isDone: boolean;
  pageSize: number;
  returnedCount: number;
};

export type AnalyticsResponseMetadata = {
  availability: AnalyticsAvailability;
  asOf: number | null;
  dataStartDate: string | null;
  latestCompleteSnapshotDate: string | null;
  computedAt: number | null;
  warnings: string[];
  pageInfo: AnalyticsPageInfoDto;
};

export type AnalyticsRateDto = {
  numerator: number;
  denominator: number;
  rate: number | null;
};

export type AnalyticsRateRangeDto = {
  from: string;
  to: string;
};

export type AnalyticsNullableRateDto = {
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
};

export type AnalyticsCountSummaryDto = {
  organizationCount: number;
  shopCount: number;
  kpiEligibleShopCount: number;
  activeShopCount: number;
  personCount: number;
  staffMembershipCount: number;
  unlinkedStaffCount: number;
  shiftTargetCount: number;
  managerMembershipCount: number;
  managerStaffCount: number;
};

export type AnalyticsMilestoneCountsDto = Record<AnalyticsMilestoneKey, number>;

export type AnalyticsMilestoneRatesDto = Record<
  AnalyticsMilestoneKey,
  {
    reach: AnalyticsRateDto;
    previousStepConversion: AnalyticsRateDto;
  }
>;

export type AnalyticsHealthSignalCountsDto = Record<AnalyticsHealthSignalKey, number>;

export type AnalyticsServiceKpiSnapshotDto = {
  snapshotDate: string;
  rateRange: AnalyticsRateRangeDto;
  counts: AnalyticsCountSummaryDto;
  milestoneCounts: AnalyticsMilestoneCountsDto;
  healthSignalCounts: AnalyticsHealthSignalCountsDto;
  northStar: AnalyticsRateDto;
  deadlineSubmission: AnalyticsRateDto;
  finalSubmission: AnalyticsRateDto;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsTrendValueDto = {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
};

export type AnalyticsTrendPointDto = {
  date: string;
  values: Partial<Record<AnalyticsTrendMetric, AnalyticsTrendValueDto>>;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsMilestonePointDto = {
  date: string;
  counts: AnalyticsMilestoneCountsDto;
  rates: AnalyticsMilestoneRatesDto;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsHealthPointDto = {
  date: string;
  counts: AnalyticsHealthSignalCountsDto;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsMilestoneDatesDto = {
  registeredAt: number;
  firstRecruitmentAt: number | null;
  firstSubmissionAt: number | null;
  firstConfirmedAt: number | null;
  secondConfirmedAt: number | null;
};

export type AnalyticsCadenceDto = {
  estimatedDays: number | null;
  confidence: "high" | "medium" | "low" | "insufficientData";
};

export type AnalyticsHealthSignalDto = {
  signal: AnalyticsHealthSignalKey;
  startedAt: number;
};

export type AnalyticsOrganizationKpiDto = {
  snapshotDate: string;
  rateRange: AnalyticsRateRangeDto;
  shopCount: number;
  kpiEligibleShopCount: number;
  activeShopCount: number;
  uniquePersonCount: number;
  staffMembershipCount: number;
  unlinkedStaffCount: number;
  shiftTargetCount: number;
  managerMembershipCount: number;
  managerStaffCount: number;
  milestoneCounts: AnalyticsMilestoneCountsDto;
  healthSignalCounts: AnalyticsHealthSignalCountsDto;
  northStar: AnalyticsRateDto;
  deadlineSubmission: AnalyticsRateDto;
  finalSubmission: AnalyticsRateDto;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsOrganizationRowDto = {
  organizationId: string;
  displayName: string;
  registeredAt: number;
  deletedAt: number | null;
  currentPlan: AnalyticsPlanKey | null;
  firstShopAt: number | null;
  secondShopAt: number | null;
  secondShopFirstConfirmedAt: number | null;
  kpis: AnalyticsOrganizationKpiDto | null;
};

export type AnalyticsShopKpiDto = {
  snapshotDate: string;
  rateRange: AnalyticsRateRangeDto;
  kpiEligible: boolean;
  staffMembershipCount: number;
  shiftTargetCount: number;
  uniquePersonCount: number;
  unlinkedStaffCount: number;
  managerMembershipCount: number;
  managerStaffCount: number;
  lineLinkedCount: number;
  lineFollowingCount: number;
  lineLinkedRate: number | null;
  lineFollowingRate: number | null;
  cycleCountAsOfSnapshot: number;
  confirmedCycleCountAsOfSnapshot: number;
  confirmedBeforeStartCycleCountAsOfSnapshot: number;
  nextCyclePeriodStart: string | null;
  milestoneDates: AnalyticsMilestoneDatesDto;
  healthSignals: AnalyticsHealthSignalDto[];
  issueHealthSignalCount: number;
  cadence: AnalyticsCadenceDto;
  northStar: AnalyticsRateDto;
  deadlineSubmission: AnalyticsRateDto;
  finalSubmission: AnalyticsRateDto;
  cumulativeDeadlineSubmission: AnalyticsRateDto;
  cumulativeFinalSubmission: AnalyticsRateDto;
  cumulativeNotificationSentCount: number;
  cumulativeNotificationFailedCount: number;
  confirmationLeadTimeMedianMs: number | null;
  confirmationLeadTimeP90Ms: number | null;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type AnalyticsShopRowDto = {
  organizationId: string;
  organizationDisplayName: string;
  shopId: string;
  displayName: string;
  registeredAt: number;
  deletedAt: number | null;
  currentPlan: AnalyticsPlanKey | null;
  milestoneDates: AnalyticsMilestoneDatesDto;
  latestActivityAt: number | null;
  nextCyclePeriodStart: string | null;
  cadence: AnalyticsCadenceDto;
  kpis: AnalyticsShopKpiDto | null;
};

export type AnalyticsShopUsageLikelihood = "high" | "possible" | "unknown";

export type AnalyticsShopUsageReason =
  | "recentActivity"
  | "hasUpcomingCycle"
  | "observedActivity"
  | "hasShiftTargets"
  | "hasStaffMemberships";

export type AnalyticsShopListRowDto = AnalyticsShopRowDto & {
  usageLikelihood: AnalyticsShopUsageLikelihood;
  usageReasons: AnalyticsShopUsageReason[];
};

export type AnalyticsCycleRowDto = {
  recruitmentId: string;
  organizationId: string;
  organizationDisplayName: string;
  shopId: string;
  shopDisplayName: string;
  sequenceNumber: number | null;
  createdAt: number;
  submitDeadlineAt: number;
  periodStart: string;
  periodEnd: string;
  confirmedAt: number | null;
  deletedAt: number | null;
  closedAt: number | null;
  deadlineSubmission: AnalyticsNullableRateDto;
  finalSubmission: AnalyticsNullableRateDto;
  notificationSentCount: number;
  notificationFailedCount: number;
  reminderSentCount: number;
  creationLeadTimeMs: number | null;
  confirmationLeadTimeMs: number | null;
  confirmedBeforeStart: boolean | null;
  completeness: AnalyticsCompleteness;
  finalizedAt: number | null;
  updatedAt: number;
};

export type AnalyticsSegmentRowDto = {
  snapshotDate: string;
  dimension: AnalyticsSegmentDimension;
  bucket: string;
  shopCount: number;
  kpiEligibleShopCount: number;
  milestoneCounts: AnalyticsMilestoneCountsDto;
  healthSignalCounts: AnalyticsHealthSignalCountsDto;
  northStar: AnalyticsRateDto;
  deadlineSubmission: AnalyticsRateDto;
  finalSubmission: AnalyticsRateDto;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

export type OverviewResponse = {
  kind: "overview";
  metadata: AnalyticsResponseMetadata;
  current: AnalyticsServiceKpiSnapshotDto | null;
  comparison: AnalyticsServiceKpiSnapshotDto | null;
};

export type TrendsResponse = {
  kind: "trends";
  metadata: AnalyticsResponseMetadata;
  range: { from: string; to: string };
  granularity: AnalyticsGranularity;
  metrics: AnalyticsTrendMetric[];
  series: AnalyticsTrendPointDto[];
};

export type MilestonesResponse = {
  kind: "milestones";
  metadata: AnalyticsResponseMetadata;
  range: { from: string; to: string };
  granularity: AnalyticsGranularity;
  current: AnalyticsMilestoneCountsDto | null;
  currentRates: AnalyticsMilestoneRatesDto | null;
  series: AnalyticsMilestonePointDto[];
};

export type HealthResponse = {
  kind: "health";
  metadata: AnalyticsResponseMetadata;
  range: { from: string; to: string };
  granularity: AnalyticsGranularity;
  current: AnalyticsHealthSignalCountsDto | null;
  series: AnalyticsHealthPointDto[];
};

export type OrganizationsResponse = {
  kind: "organizations";
  metadata: AnalyticsResponseMetadata;
  rows: AnalyticsOrganizationRowDto[];
};

export type OrganizationDetailResponse = {
  kind: "organization";
  metadata: AnalyticsResponseMetadata;
  organization: AnalyticsOrganizationRowDto | null;
  series: AnalyticsOrganizationKpiDto[];
  shops: AnalyticsShopRowDto[];
};

export type ShopsResponse = {
  kind: "shops";
  metadata: AnalyticsResponseMetadata;
  rows: AnalyticsShopListRowDto[];
};

export type ShopDetailResponse = {
  kind: "shop";
  metadata: AnalyticsResponseMetadata;
  shop: AnalyticsShopRowDto | null;
  series: AnalyticsShopKpiDto[];
};

export type ShopCyclesResponse = {
  kind: "shopCycles";
  metadata: AnalyticsResponseMetadata;
  shopId: string;
  rows: AnalyticsCycleRowDto[];
};

export type CycleDetailResponse = {
  kind: "cycle";
  metadata: AnalyticsResponseMetadata;
  cycle: AnalyticsCycleRowDto | null;
};

export type SegmentsResponse = {
  kind: "segments";
  metadata: AnalyticsResponseMetadata;
  rows: AnalyticsSegmentRowDto[];
};

export type FeatureRequestRowDto = {
  id: string;
  targetKind: "shop" | "organization";
  organizationId: string | null;
  organizationName: string | null;
  shopId: string | null;
  // 既存Analytics UIの表示契約を維持し、組織scopeでは「組織名（組織全体）」を返す。
  shopName: string;
  senderType: "manager" | "staff";
  comment: string;
  createdAt: number;
};

export type FeatureRequestsResponse = {
  kind: "requests";
  metadata: AnalyticsResponseMetadata;
  rows: FeatureRequestRowDto[];
  pageInfo: AnalyticsPageInfoDto;
};

export type AnalyticsDashboardResponse =
  | OverviewResponse
  | TrendsResponse
  | MilestonesResponse
  | HealthResponse
  | OrganizationsResponse
  | OrganizationDetailResponse
  | ShopsResponse
  | ShopDetailResponse
  | ShopCyclesResponse
  | CycleDetailResponse
  | SegmentsResponse
  | FeatureRequestsResponse;
