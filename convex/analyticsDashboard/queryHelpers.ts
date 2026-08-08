import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { addDays, getMondayWeekStart, subtractCalendarMonths } from "../_lib/dateFormat";
import { ANALYTICS_POLICY } from "../analytics/registry";
import type {
  AnalyticsAvailability,
  AnalyticsCadenceDto,
  AnalyticsCompleteness,
  AnalyticsCycleRowDto,
  AnalyticsNullableRateDto,
  AnalyticsOrganizationKpiDto,
  AnalyticsOrganizationRowDto,
  AnalyticsPageInfoDto,
  AnalyticsRateDto,
  AnalyticsResponseMetadata,
  AnalyticsServiceKpiSnapshotDto,
  AnalyticsShopKpiDto,
  AnalyticsShopRowDto,
} from "./dto";

export type AnalyticsRun = Doc<"analyticsRuns">;

export type CompleteDailyRun = AnalyticsRun & {
  kind: "daily";
  status: "complete";
  targetDate: string;
};

export type AnalyticsReadState = {
  availability: AnalyticsAvailability;
  asOf: number | null;
  dataStartDate: string | null;
  latestCompleteRun: CompleteDailyRun | null;
  latestCompleteSnapshotDate: string | null;
  warnings: string[];
};

export type AnalyticsRunRange = {
  effectiveFrom: string | null;
  effectiveTo: string | null;
  latestCompleteRun: CompleteDailyRun | null;
  missingDates: string[];
  retentionStartDate: string | null;
  runIdsByDate: ReadonlyMap<string, Id<"analyticsRuns">>;
};

export function hasCompleteRequestedRange(
  state: Pick<AnalyticsReadState, "dataStartDate" | "latestCompleteSnapshotDate">,
  requested: { from: string; to: string },
  range: AnalyticsRunRange,
) {
  return (
    range.effectiveFrom !== null &&
    range.effectiveTo !== null &&
    range.missingDates.length === 0 &&
    state.dataStartDate !== null &&
    requested.from >= state.dataStartDate &&
    state.latestCompleteSnapshotDate !== null &&
    requested.to <= state.latestCompleteSnapshotDate
  );
}

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
  if (doc.kpiEligible === undefined) throw new Error("analytics_daily_shop_eligibility_missing");
  const milestoneDates = doc.kpiEligible
    ? {
        registeredAt: doc.milestoneDates.registeredAt,
        firstRecruitmentAt: doc.milestoneDates.firstRecruitmentAt ?? null,
        firstSubmissionAt: doc.milestoneDates.firstSubmissionAt ?? null,
        firstConfirmedAt: doc.milestoneDates.firstConfirmedAt ?? null,
        secondConfirmedAt: doc.milestoneDates.secondConfirmedAt ?? null,
      }
    : {
        registeredAt: doc.milestoneDates.registeredAt,
        firstRecruitmentAt: null,
        firstSubmissionAt: null,
        firstConfirmedAt: null,
        secondConfirmedAt: null,
      };
  return {
    snapshotDate: doc.snapshotDate,
    rateRange: { from: doc.snapshotDate, to: doc.snapshotDate },
    kpiEligible: doc.kpiEligible,
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
    milestoneDates,
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
  dataStartAt: number,
): AnalyticsOrganizationRowDto {
  return {
    organizationId: doc.organizationId,
    displayName: doc.displayName,
    registeredAt: doc.registeredAt,
    deletedAt: doc.deletedAt ?? null,
    currentPlan: doc.currentPlan ?? null,
    firstShopAt: doc.firstShopAt ?? null,
    secondShopAt: doc.secondShopAt ?? null,
    secondShopFirstConfirmedAt:
      doc.secondShopAt !== undefined && doc.secondShopAt >= dataStartAt
        ? (doc.secondShopFirstConfirmedAt ?? null)
        : null,
    kpis,
  };
}

export function toShopRowDto(
  doc: Doc<"analyticsShops">,
  organizationDisplayName: string,
  kpis: AnalyticsShopKpiDto | null,
): AnalyticsShopRowDto {
  const milestoneEligible = kpis?.kpiEligible === true;
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
      firstRecruitmentAt: milestoneEligible ? (doc.firstRecruitmentAt ?? null) : null,
      firstSubmissionAt: milestoneEligible ? (doc.firstSubmissionAt ?? null) : null,
      firstConfirmedAt: milestoneEligible ? (doc.firstConfirmedAt ?? null) : null,
      secondConfirmedAt: milestoneEligible ? (doc.secondConfirmedAt ?? null) : null,
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

function laterRun(left: AnalyticsRun | null, right: AnalyticsRun | null): AnalyticsRun | null {
  if (!left) return right;
  if (!right) return left;
  const leftTarget = left.targetDate ?? "";
  const rightTarget = right.targetDate ?? "";
  if (leftTarget !== rightTarget) return leftTarget > rightTarget ? left : right;
  if (left.startedAt !== right.startedAt) return left.startedAt > right.startedAt ? left : right;
  return left._creationTime > right._creationTime ? left : right;
}

function startedAfter(run: AnalyticsRun | null, boundary: AnalyticsRun | null) {
  if (!run) return false;
  if (!boundary) return true;
  if (run.startedAt !== boundary.startedAt) return run.startedAt > boundary.startedAt;
  return run._creationTime > boundary._creationTime;
}

async function latestRun(ctx: QueryCtx, kind: "daily" | "reset", status: "running" | "complete" | "failed") {
  return await ctx.db
    .query("analyticsRuns")
    .withIndex("by_kind_and_status_and_targetDate", (q) => q.eq("kind", kind).eq("status", status))
    .order("desc")
    .first();
}

export async function getAnalyticsReadState(ctx: QueryCtx): Promise<AnalyticsReadState> {
  const [runningDaily, completeDaily, failedDaily, runningReset, completeReset, failedReset] = await Promise.all([
    latestRun(ctx, "daily", "running"),
    latestRun(ctx, "daily", "complete"),
    latestRun(ctx, "daily", "failed"),
    latestRun(ctx, "reset", "running"),
    latestRun(ctx, "reset", "complete"),
    latestRun(ctx, "reset", "failed"),
  ]);
  const latestDaily = laterRun(laterRun(runningDaily, completeDaily), failedDaily);
  const latestReset = laterRun(laterRun(runningReset, completeReset), failedReset);
  const latestDailyAfterReset = startedAfter(latestDaily, latestReset) ? latestDaily : null;
  const latestCompleteRun =
    completeDaily?.targetDate !== undefined && startedAfter(completeDaily, latestReset)
      ? (completeDaily as CompleteDailyRun)
      : null;
  const warnings: string[] = [];
  let availability: AnalyticsAvailability = "available";

  if (latestReset?.status === "running") {
    availability = "unavailable";
    warnings.push("分析データの再構築を実行中です");
  } else if (latestReset?.status === "failed") {
    availability = "unavailable";
    warnings.push("分析データの再構築に失敗しています");
  } else if (latestDailyAfterReset?.status === "running") {
    availability = "unavailable";
    warnings.push("日次集計を実行中です");
  } else if (latestDailyAfterReset?.status === "failed") {
    availability = "unavailable";
    warnings.push("最新の日次集計に失敗しています");
  } else if (!latestCompleteRun) {
    availability = "unavailable";
    warnings.push("利用可能な日次集計がありません");
  }

  const controlRun = latestDailyAfterReset ?? latestReset ?? latestDaily;
  return {
    availability,
    asOf: latestCompleteRun?.cutoffAt ?? null,
    dataStartDate: controlRun?.dataStartDate ?? latestCompleteRun?.dataStartDate ?? null,
    latestCompleteRun,
    latestCompleteSnapshotDate: latestCompleteRun?.targetDate ?? null,
    warnings,
  };
}

export async function getCompleteRunRange(
  ctx: QueryCtx,
  state: AnalyticsReadState,
  range: { from: string; to: string },
  options: { detailRetention?: boolean } = {},
): Promise<AnalyticsRunRange> {
  const latest = state.latestCompleteSnapshotDate;
  const dataStartDate = state.dataStartDate;
  const retentionStartDate =
    options.detailRetention && latest ? subtractCalendarMonths(latest, ANALYTICS_POLICY.retention.detailMonths) : null;
  const effectiveDataStartDate =
    dataStartDate && retentionStartDate && dataStartDate < retentionStartDate ? retentionStartDate : dataStartDate;
  if (!latest || !effectiveDataStartDate || range.to < effectiveDataStartDate) {
    return {
      effectiveFrom: null,
      effectiveTo: null,
      latestCompleteRun: null,
      missingDates: [],
      retentionStartDate,
      runIdsByDate: new Map(),
    };
  }
  const effectiveFrom = range.from < effectiveDataStartDate ? effectiveDataStartDate : range.from;
  const effectiveTo = range.to > latest ? latest : range.to;
  if (effectiveFrom > effectiveTo) {
    return {
      effectiveFrom: null,
      effectiveTo: null,
      latestCompleteRun: null,
      missingDates: [],
      retentionStartDate,
      runIdsByDate: new Map(),
    };
  }
  const runs = await ctx.db
    .query("analyticsRuns")
    .withIndex("by_kind_and_status_and_targetDate", (q) =>
      q.eq("kind", "daily").eq("status", "complete").gte("targetDate", effectiveFrom).lte("targetDate", effectiveTo),
    )
    .take(1_832);
  const runIdsByDate = new Map<string, Id<"analyticsRuns">>();
  for (const run of runs) {
    if (!run.targetDate) continue;
    runIdsByDate.set(run.targetDate, run._id);
  }
  const missingDates: string[] = [];
  for (let date = effectiveFrom; date <= effectiveTo; date = addDays(date, 1)) {
    if (!runIdsByDate.has(date)) missingDates.push(date);
  }
  const latestCompleteRun = runs.find((run) => run.targetDate === effectiveTo) as CompleteDailyRun | undefined;
  return {
    effectiveFrom,
    effectiveTo,
    latestCompleteRun: latestCompleteRun ?? null,
    missingDates,
    retentionStartDate,
    runIdsByDate,
  };
}

export function rowBelongsToCompleteRun(
  row: { runId?: Id<"analyticsRuns">; snapshotDate: string },
  range: AnalyticsRunRange,
) {
  return range.runIdsByDate.get(row.snapshotDate) === row.runId;
}

export function combineCompleteness(values: readonly AnalyticsCompleteness[]): AnalyticsCompleteness {
  if (values.length === 0 || values.every((value) => value === "unavailable")) return "unavailable";
  if (values.every((value) => value === "complete")) return "complete";
  return "partial";
}

export function responseMetadata(args: {
  state: AnalyticsReadState;
  availability?: AnalyticsAvailability;
  computedAt: number | null;
  pageInfo: AnalyticsPageInfoDto;
  warnings?: string[];
}): AnalyticsResponseMetadata {
  const availability =
    args.state.availability === "unavailable" || args.availability === "unavailable" ? "unavailable" : "available";
  return {
    availability,
    asOf: args.state.asOf,
    dataStartDate: args.state.dataStartDate,
    latestCompleteSnapshotDate: args.state.latestCompleteSnapshotDate,
    computedAt: args.computedAt,
    warnings: [...new Set([...args.state.warnings, ...(args.warnings ?? [])])],
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
  organizationId: Doc<"analyticsOrganizations">["organizationId"],
) {
  return await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
}

export async function getShopDimension(ctx: QueryCtx, shopId: Doc<"analyticsShops">["shopId"]) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .unique();
}

export async function getLatestOrganizationKpi(
  ctx: QueryCtx,
  run: CompleteDailyRun,
  organizationId: Doc<"analyticsOrganizations">["organizationId"],
) {
  return await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_organizationId_and_snapshotDate", (q) =>
      q.eq("organizationId", organizationId).eq("snapshotDate", run.targetDate),
    )
    .filter((q) => q.eq(q.field("runId"), run._id))
    .unique();
}

export async function getLatestShopKpi(ctx: QueryCtx, run: CompleteDailyRun, shopId: Doc<"analyticsShops">["shopId"]) {
  return await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_shopId_and_snapshotDate", (q) => q.eq("shopId", shopId).eq("snapshotDate", run.targetDate))
    .filter((q) => q.eq(q.field("runId"), run._id))
    .unique();
}
