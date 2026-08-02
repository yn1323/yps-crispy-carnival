import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getMondayWeekStart } from "../_lib/dateFormat";
import { ANALYTICS_PIPELINE_KEY } from "../analytics/model";
import type {
  AnalyticsCadenceDto,
  AnalyticsCompleteness,
  AnalyticsCycleRowDto,
  AnalyticsNullableRateDto,
  AnalyticsOrganizationKpiDto,
  AnalyticsOrganizationRowDto,
  AnalyticsPageInfoDto,
  AnalyticsRateDto,
  AnalyticsResponseCompleteness,
  AnalyticsResponseMetadata,
  AnalyticsServiceKpiSnapshotDto,
  AnalyticsShopKpiDto,
  AnalyticsShopRowDto,
} from "./dto";

export type AnalyticsPipelineState = Doc<"analyticsPipelineStates">;

type RatePair = { numerator: number; denominator: number };

export function toRateDto(pair: RatePair): AnalyticsRateDto {
  return {
    numerator: pair.numerator,
    denominator: pair.denominator,
    rate: pair.denominator === 0 ? null : pair.numerator / pair.denominator,
  };
}

export function toNullableRateDto(numerator: number | undefined, denominator: number | undefined) {
  const value: AnalyticsNullableRateDto = {
    numerator: numerator ?? null,
    denominator: denominator ?? null,
    rate: numerator === undefined || denominator === undefined || denominator === 0 ? null : numerator / denominator,
  };
  return value;
}

export function toCadenceDto(
  cadence: { kind: "insufficientData" } | { kind: "estimated"; days: number; confidence: "low" | "medium" | "high" },
): AnalyticsCadenceDto {
  if (cadence.kind === "insufficientData") {
    return { estimatedDays: null, confidence: "insufficientData" };
  }
  return { estimatedDays: cadence.days, confidence: cadence.confidence };
}

export function toDimensionCadenceDto(doc: Doc<"analyticsShops">): AnalyticsCadenceDto {
  if (doc.estimatedCadenceDays === undefined || doc.cadenceConfidence === "insufficientData") {
    return { estimatedDays: null, confidence: "insufficientData" };
  }
  return { estimatedDays: doc.estimatedCadenceDays, confidence: doc.cadenceConfidence };
}

export function toServiceKpiDto(doc: Doc<"analyticsDailyServiceKpis">): AnalyticsServiceKpiSnapshotDto {
  return {
    snapshotDate: doc.snapshotDate,
    rateRange: { from: doc.snapshotDate, to: doc.snapshotDate },
    counts: {
      organizationCount: doc.organizationCount,
      shopCount: doc.shopCount,
      kpiEligibleShopCount: doc.kpiEligibleShopCount,
      activeShopCount: doc.activeShopCount,
      personCount: doc.personCount,
      staffMembershipCount: doc.staffMembershipCount,
      unlinkedStaffCount: doc.unlinkedStaffCount,
      shiftTargetCount: doc.shiftTargetCount,
      managerMembershipCount: doc.managerMembershipCount,
      managerStaffCount: doc.managerStaffCount,
    },
    milestoneCounts: doc.milestoneCounts,
    healthSignalCounts: doc.healthSignalCounts,
    northStar: toRateDto(doc.northStar),
    deadlineSubmission: toRateDto(doc.deadlineSubmission),
    finalSubmission: toRateDto(doc.finalSubmission),
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

export function toOrganizationKpiDto(doc: Doc<"analyticsDailyOrganizationKpis">): AnalyticsOrganizationKpiDto {
  return {
    snapshotDate: doc.snapshotDate,
    rateRange: { from: doc.snapshotDate, to: doc.snapshotDate },
    shopCount: doc.shopCount,
    kpiEligibleShopCount: doc.kpiEligibleShopCount,
    activeShopCount: doc.activeShopCount,
    uniquePersonCount: doc.uniquePersonCount,
    staffMembershipCount: doc.staffMembershipCount,
    unlinkedStaffCount: doc.unlinkedStaffCount,
    shiftTargetCount: doc.shiftTargetCount,
    managerMembershipCount: doc.managerMembershipCount,
    managerStaffCount: doc.managerStaffCount,
    milestoneCounts: doc.milestoneCounts,
    healthSignalCounts: doc.healthSignalCounts,
    northStar: toRateDto(doc.northStar),
    deadlineSubmission: toRateDto(doc.deadlineSubmission),
    finalSubmission: toRateDto(doc.finalSubmission),
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

export function toShopKpiDto(doc: Doc<"analyticsDailyShopKpis">): AnalyticsShopKpiDto {
  return {
    snapshotDate: doc.snapshotDate,
    rateRange: { from: doc.snapshotDate, to: doc.snapshotDate },
    staffMembershipCount: doc.staffMembershipCount,
    shiftTargetCount: doc.shiftTargetCount,
    uniquePersonCount: doc.uniquePersonCount,
    unlinkedStaffCount: doc.unlinkedStaffCount,
    managerMembershipCount: doc.managerMembershipCount,
    managerStaffCount: doc.managerStaffCount,
    lineLinkedCount: doc.lineLinkedCount,
    lineFollowingCount: doc.lineFollowingCount,
    lineLinkedRate: doc.shiftTargetCount === 0 ? null : doc.lineLinkedCount / doc.shiftTargetCount,
    lineFollowingRate: doc.shiftTargetCount === 0 ? null : doc.lineFollowingCount / doc.shiftTargetCount,
    cycleCountAsOfSnapshot: doc.cycleCount,
    confirmedCycleCountAsOfSnapshot: doc.confirmedCycleCount,
    confirmedBeforeStartCycleCountAsOfSnapshot: doc.confirmedBeforeStartCycleCount,
    nextCyclePeriodStart: doc.nextCyclePeriodStart ?? null,
    milestoneDates: {
      registeredAt: doc.milestoneDates.registeredAt,
      firstRecruitmentAt: doc.milestoneDates.firstRecruitmentAt ?? null,
      firstSubmissionAt: doc.milestoneDates.firstSubmissionAt ?? null,
      firstConfirmedAt: doc.milestoneDates.firstConfirmedAt ?? null,
      secondConfirmedAt: doc.milestoneDates.secondConfirmedAt ?? null,
    },
    healthSignals: doc.healthSignals,
    issueHealthSignalCount: doc.issueHealthSignalCount,
    cadence: toCadenceDto(doc.cadence),
    northStar: toRateDto(doc.northStar),
    deadlineSubmission: toRateDto(doc.deadlineSubmission),
    finalSubmission: toRateDto(doc.finalSubmission),
    cumulativeDeadlineSubmission: toRateDto(doc.cumulativeDeadlineSubmission),
    cumulativeFinalSubmission: toRateDto(doc.cumulativeFinalSubmission),
    cumulativeNotificationSentCount: doc.cumulativeNotificationSentCount,
    cumulativeNotificationFailedCount: doc.cumulativeNotificationFailedCount,
    confirmationLeadTimeMedianMs: doc.confirmationLeadTimeMedianMs ?? null,
    confirmationLeadTimeP90Ms: doc.confirmationLeadTimeP90Ms ?? null,
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

export function toOrganizationRowDto(
  doc: Doc<"analyticsOrganizations">,
  kpis: AnalyticsOrganizationKpiDto | null,
): AnalyticsOrganizationRowDto {
  return {
    organizationId: doc.organizationId,
    displayName: doc.displayName,
    registeredAt: doc.registeredAt,
    deletedAt: doc.deletedAt ?? null,
    currentPlan: doc.currentPlan ?? null,
    firstShopAt: doc.firstShopAt ?? null,
    secondShopAt: doc.secondShopAt ?? null,
    secondShopFirstConfirmedAt: doc.secondShopFirstConfirmedAt ?? null,
    kpis,
  };
}

export function toShopRowDto(
  doc: Doc<"analyticsShops">,
  organizationDisplayName: string,
  kpis: AnalyticsShopKpiDto | null,
): AnalyticsShopRowDto {
  return {
    organizationId: doc.organizationId,
    organizationDisplayName,
    shopId: doc.shopId,
    displayName: doc.displayName,
    registeredAt: doc.registeredAt,
    deletedAt: doc.deletedAt ?? null,
    currentPlan: doc.currentPlan ?? null,
    milestoneDates: {
      registeredAt: doc.registeredAt,
      firstRecruitmentAt: doc.firstRecruitmentAt ?? null,
      firstSubmissionAt: doc.firstSubmissionAt ?? null,
      firstConfirmedAt: doc.firstConfirmedAt ?? null,
      secondConfirmedAt: doc.secondConfirmedAt ?? null,
    },
    latestActivityAt: doc.latestActivityAt ?? null,
    nextCyclePeriodStart: kpis?.nextCyclePeriodStart ?? null,
    cadence: kpis?.cadence ?? toDimensionCadenceDto(doc),
    kpis,
  };
}

export function toCycleRowDto(
  doc: Doc<"analyticsShiftCycles">,
  organizationDisplayName: string,
  shopDisplayName: string,
): AnalyticsCycleRowDto {
  return {
    recruitmentId: doc.recruitmentId,
    organizationId: doc.organizationId,
    organizationDisplayName,
    shopId: doc.shopId,
    shopDisplayName,
    sequenceNumber: doc.sequenceNumber ?? null,
    createdAt: doc.createdAt,
    submitDeadlineAt: doc.submitDeadlineAt,
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    confirmedAt: doc.confirmedAt ?? null,
    deletedAt: doc.deletedAt ?? null,
    closedAt: doc.closedAt ?? null,
    deadlineSubmission: toNullableRateDto(doc.submittedAtDeadline, doc.targetAtDeadline),
    finalSubmission: toNullableRateDto(doc.submittedAtClose, doc.targetAtClose),
    notificationSentCount: doc.notificationSentCount,
    notificationFailedCount: doc.notificationFailedCount,
    reminderSentCount: doc.reminderSentCount,
    creationLeadTimeMs: doc.creationLeadTimeMs ?? null,
    confirmationLeadTimeMs: doc.confirmationLeadTimeMs ?? null,
    confirmedBeforeStart: doc.confirmedBeforeStart ?? null,
    completeness: doc.completeness,
    finalizedAt: doc.finalizedAt ?? null,
    updatedAt: doc.updatedAt,
  };
}

export function pageInfo(args: {
  cursor: string | null;
  continueCursor?: string | null;
  isDone?: boolean;
  pageSize: number;
  returnedCount: number;
}): AnalyticsPageInfoDto {
  return {
    cursor: args.cursor,
    continueCursor: args.continueCursor ?? null,
    isDone: args.isDone ?? true,
    pageSize: args.pageSize,
    returnedCount: args.returnedCount,
  };
}

export async function getPipelineState(ctx: QueryCtx): Promise<AnalyticsPipelineState | null> {
  return await ctx.db
    .query("analyticsPipelineStates")
    .withIndex("by_pipelineKey", (q) => q.eq("pipelineKey", ANALYTICS_PIPELINE_KEY))
    .unique();
}

export function effectiveSnapshotDate(state: AnalyticsPipelineState | null, requestedTo: string) {
  const latest = state?.latestCompleteSnapshotDate;
  if (!latest) return null;
  return latest < requestedTo ? latest : requestedTo;
}

export function combineCompleteness(values: readonly AnalyticsCompleteness[]): AnalyticsCompleteness {
  if (values.length === 0 || values.every((value) => value === "unavailable")) return "unavailable";
  if (values.every((value) => value === "complete")) return "complete";
  return "partial";
}

function rangeCoverage(state: AnalyticsPipelineState, range: { from: string; to: string }): AnalyticsCompleteness {
  const latest = state.latestCompleteSnapshotDate;
  if (!latest || range.to < state.dataStartDate || range.from > latest) return "unavailable";
  if (range.from < state.dataStartDate || range.to > latest) return "partial";
  return "complete";
}

function mergeResponseCompleteness(
  left: AnalyticsResponseCompleteness,
  right: AnalyticsCompleteness,
): AnalyticsResponseCompleteness {
  if (left === "pending") return left;
  if (left === "unavailable" || right === "unavailable") return "unavailable";
  if (left === "partial" || right === "partial") return "partial";
  return "complete";
}

export function responseMetadata(args: {
  state: AnalyticsPipelineState | null;
  completeness: AnalyticsResponseCompleteness;
  computedAt: number | null;
  pageInfo: AnalyticsPageInfoDto;
  ranges?: Array<{ from: string; to: string }>;
  warnings?: string[];
}): AnalyticsResponseMetadata {
  const warnings = [...(args.warnings ?? [])];
  if (!args.state?.activeGeneration) warnings.push("分析pipelineの初回構築が完了していません");
  const activeState = args.state?.activeGeneration ? args.state : null;
  const activeStatus = activeState?.buildingGeneration
    ? (activeState.statusBeforeBuilding ?? "degraded")
    : activeState?.status;
  if (activeStatus === "degraded") warnings.push("分析pipelineが一部停止しています");
  if (activeStatus === "paused") warnings.push("分析pipelineが停止しています");
  if (activeState?.buildingGeneration && activeState.status === "degraded") {
    warnings.push("分析pipelineの再構築が一部停止しています");
  }
  let completeness = activeState
    ? (args.ranges ?? []).reduce(
        (current, range) => mergeResponseCompleteness(current, rangeCoverage(activeState, range)),
        args.completeness,
      )
    : "pending";
  if (activeStatus === "degraded") completeness = mergeResponseCompleteness(completeness, "partial");
  return {
    asOf: args.state?.lastProjectedAt ?? args.state?.latestCompleteSnapshotAt ?? args.state?.updatedAt ?? null,
    dataStartDate: args.state?.dataStartDate ?? null,
    latestCompleteSnapshotDate: args.state?.latestCompleteSnapshotDate ?? null,
    computedAt: args.computedAt,
    completeness,
    warnings: [...new Set(warnings)],
    pageInfo: args.pageInfo,
  };
}

export function bucketDate(date: string, granularity: "day" | "week" | "month") {
  if (granularity === "week") return getMondayWeekStart(date);
  if (granularity === "month") return `${date.slice(0, 7)}-01`;
  return date;
}

export async function getOrganizationDimension(
  ctx: QueryCtx,
  generation: string,
  organizationId: Doc<"analyticsOrganizations">["organizationId"],
) {
  return await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId),
    )
    .unique();
}

export async function getShopDimension(ctx: QueryCtx, generation: string, shopId: Doc<"analyticsShops">["shopId"]) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_shopId", (q) => q.eq("generation", generation).eq("shopId", shopId))
    .unique();
}

export async function getLatestOrganizationKpi(
  ctx: QueryCtx,
  generation: string,
  organizationId: Doc<"analyticsOrganizations">["organizationId"],
  to: string,
) {
  return await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId).lte("snapshotDate", to),
    )
    .order("desc")
    .first();
}

export async function getLatestShopKpi(
  ctx: QueryCtx,
  generation: string,
  shopId: Doc<"analyticsShops">["shopId"],
  to: string,
) {
  return await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
      q.eq("generation", generation).eq("shopId", shopId).lte("snapshotDate", to),
    )
    .order("desc")
    .first();
}
