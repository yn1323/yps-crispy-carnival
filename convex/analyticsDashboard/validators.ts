import { v } from "convex/values";
import {
  analyticsCanonicalPlanValidator,
  analyticsCompletenessValidator,
  analyticsHealthSignalCountsValidator,
  analyticsHealthSignalValidator,
  analyticsMilestoneCountsValidator,
  analyticsSegmentDimensionValidator,
} from "../analytics/model";

export const analyticsAvailabilityValidator = v.union(v.literal("available"), v.literal("unavailable"));

export const analyticsPageInfoValidator = v.object({
  cursor: v.union(v.string(), v.null()),
  continueCursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
  pageSize: v.number(),
  returnedCount: v.number(),
});

export const analyticsResponseMetadataValidator = v.object({
  availability: analyticsAvailabilityValidator,
  asOf: v.union(v.number(), v.null()),
  dataStartDate: v.union(v.string(), v.null()),
  latestCompleteSnapshotDate: v.union(v.string(), v.null()),
  computedAt: v.union(v.number(), v.null()),
  warnings: v.array(v.string()),
  pageInfo: analyticsPageInfoValidator,
});

export const analyticsRateValidator = v.object({
  numerator: v.number(),
  denominator: v.number(),
  rate: v.union(v.number(), v.null()),
});

const analyticsMilestoneRateValidator = v.object({
  reach: analyticsRateValidator,
  previousStepConversion: analyticsRateValidator,
});

const analyticsMilestoneRatesValidator = v.object({
  registered: analyticsMilestoneRateValidator,
  firstRecruitment: analyticsMilestoneRateValidator,
  firstSubmission: analyticsMilestoneRateValidator,
  firstConfirmed: analyticsMilestoneRateValidator,
  secondConfirmed: analyticsMilestoneRateValidator,
});

const analyticsRateRangeValidator = v.object({
  from: v.string(),
  to: v.string(),
});

export const analyticsNullableRateValidator = v.object({
  numerator: v.union(v.number(), v.null()),
  denominator: v.union(v.number(), v.null()),
  rate: v.union(v.number(), v.null()),
});

const analyticsCountSummaryValidator = v.object({
  organizationCount: v.number(),
  shopCount: v.number(),
  kpiEligibleShopCount: v.number(),
  activeShopCount: v.number(),
  personCount: v.number(),
  staffMembershipCount: v.number(),
  unlinkedStaffCount: v.number(),
  shiftTargetCount: v.number(),
  managerMembershipCount: v.number(),
  managerStaffCount: v.number(),
});

export const analyticsServiceKpiSnapshotValidator = v.object({
  snapshotDate: v.string(),
  rateRange: analyticsRateRangeValidator,
  counts: analyticsCountSummaryValidator,
  milestoneCounts: analyticsMilestoneCountsValidator,
  healthSignalCounts: analyticsHealthSignalCountsValidator,
  northStar: analyticsRateValidator,
  deadlineSubmission: analyticsRateValidator,
  finalSubmission: analyticsRateValidator,
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

const analyticsTrendValueValidator = v.object({
  value: v.union(v.number(), v.null()),
  numerator: v.union(v.number(), v.null()),
  denominator: v.union(v.number(), v.null()),
});

const analyticsTrendPointValidator = v.object({
  date: v.string(),
  values: v.record(v.string(), analyticsTrendValueValidator),
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

const analyticsMilestonePointValidator = v.object({
  date: v.string(),
  counts: analyticsMilestoneCountsValidator,
  rates: analyticsMilestoneRatesValidator,
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

const analyticsHealthPointValidator = v.object({
  date: v.string(),
  counts: analyticsHealthSignalCountsValidator,
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

const analyticsMilestoneDatesValidator = v.object({
  registeredAt: v.number(),
  firstRecruitmentAt: v.union(v.number(), v.null()),
  firstSubmissionAt: v.union(v.number(), v.null()),
  firstConfirmedAt: v.union(v.number(), v.null()),
  secondConfirmedAt: v.union(v.number(), v.null()),
});

const analyticsCadenceValidator = v.object({
  estimatedDays: v.union(v.number(), v.null()),
  confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low"), v.literal("insufficientData")),
});

const analyticsHealthSignalStateValidator = v.object({
  signal: analyticsHealthSignalValidator,
  startedAt: v.number(),
});

export const analyticsOrganizationKpiValidator = v.object({
  snapshotDate: v.string(),
  rateRange: analyticsRateRangeValidator,
  shopCount: v.number(),
  kpiEligibleShopCount: v.number(),
  activeShopCount: v.number(),
  uniquePersonCount: v.number(),
  staffMembershipCount: v.number(),
  unlinkedStaffCount: v.number(),
  shiftTargetCount: v.number(),
  managerMembershipCount: v.number(),
  managerStaffCount: v.number(),
  milestoneCounts: analyticsMilestoneCountsValidator,
  healthSignalCounts: analyticsHealthSignalCountsValidator,
  northStar: analyticsRateValidator,
  deadlineSubmission: analyticsRateValidator,
  finalSubmission: analyticsRateValidator,
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

export const analyticsOrganizationRowValidator = v.object({
  organizationId: v.string(),
  displayName: v.string(),
  registeredAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  currentPlan: v.union(analyticsCanonicalPlanValidator, v.null()),
  firstShopAt: v.union(v.number(), v.null()),
  secondShopAt: v.union(v.number(), v.null()),
  secondShopFirstConfirmedAt: v.union(v.number(), v.null()),
  kpis: v.union(analyticsOrganizationKpiValidator, v.null()),
});

export const analyticsShopKpiValidator = v.object({
  snapshotDate: v.string(),
  rateRange: analyticsRateRangeValidator,
  kpiEligible: v.boolean(),
  staffMembershipCount: v.number(),
  shiftTargetCount: v.number(),
  uniquePersonCount: v.number(),
  unlinkedStaffCount: v.number(),
  managerMembershipCount: v.number(),
  managerStaffCount: v.number(),
  lineLinkedCount: v.number(),
  lineFollowingCount: v.number(),
  lineLinkedRate: v.union(v.number(), v.null()),
  lineFollowingRate: v.union(v.number(), v.null()),
  cycleCountAsOfSnapshot: v.number(),
  confirmedCycleCountAsOfSnapshot: v.number(),
  confirmedBeforeStartCycleCountAsOfSnapshot: v.number(),
  nextCyclePeriodStart: v.union(v.string(), v.null()),
  milestoneDates: analyticsMilestoneDatesValidator,
  healthSignals: v.array(analyticsHealthSignalStateValidator),
  issueHealthSignalCount: v.number(),
  cadence: analyticsCadenceValidator,
  northStar: analyticsRateValidator,
  deadlineSubmission: analyticsRateValidator,
  finalSubmission: analyticsRateValidator,
  cumulativeDeadlineSubmission: analyticsRateValidator,
  cumulativeFinalSubmission: analyticsRateValidator,
  cumulativeNotificationSentCount: v.number(),
  cumulativeNotificationFailedCount: v.number(),
  confirmationLeadTimeMedianMs: v.union(v.number(), v.null()),
  confirmationLeadTimeP90Ms: v.union(v.number(), v.null()),
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

export const analyticsShopRowValidator = v.object({
  organizationId: v.string(),
  organizationDisplayName: v.string(),
  shopId: v.string(),
  displayName: v.string(),
  registeredAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  currentPlan: v.union(analyticsCanonicalPlanValidator, v.null()),
  milestoneDates: analyticsMilestoneDatesValidator,
  latestActivityAt: v.union(v.number(), v.null()),
  nextCyclePeriodStart: v.union(v.string(), v.null()),
  cadence: analyticsCadenceValidator,
  kpis: v.union(analyticsShopKpiValidator, v.null()),
});

export const analyticsShopUsageLikelihoodValidator = v.union(
  v.literal("high"),
  v.literal("possible"),
  v.literal("unknown"),
);

export const analyticsShopUsageReasonValidator = v.union(
  v.literal("recentActivity"),
  v.literal("hasUpcomingCycle"),
  v.literal("observedActivity"),
  v.literal("hasShiftTargets"),
  v.literal("hasStaffMemberships"),
);

export const analyticsShopListRowValidator = analyticsShopRowValidator.extend({
  usageLikelihood: analyticsShopUsageLikelihoodValidator,
  usageReasons: v.array(analyticsShopUsageReasonValidator),
});

export const analyticsCycleRowValidator = v.object({
  recruitmentId: v.string(),
  organizationId: v.string(),
  organizationDisplayName: v.string(),
  shopId: v.string(),
  shopDisplayName: v.string(),
  sequenceNumber: v.union(v.number(), v.null()),
  createdAt: v.number(),
  submitDeadlineAt: v.number(),
  periodStart: v.string(),
  periodEnd: v.string(),
  confirmedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),
  closedAt: v.union(v.number(), v.null()),
  deadlineSubmission: analyticsNullableRateValidator,
  finalSubmission: analyticsNullableRateValidator,
  notificationSentCount: v.number(),
  notificationFailedCount: v.number(),
  reminderSentCount: v.number(),
  creationLeadTimeMs: v.union(v.number(), v.null()),
  confirmationLeadTimeMs: v.union(v.number(), v.null()),
  confirmedBeforeStart: v.union(v.boolean(), v.null()),
  completeness: analyticsCompletenessValidator,
  finalizedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const analyticsSegmentRowValidator = v.object({
  snapshotDate: v.string(),
  dimension: analyticsSegmentDimensionValidator,
  bucket: v.string(),
  shopCount: v.number(),
  kpiEligibleShopCount: v.number(),
  milestoneCounts: analyticsMilestoneCountsValidator,
  healthSignalCounts: analyticsHealthSignalCountsValidator,
  northStar: analyticsRateValidator,
  deadlineSubmission: analyticsRateValidator,
  finalSubmission: analyticsRateValidator,
  completeness: analyticsCompletenessValidator,
  computedAt: v.number(),
});

export const overviewResponseValidator = v.object({
  kind: v.literal("overview"),
  metadata: analyticsResponseMetadataValidator,
  current: v.union(analyticsServiceKpiSnapshotValidator, v.null()),
  comparison: v.union(analyticsServiceKpiSnapshotValidator, v.null()),
});

export const trendsResponseValidator = v.object({
  kind: v.literal("trends"),
  metadata: analyticsResponseMetadataValidator,
  range: v.object({ from: v.string(), to: v.string() }),
  granularity: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  metrics: v.array(v.string()),
  series: v.array(analyticsTrendPointValidator),
});

export const milestonesResponseValidator = v.object({
  kind: v.literal("milestones"),
  metadata: analyticsResponseMetadataValidator,
  range: v.object({ from: v.string(), to: v.string() }),
  granularity: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  current: v.union(analyticsMilestoneCountsValidator, v.null()),
  currentRates: v.union(analyticsMilestoneRatesValidator, v.null()),
  series: v.array(analyticsMilestonePointValidator),
});

export const healthResponseValidator = v.object({
  kind: v.literal("health"),
  metadata: analyticsResponseMetadataValidator,
  range: v.object({ from: v.string(), to: v.string() }),
  granularity: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  current: v.union(analyticsHealthSignalCountsValidator, v.null()),
  series: v.array(analyticsHealthPointValidator),
});

export const organizationsResponseValidator = v.object({
  kind: v.literal("organizations"),
  metadata: analyticsResponseMetadataValidator,
  rows: v.array(analyticsOrganizationRowValidator),
});

export const organizationDetailResponseValidator = v.object({
  kind: v.literal("organization"),
  metadata: analyticsResponseMetadataValidator,
  organization: v.union(analyticsOrganizationRowValidator, v.null()),
  series: v.array(analyticsOrganizationKpiValidator),
  shops: v.array(analyticsShopRowValidator),
});

export const shopsResponseValidator = v.object({
  kind: v.literal("shops"),
  metadata: analyticsResponseMetadataValidator,
  rows: v.array(analyticsShopListRowValidator),
});

export const shopDetailResponseValidator = v.object({
  kind: v.literal("shop"),
  metadata: analyticsResponseMetadataValidator,
  shop: v.union(analyticsShopRowValidator, v.null()),
  series: v.array(analyticsShopKpiValidator),
});

export const shopCyclesResponseValidator = v.object({
  kind: v.literal("shopCycles"),
  metadata: analyticsResponseMetadataValidator,
  shopId: v.string(),
  rows: v.array(analyticsCycleRowValidator),
});

export const cycleDetailResponseValidator = v.object({
  kind: v.literal("cycle"),
  metadata: analyticsResponseMetadataValidator,
  cycle: v.union(analyticsCycleRowValidator, v.null()),
});

export const segmentsResponseValidator = v.object({
  kind: v.literal("segments"),
  metadata: analyticsResponseMetadataValidator,
  rows: v.array(analyticsSegmentRowValidator),
});

const featureRequestRowValidator = v.object({
  id: v.string(),
  targetKind: v.union(v.literal("shop"), v.literal("organization")),
  organizationId: v.union(v.string(), v.null()),
  organizationName: v.union(v.string(), v.null()),
  shopId: v.union(v.string(), v.null()),
  shopName: v.string(),
  senderType: v.union(v.literal("manager"), v.literal("staff")),
  comment: v.string(),
  createdAt: v.number(),
});

export const featureRequestsResponseValidator = v.object({
  kind: v.literal("requests"),
  metadata: analyticsResponseMetadataValidator,
  rows: v.array(featureRequestRowValidator),
  pageInfo: analyticsPageInfoValidator,
});
