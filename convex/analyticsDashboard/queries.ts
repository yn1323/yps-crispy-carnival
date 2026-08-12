import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { monthJST } from "../_lib/dateFormat";
import { FEATURE_REQUEST_LIST_LIMIT } from "../constants";
import type {
  AnalyticsCompleteness,
  AnalyticsCountSummaryDto,
  AnalyticsHealthPointDto,
  AnalyticsMilestonePointDto,
  AnalyticsMilestoneRatesDto,
  AnalyticsOrganizationKpiDto,
  AnalyticsSegmentRowDto,
  AnalyticsServiceKpiSnapshotDto,
  AnalyticsShopKpiDto,
  AnalyticsShopListRowDto,
  AnalyticsShopRowDto,
  AnalyticsTrendMetric,
  AnalyticsTrendPointDto,
  AnalyticsTrendValueDto,
} from "./dto";
import {
  type AnalyticsReadState,
  type AnalyticsRunRange,
  bucketDate,
  classifyShopUsage,
  combineCompleteness,
  getAnalyticsReadState,
  getCompleteRunRange,
  getLatestOrganizationKpi,
  getLatestShopKpi,
  getOrganizationDimension,
  getShopDimension,
  hasCompleteRequestedRange,
  pageInfo,
  responseMetadata,
  rowBelongsToCompleteRun,
  toCycleRowDto,
  toOrganizationKpiDto,
  toOrganizationRowDto,
  toRateDto,
  toShopKpiDto,
  toShopRowDto,
  usageMatches,
} from "./queryHelpers";
import {
  ANALYTICS_DASHBOARD_MAX_RANGE_DAYS,
  ANALYTICS_DASHBOARD_MAX_SCAN_ROWS,
  ANALYTICS_DASHBOARD_MAX_TREND_POINTS,
} from "./schemas";
import {
  cycleDetailResponseValidator,
  featureRequestsResponseValidator,
  healthResponseValidator,
  milestonesResponseValidator,
  organizationDetailResponseValidator,
  organizationsResponseValidator,
  overviewResponseValidator,
  segmentsResponseValidator,
  shopCyclesResponseValidator,
  shopDetailResponseValidator,
  shopsResponseValidator,
  trendsResponseValidator,
} from "./validators";

const analyticsCompletenessArg = v.union(v.literal("complete"), v.literal("partial"), v.literal("unavailable"));
const granularityArg = v.union(v.literal("day"), v.literal("week"), v.literal("month"));
const directionArg = v.union(v.literal("asc"), v.literal("desc"));
const planArg = v.union(v.literal("trial"), v.literal("free"), v.literal("pro"), v.literal("business"));
const nullableStringArg = v.union(v.string(), v.null());
const nullableCompletenessArg = v.union(analyticsCompletenessArg, v.null());
const PAGINATION_MAX_BYTES = 256 * 1024;

type RatePair = { numerator: number; denominator: number };

type SeriesSource = {
  snapshotDate: string;
  counts: AnalyticsCountSummaryDto;
  milestoneCounts: Doc<"analyticsDailyServiceKpis">["milestoneCounts"];
  healthSignalCounts: Doc<"analyticsDailyServiceKpis">["healthSignalCounts"];
  northStar: RatePair;
  deadlineSubmission: RatePair;
  finalSubmission: RatePair;
  completeness: AnalyticsCompleteness;
  computedAt: number;
};

function singletonPageInfo(returnedCount: number) {
  return pageInfo({ cursor: null, pageSize: Math.max(1, returnedCount), returnedCount });
}

function pageWarnings(page: { pageStatus?: string | null }) {
  return page.pageStatus ? ["読み取り上限によりpageが分割されました"] : [];
}

const FILTERED_PAGE_INCOMPLETE_WARNING = "filtered_page_incomplete: 条件に一致する候補の確認は次のページへ続きます";

function filteredPageWarnings(page: { isDone: boolean; pageStatus?: string | null }, filteredInMemory: boolean) {
  return [
    ...pageWarnings(page),
    ...(filteredInMemory && (!page.isDone || page.pageStatus) ? [FILTERED_PAGE_INCOMPLETE_WARNING] : []),
  ];
}

function maxOrNull(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function maxComputedAt(rows: Array<{ kpis: { computedAt: number } | null }>) {
  const values = rows.flatMap((row) => (row.kpis ? [row.kpis.computedAt] : []));
  return maxOrNull(values);
}

function missingDataWarnings(
  from: string,
  to: string,
  dataStartDate: string | null,
  latest: string | null,
  missingDates: readonly string[] = [],
) {
  const warnings: string[] = [];
  if (dataStartDate && from < dataStartDate) warnings.push("データ蓄積開始日より前の期間は値がありません");
  if (!latest || to > latest) warnings.push("指定期間の末日まで完全なsnapshotがありません");
  if (missingDates.length > 0) {
    warnings.push(`選択期間に欠損日があります（${missingDates.length}日、最初: ${missingDates[0]}）`);
  }
  return warnings;
}

function rangeWarnings(state: AnalyticsReadState, requested: { from: string; to: string }, range: AnalyticsRunRange) {
  const warnings = missingDataWarnings(
    requested.from,
    requested.to,
    state.dataStartDate,
    state.latestCompleteSnapshotDate,
    range.missingDates,
  );
  if (range.retentionStartDate && requested.from < range.retentionStartDate) {
    warnings.push(`組織・店舗別の詳細データは${range.retentionStartDate}以降を保持しています`);
  }
  return warnings;
}

function missingBuckets(range: AnalyticsRunRange, granularity: "day" | "week" | "month") {
  return new Set(range.missingDates.map((date) => bucketDate(date, granularity)));
}

function requireSeriesWithinPointLimit<T>(series: T[]): T[] {
  if (series.length > ANALYTICS_DASHBOARD_MAX_TREND_POINTS) {
    throw new Error("Analytics series point limit exceeded");
  }
  return series;
}

export const getOverview = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    compareFrom: nullableStringArg,
    compareTo: nullableStringArg,
    organizationId: nullableStringArg,
    shopId: nullableStringArg,
  },
  returns: v.union(overviewResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const detailRetention = args.organizationId !== null || args.shopId !== null;
    const currentRange = await getCompleteRunRange(ctx, state, args, { detailRetention });
    const comparisonRange =
      args.compareFrom && args.compareTo
        ? await getCompleteRunRange(ctx, state, { from: args.compareFrom, to: args.compareTo }, { detailRetention })
        : null;
    const canReadCurrent = state.availability === "available" && hasCompleteRequestedRange(state, args, currentRange);
    const canReadComparison =
      state.availability === "available" &&
      comparisonRange !== null &&
      args.compareFrom !== null &&
      args.compareTo !== null &&
      hasCompleteRequestedRange(state, { from: args.compareFrom, to: args.compareTo }, comparisonRange);
    const currentRows = canReadCurrent
      ? await getScopedSeries(ctx, { ...args, range: currentRange })
      : ([] as SeriesSource[]);
    if (currentRows === null) return null;
    const comparisonRows =
      canReadComparison && args.compareFrom && args.compareTo && comparisonRange
        ? await getScopedSeries(ctx, {
            from: args.compareFrom,
            to: args.compareTo,
            organizationId: args.organizationId,
            shopId: args.shopId,
            range: comparisonRange,
          })
        : ([] as SeriesSource[]);
    if (comparisonRows === null) return null;
    const current = overviewSnapshot(currentRows);
    const comparison = overviewSnapshot(comparisonRows);
    return {
      kind: "overview" as const,
      metadata: responseMetadata({
        state,
        availability: canReadCurrent ? "available" : "unavailable",
        computedAt: maxOrNull([current?.computedAt, comparison?.computedAt].filter((value) => value !== undefined)),
        pageInfo: singletonPageInfo(current ? 1 : 0),
        warnings: [
          ...rangeWarnings(state, args, currentRange),
          ...(args.compareFrom && args.compareTo && comparisonRange
            ? rangeWarnings(state, { from: args.compareFrom, to: args.compareTo }, comparisonRange)
            : []),
        ],
      }),
      current,
      comparison,
    };
  },
});

function serviceSource(doc: Doc<"analyticsDailyServiceKpis">): SeriesSource {
  return {
    snapshotDate: doc.snapshotDate,
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
    northStar: doc.northStar,
    deadlineSubmission: doc.deadlineSubmission,
    finalSubmission: doc.finalSubmission,
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

function organizationSource(doc: Doc<"analyticsDailyOrganizationKpis">): SeriesSource {
  return {
    snapshotDate: doc.snapshotDate,
    counts: {
      organizationCount: 1,
      shopCount: doc.shopCount,
      kpiEligibleShopCount: doc.kpiEligibleShopCount,
      activeShopCount: doc.activeShopCount,
      personCount: doc.uniquePersonCount,
      staffMembershipCount: doc.staffMembershipCount,
      unlinkedStaffCount: doc.unlinkedStaffCount,
      shiftTargetCount: doc.shiftTargetCount,
      managerMembershipCount: doc.managerMembershipCount,
      managerStaffCount: doc.managerStaffCount,
    },
    milestoneCounts: doc.milestoneCounts,
    healthSignalCounts: doc.healthSignalCounts,
    northStar: doc.northStar,
    deadlineSubmission: doc.deadlineSubmission,
    finalSubmission: doc.finalSubmission,
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

function shopSource(doc: Doc<"analyticsDailyShopKpis">): SeriesSource {
  const kpiEligible = doc.kpiEligible === true;
  return {
    snapshotDate: doc.snapshotDate,
    counts: {
      organizationCount: 1,
      shopCount: 1,
      kpiEligibleShopCount: kpiEligible ? 1 : 0,
      activeShopCount: doc.hasRecentActivity ? 1 : 0,
      personCount: doc.uniquePersonCount,
      staffMembershipCount: doc.staffMembershipCount,
      unlinkedStaffCount: doc.unlinkedStaffCount,
      shiftTargetCount: doc.shiftTargetCount,
      managerMembershipCount: doc.managerMembershipCount,
      managerStaffCount: doc.managerStaffCount,
    },
    milestoneCounts: {
      registered: kpiEligible ? 1 : 0,
      firstRecruitment: kpiEligible && doc.milestoneDates.firstRecruitmentAt !== undefined ? 1 : 0,
      firstSubmission: kpiEligible && doc.milestoneDates.firstSubmissionAt !== undefined ? 1 : 0,
      firstConfirmed: kpiEligible && doc.milestoneDates.firstConfirmedAt !== undefined ? 1 : 0,
      secondConfirmed: kpiEligible && doc.milestoneDates.secondConfirmedAt !== undefined ? 1 : 0,
    },
    healthSignalCounts: {
      hasUpcomingCycle: doc.healthSignals.some((signal) => signal.signal === "hasUpcomingCycle") ? 1 : 0,
      nextCycleMissing: doc.healthSignals.some((signal) => signal.signal === "nextCycleMissing") ? 1 : 0,
      cadenceDelayed: doc.healthSignals.some((signal) => signal.signal === "cadenceDelayed") ? 1 : 0,
      notificationFailure: doc.healthSignals.some((signal) => signal.signal === "notificationFailure") ? 1 : 0,
      submissionDrop: doc.healthSignals.some((signal) => signal.signal === "submissionDrop") ? 1 : 0,
      confirmationDelay: doc.healthSignals.some((signal) => signal.signal === "confirmationDelay") ? 1 : 0,
      longInactive: doc.healthSignals.some((signal) => signal.signal === "longInactive") ? 1 : 0,
      insufficientData: doc.healthSignals.some((signal) => signal.signal === "insufficientData") ? 1 : 0,
    },
    northStar: doc.northStar,
    deadlineSubmission: doc.deadlineSubmission,
    finalSubmission: doc.finalSubmission,
    completeness: doc.completeness,
    computedAt: doc.computedAt,
  };
}

function summedPair(rows: SeriesSource[], select: (row: SeriesSource) => RatePair): RatePair {
  return rows
    .filter((row) => row.completeness === "complete")
    .reduce(
      (sum, row) => {
        const value = select(row);
        return { numerator: sum.numerator + value.numerator, denominator: sum.denominator + value.denominator };
      },
      { numerator: 0, denominator: 0 },
    );
}

function overviewSnapshot(rows: SeriesSource[]): AnalyticsServiceKpiSnapshotDto | null {
  const first = rows[0];
  const latest = rows.at(-1);
  if (!first || !latest) return null;
  return {
    snapshotDate: latest.snapshotDate,
    rateRange: { from: first.snapshotDate, to: latest.snapshotDate },
    counts: latest.counts,
    milestoneCounts: latest.milestoneCounts,
    healthSignalCounts: latest.healthSignalCounts,
    northStar: toRateDto(summedPair(rows, (row) => row.northStar)),
    deadlineSubmission: toRateDto(summedPair(rows, (row) => row.deadlineSubmission)),
    finalSubmission: toRateDto(summedPair(rows, (row) => row.finalSubmission)),
    completeness: combineCompleteness(rows.map((row) => row.completeness)),
    computedAt: Math.max(...rows.map((row) => row.computedAt)),
  };
}

async function getScopedSeries(
  ctx: QueryCtx,
  args: {
    from: string;
    to: string;
    organizationId: string | null;
    shopId: string | null;
    range: AnalyticsRunRange;
  },
): Promise<SeriesSource[] | null> {
  const effectiveFrom = args.range.effectiveFrom;
  const effectiveTo = args.range.effectiveTo;
  if (!effectiveFrom || !effectiveTo) return [];
  if (args.shopId) {
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    const shop = await getShopDimension(ctx, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const rows = await ctx.db
      .query("analyticsDailyShopKpis")
      .withIndex("by_shopId_and_snapshotDate", (q) =>
        q.eq("shopId", shopId).gte("snapshotDate", effectiveFrom).lte("snapshotDate", effectiveTo),
      )
      .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
    return rows.filter((row) => rowBelongsToCompleteRun(row, args.range)).map(shopSource);
  }
  if (args.organizationId) {
    const organizationId = ctx.db.normalizeId("organizations", args.organizationId);
    if (!organizationId) return null;
    const organization = await getOrganizationDimension(ctx, organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const rows = await ctx.db
      .query("analyticsDailyOrganizationKpis")
      .withIndex("by_organizationId_and_snapshotDate", (q) =>
        q.eq("organizationId", organizationId).gte("snapshotDate", effectiveFrom).lte("snapshotDate", effectiveTo),
      )
      .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
    return rows.filter((row) => rowBelongsToCompleteRun(row, args.range)).map(organizationSource);
  }
  const rows = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_snapshotDate", (q) => q.gte("snapshotDate", effectiveFrom).lte("snapshotDate", effectiveTo))
    .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
  return rows.filter((row) => rowBelongsToCompleteRun(row, args.range)).map(serviceSource);
}

function groupedSources(rows: SeriesSource[], granularity: "day" | "week" | "month") {
  const buckets = new Map<string, SeriesSource[]>();
  for (const row of rows) {
    const key = bucketDate(row.snapshotDate, granularity);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function summedRate(rows: SeriesSource[], select: (row: SeriesSource) => RatePair): AnalyticsTrendValueDto {
  const completeRows = rows.filter((row) => row.completeness === "complete");
  if (completeRows.length === 0) return { value: null, numerator: null, denominator: null };
  const pair = summedPair(completeRows, select);
  return {
    value: pair.denominator === 0 ? null : pair.numerator / pair.denominator,
    numerator: pair.numerator,
    denominator: pair.denominator,
  };
}

function trendPoint(date: string, rows: SeriesSource[], metrics: AnalyticsTrendMetric[]): AnalyticsTrendPointDto {
  const latest = rows.at(-1);
  if (!latest) throw new Error("Analytics trend bucket is empty");
  const values: Partial<Record<AnalyticsTrendMetric, AnalyticsTrendValueDto>> = {};
  for (const metric of metrics) {
    if (metric === "northStarRate") values[metric] = summedRate(rows, (row) => row.northStar);
    else if (metric === "deadlineSubmissionRate") values[metric] = summedRate(rows, (row) => row.deadlineSubmission);
    else if (metric === "finalSubmissionRate") values[metric] = summedRate(rows, (row) => row.finalSubmission);
    else {
      values[metric] = { value: latest.counts[metric] ?? null, numerator: null, denominator: null };
    }
  }
  return {
    date,
    values,
    completeness: combineCompleteness(rows.map((row) => row.completeness)),
    computedAt: Math.max(...rows.map((row) => row.computedAt)),
  };
}

export const getTrends = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    granularity: granularityArg,
    metrics: v.array(v.string()),
    organizationId: nullableStringArg,
    shopId: nullableStringArg,
  },
  returns: v.union(trendsResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, {
      detailRetention: args.organizationId !== null || args.shopId !== null,
    });
    const canRead = state.availability === "available" && range.effectiveTo !== null;
    const rows = canRead ? await getScopedSeries(ctx, { ...args, range }) : ([] as SeriesSource[]);
    if (rows === null) return null;
    const metrics = args.metrics as AnalyticsTrendMetric[];
    const incompleteBuckets = missingBuckets(range, args.granularity);
    const series = requireSeriesWithinPointLimit(
      groupedSources(rows, args.granularity)
        .filter(([date]) => !incompleteBuckets.has(date))
        .map(([date, bucket]) => trendPoint(date, bucket, metrics)),
    );
    return {
      kind: "trends" as const,
      metadata: responseMetadata({
        state,
        availability: canRead ? "available" : "unavailable",
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        warnings: rangeWarnings(state, args, range),
      }),
      range: { from: args.from, to: args.to },
      granularity: args.granularity,
      metrics,
      series,
    };
  },
});

function milestoneSeries(rows: SeriesSource[], granularity: "day" | "week" | "month") {
  return groupedSources(rows, granularity).map(([date, bucket]): AnalyticsMilestonePointDto => {
    const latest = bucket.at(-1);
    if (!latest) throw new Error("Analytics milestone bucket is empty");
    return {
      date,
      counts: latest.milestoneCounts,
      rates: milestoneRates(latest.milestoneCounts, latest.counts.kpiEligibleShopCount),
      completeness: combineCompleteness(bucket.map((row) => row.completeness)),
      computedAt: Math.max(...bucket.map((row) => row.computedAt)),
    };
  });
}

function milestoneRates(
  counts: SeriesSource["milestoneCounts"],
  eligibleShopCount: number,
): AnalyticsMilestoneRatesDto {
  const registeredReach = toRateDto({ numerator: counts.registered, denominator: eligibleShopCount });
  return {
    registered: {
      reach: registeredReach,
      previousStepConversion: registeredReach,
    },
    firstRecruitment: {
      reach: toRateDto({ numerator: counts.firstRecruitment, denominator: eligibleShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstRecruitment, denominator: counts.registered }),
    },
    firstSubmission: {
      reach: toRateDto({ numerator: counts.firstSubmission, denominator: eligibleShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstSubmission, denominator: counts.firstRecruitment }),
    },
    firstConfirmed: {
      reach: toRateDto({ numerator: counts.firstConfirmed, denominator: eligibleShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstConfirmed, denominator: counts.firstSubmission }),
    },
    secondConfirmed: {
      reach: toRateDto({ numerator: counts.secondConfirmed, denominator: eligibleShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.secondConfirmed, denominator: counts.firstConfirmed }),
    },
  };
}

function healthSeries(rows: SeriesSource[], granularity: "day" | "week" | "month") {
  return groupedSources(rows, granularity).map(([date, bucket]): AnalyticsHealthPointDto => {
    const latest = bucket.at(-1);
    if (!latest) throw new Error("Analytics health bucket is empty");
    return {
      date,
      counts: latest.healthSignalCounts,
      completeness: combineCompleteness(bucket.map((row) => row.completeness)),
      computedAt: Math.max(...bucket.map((row) => row.computedAt)),
    };
  });
}

export const getMilestones = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    granularity: granularityArg,
    organizationId: nullableStringArg,
    shopId: nullableStringArg,
  },
  returns: v.union(milestonesResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, {
      detailRetention: args.organizationId !== null || args.shopId !== null,
    });
    const canRead = state.availability === "available" && range.effectiveTo !== null;
    const rows = canRead ? await getScopedSeries(ctx, { ...args, range }) : [];
    if (rows === null) return null;
    const incompleteBuckets = missingBuckets(range, args.granularity);
    const series = requireSeriesWithinPointLimit(
      milestoneSeries(rows, args.granularity).filter((point) => !incompleteBuckets.has(point.date)),
    );
    return {
      kind: "milestones" as const,
      metadata: responseMetadata({
        state,
        availability: canRead ? "available" : "unavailable",
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        warnings: rangeWarnings(state, args, range),
      }),
      range: { from: args.from, to: args.to },
      granularity: args.granularity,
      current: series.at(-1)?.counts ?? null,
      currentRates: series.at(-1)?.rates ?? null,
      series,
    };
  },
});

export const getHealth = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    granularity: granularityArg,
    organizationId: nullableStringArg,
    shopId: nullableStringArg,
  },
  returns: v.union(healthResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, {
      detailRetention: args.organizationId !== null || args.shopId !== null,
    });
    const canRead = state.availability === "available" && range.effectiveTo !== null;
    const rows = canRead ? await getScopedSeries(ctx, { ...args, range }) : [];
    if (rows === null) return null;
    const incompleteBuckets = missingBuckets(range, args.granularity);
    const series = requireSeriesWithinPointLimit(
      healthSeries(rows, args.granularity).filter((point) => !incompleteBuckets.has(point.date)),
    );
    return {
      kind: "health" as const,
      metadata: responseMetadata({
        state,
        availability: canRead ? "available" : "unavailable",
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        warnings: rangeWarnings(state, args, range),
      }),
      range: { from: args.from, to: args.to },
      granularity: args.granularity,
      current: series.at(-1)?.counts ?? null,
      series,
    };
  },
});

function paginationOptions(cursor: string | null, limit: number) {
  return {
    cursor,
    numItems: limit,
    maximumRowsRead: Math.min(limit, ANALYTICS_DASHBOARD_MAX_SCAN_ROWS),
    maximumBytesRead: PAGINATION_MAX_BYTES,
  };
}

async function organizationPage(
  ctx: QueryCtx,
  args: {
    cursor: string | null;
    limit: number;
    sort: "registeredAt" | "currentPlan";
    direction: "asc" | "desc";
    plan: "trial" | "free" | "pro" | "business" | null;
  },
) {
  const options = paginationOptions(args.cursor, args.limit);
  if (args.sort === "currentPlan") {
    return await ctx.db
      .query("analyticsOrganizations")
      .withIndex("by_deletedAt_and_currentPlan_and_registeredAt", (q) => {
        const active = q.eq("deletedAt", undefined);
        return args.plan ? active.eq("currentPlan", args.plan) : active;
      })
      .order(args.direction)
      .paginate(options);
  }
  return await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_deletedAt_and_registeredAt", (q) => q.eq("deletedAt", undefined))
    .order(args.direction)
    .paginate(options);
}

export const getOrganizations = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    cursor: nullableStringArg,
    limit: v.number(),
    sort: v.union(v.literal("registeredAt"), v.literal("currentPlan")),
    direction: directionArg,
    plan: v.union(planArg, v.null()),
    completeness: nullableCompletenessArg,
  },
  returns: organizationsResponseValidator,
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, { detailRetention: true });
    const latestRun = range.latestCompleteRun;
    if (state.availability === "unavailable" || !latestRun) {
      return {
        kind: "organizations" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          warnings: rangeWarnings(state, args, range),
        }),
        rows: [],
      };
    }
    const page = await organizationPage(ctx, args);
    const dimensionRows = page.page.filter((organization) => !args.plan || organization.currentPlan === args.plan);
    const mapped = await Promise.all(
      dimensionRows.map(async (organization) => {
        const kpi = await getLatestOrganizationKpi(ctx, latestRun, organization.organizationId);
        return toOrganizationRowDto(organization, kpi ? toOrganizationKpiDto(kpi) : null, latestRun.dataStartAt);
      }),
    );
    const rows = mapped.filter((row) => !args.completeness || row.kpis?.completeness === args.completeness);
    const filteredInMemory = (args.sort !== "currentPlan" && args.plan !== null) || args.completeness !== null;
    return {
      kind: "organizations" as const,
      metadata: responseMetadata({
        state,
        computedAt: maxComputedAt(rows),
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        warnings: [...rangeWarnings(state, args, range), ...filteredPageWarnings(page, filteredInMemory)],
      }),
      rows,
    };
  },
});

function rollupOrganizationSeries(
  rows: Doc<"analyticsDailyOrganizationKpis">[],
  granularity: "day" | "week" | "month",
) {
  const buckets = new Map<string, Doc<"analyticsDailyOrganizationKpis">[]>();
  for (const row of rows) {
    const key = bucketDate(row.snapshotDate, granularity);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]): AnalyticsOrganizationKpiDto => {
      const first = bucket[0];
      const latest = bucket.at(-1);
      if (!first || !latest) throw new Error("Analytics organization bucket is empty");
      const sources = bucket.map(organizationSource);
      return {
        ...toOrganizationKpiDto(latest),
        snapshotDate: date,
        rateRange: { from: first.snapshotDate, to: latest.snapshotDate },
        northStar: toRateDto(summedPair(sources, (row) => row.northStar)),
        deadlineSubmission: toRateDto(summedPair(sources, (row) => row.deadlineSubmission)),
        finalSubmission: toRateDto(summedPair(sources, (row) => row.finalSubmission)),
        completeness: combineCompleteness(bucket.map((row) => row.completeness)),
        computedAt: Math.max(...bucket.map((row) => row.computedAt)),
      };
    });
}

async function organizationShopPage(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cursor: string | null,
  limit: number,
) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_organizationId_and_deletedAt_and_registeredAt", (q) =>
      q.eq("organizationId", organizationId).eq("deletedAt", undefined),
    )
    .paginate(paginationOptions(cursor, limit));
}

export const getOrganization = internalQuery({
  args: {
    organizationId: v.string(),
    from: v.string(),
    to: v.string(),
    granularity: granularityArg,
    cursor: nullableStringArg,
    limit: v.number(),
  },
  returns: v.union(organizationDetailResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, { detailRetention: true });
    const latestRun = range.latestCompleteRun;
    const organizationId = ctx.db.normalizeId("organizations", args.organizationId);
    if (!organizationId) return null;
    if (state.availability === "unavailable" || !latestRun) {
      return {
        kind: "organization" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          warnings: rangeWarnings(state, args, range),
        }),
        organization: null,
        series: [],
        shops: [],
      };
    }
    const organization = await getOrganizationDimension(ctx, organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const seriesFrom = range.effectiveFrom;
    const seriesTo = range.effectiveTo;
    const seriesDocs =
      seriesFrom && seriesTo
        ? await ctx.db
            .query("analyticsDailyOrganizationKpis")
            .withIndex("by_organizationId_and_snapshotDate", (q) =>
              q.eq("organizationId", organizationId).gte("snapshotDate", seriesFrom).lte("snapshotDate", seriesTo),
            )
            .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1)
        : [];
    const visibleSeriesDocs = seriesDocs.filter((row) => rowBelongsToCompleteRun(row, range));
    const incompleteBuckets = missingBuckets(range, args.granularity);
    const series = requireSeriesWithinPointLimit(
      rollupOrganizationSeries(visibleSeriesDocs, args.granularity).filter(
        (point) => !incompleteBuckets.has(point.snapshotDate),
      ),
    );
    const currentKpi = await getLatestOrganizationKpi(ctx, latestRun, organizationId);
    const shopsPage = await organizationShopPage(ctx, organizationId, args.cursor, args.limit);
    const shops = await Promise.all(
      shopsPage.page.map(async (shop) => {
        const kpi = await getLatestShopKpi(ctx, latestRun, shop.shopId);
        return toShopRowDto(shop, organization.displayName, kpi ? toShopKpiDto(kpi) : null);
      }),
    );
    const current = currentKpi ? toOrganizationKpiDto(currentKpi) : null;
    return {
      kind: "organization" as const,
      metadata: responseMetadata({
        state,
        computedAt: maxOrNull([
          ...series.map((row) => row.computedAt),
          ...shops.flatMap((row) => (row.kpis ? [row.kpis.computedAt] : [])),
        ]),
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: shopsPage.continueCursor,
          isDone: shopsPage.isDone,
          pageSize: args.limit,
          returnedCount: shops.length,
        }),
        warnings: [...rangeWarnings(state, args, range), ...pageWarnings(shopsPage)],
      }),
      organization: toOrganizationRowDto(organization, current, latestRun.dataStartAt),
      series,
      shops,
    };
  },
});

function shopSizeMatches(value: number, filter: "1-4" | "5-9" | "10-19" | "20-49" | "50+") {
  if (filter === "1-4") return value >= 1 && value <= 4;
  if (filter === "5-9") return value >= 5 && value <= 9;
  if (filter === "10-19") return value >= 10 && value <= 19;
  if (filter === "20-49") return value >= 20 && value <= 49;
  return value >= 50;
}

function cadenceMatches(
  kpi: AnalyticsShopKpiDto,
  filter: "weekly" | "biweekly" | "monthly" | "other" | "insufficientData",
) {
  if (filter === "insufficientData") return kpi.cadence.confidence === "insufficientData";
  const days = kpi.cadence.estimatedDays;
  if (days === null) return false;
  if (filter === "weekly") return days <= 9;
  if (filter === "biweekly") return days > 9 && days <= 18;
  if (filter === "monthly") return days > 18 && days <= 40;
  return days > 40;
}

function lineUsageMatches(kpi: AnalyticsShopKpiDto, filter: "none" | "low" | "medium" | "high") {
  const rate = kpi.lineLinkedRate;
  if (filter === "none") return rate === 0;
  if (rate === null) return false;
  if (filter === "low") return rate > 0 && rate < 0.5;
  if (filter === "medium") return rate >= 0.5 && rate < 0.8;
  return rate >= 0.8;
}

function shopRowMatches(
  row: AnalyticsShopRowDto,
  args: {
    shopSize: "1-4" | "5-9" | "10-19" | "20-49" | "50+" | null;
    cohort: string | null;
    cadence: "weekly" | "biweekly" | "monthly" | "other" | "insufficientData" | null;
    lineUsage: "none" | "low" | "medium" | "high" | null;
    health:
      | "hasUpcomingCycle"
      | "nextCycleMissing"
      | "cadenceDelayed"
      | "notificationFailure"
      | "submissionDrop"
      | "confirmationDelay"
      | "longInactive"
      | "insufficientData"
      | "needsAttention"
      | null;
    completeness: AnalyticsCompleteness | null;
  },
) {
  if (args.cohort && monthJST(row.registeredAt) !== args.cohort) return false;
  const kpi = row.kpis;
  if (!kpi) return !args.shopSize && !args.cadence && !args.lineUsage && !args.health && !args.completeness;
  if (args.shopSize && !shopSizeMatches(kpi.staffMembershipCount, args.shopSize)) return false;
  if (args.cadence && !cadenceMatches(kpi, args.cadence)) return false;
  if (args.lineUsage && !lineUsageMatches(kpi, args.lineUsage)) return false;
  if (args.completeness && kpi.completeness !== args.completeness) return false;
  if (args.health === "needsAttention" && kpi.issueHealthSignalCount === 0) return false;
  if (
    args.health &&
    args.health !== "needsAttention" &&
    !kpi.healthSignals.some((item) => item.signal === args.health)
  ) {
    return false;
  }
  return true;
}

type ShopListRowWithUsageComputedAt = {
  row: AnalyticsShopListRowDto;
  usageComputedAt: number | null;
};

async function shopPage(
  ctx: QueryCtx,
  args: {
    cursor: string | null;
    limit: number;
    sort: "registeredAt" | "currentPlan" | "latestActivityAt";
    direction: "asc" | "desc";
    organizationId: Id<"organizations"> | null;
    plan: "trial" | "free" | "pro" | "business" | null;
  },
) {
  const options = paginationOptions(args.cursor, args.limit);
  if (args.sort === "currentPlan") {
    if (args.organizationId) {
      const organizationId = args.organizationId;
      return await ctx.db
        .query("analyticsShops")
        .withIndex("by_organizationId_and_deletedAt_and_currentPlan_and_registeredAt", (q) => {
          const active = q.eq("organizationId", organizationId).eq("deletedAt", undefined);
          return args.plan ? active.eq("currentPlan", args.plan) : active;
        })
        .order(args.direction)
        .paginate(options);
    }
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_deletedAt_and_currentPlan_and_registeredAt", (q) => {
        const active = q.eq("deletedAt", undefined);
        return args.plan ? active.eq("currentPlan", args.plan) : active;
      })
      .order(args.direction)
      .paginate(options);
  }
  if (args.sort === "latestActivityAt") {
    if (args.organizationId) {
      const organizationId = args.organizationId;
      return await ctx.db
        .query("analyticsShops")
        .withIndex("by_organizationId_deletedAt_latestActivityAt_registeredAt", (q) =>
          q.eq("organizationId", organizationId).eq("deletedAt", undefined),
        )
        .order(args.direction)
        .paginate(options);
    }
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_deletedAt_and_latestActivityAt_and_registeredAt", (q) => q.eq("deletedAt", undefined))
      .order(args.direction)
      .paginate(options);
  }
  if (args.organizationId) {
    const organizationId = args.organizationId;
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_organizationId_and_deletedAt_and_registeredAt", (q) =>
        q.eq("organizationId", organizationId).eq("deletedAt", undefined),
      )
      .order(args.direction)
      .paginate(options);
  }
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_deletedAt_and_registeredAt", (q) => q.eq("deletedAt", undefined))
    .order(args.direction)
    .paginate(options);
}

export const getShops = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    cursor: nullableStringArg,
    limit: v.number(),
    sort: v.union(v.literal("registeredAt"), v.literal("currentPlan"), v.literal("latestActivityAt")),
    direction: directionArg,
    organizationId: nullableStringArg,
    plan: v.union(planArg, v.null()),
    shopSize: v.union(
      v.literal("1-4"),
      v.literal("5-9"),
      v.literal("10-19"),
      v.literal("20-49"),
      v.literal("50+"),
      v.null(),
    ),
    cohort: nullableStringArg,
    cadence: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("other"),
      v.literal("insufficientData"),
      v.null(),
    ),
    lineUsage: v.union(v.literal("none"), v.literal("low"), v.literal("medium"), v.literal("high"), v.null()),
    health: v.union(
      v.literal("hasUpcomingCycle"),
      v.literal("nextCycleMissing"),
      v.literal("cadenceDelayed"),
      v.literal("notificationFailure"),
      v.literal("submissionDrop"),
      v.literal("confirmationDelay"),
      v.literal("longInactive"),
      v.literal("insufficientData"),
      v.literal("needsAttention"),
      v.null(),
    ),
    usage: v.union(v.literal("candidate"), v.literal("high"), v.literal("possible"), v.literal("unknown"), v.null()),
    completeness: nullableCompletenessArg,
  },
  returns: v.union(shopsResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, { detailRetention: true });
    const displayRun = range.latestCompleteRun;
    const usageRun = state.latestCompleteRun;
    if (state.availability === "unavailable" || !displayRun || !usageRun) {
      return {
        kind: "shops" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          warnings: rangeWarnings(state, args, range),
        }),
        rows: [],
      };
    }
    const organizationId = args.organizationId ? ctx.db.normalizeId("organizations", args.organizationId) : null;
    if (args.organizationId && !organizationId) return null;
    if (organizationId) {
      const organization = await getOrganizationDimension(ctx, organizationId);
      if (!organization || organization.deletedAt !== undefined) return null;
    }
    const page = await shopPage(ctx, { ...args, organizationId });
    const organizations = new Map<Id<"organizations">, ReturnType<typeof getOrganizationDimension>>();
    const getOrganization = (id: Id<"organizations">) => {
      const existing = organizations.get(id);
      if (existing) return existing;
      const promise = getOrganizationDimension(ctx, id);
      organizations.set(id, promise);
      return promise;
    };
    const dimensionRows = page.page.filter(
      (shop) =>
        (!args.plan || shop.currentPlan === args.plan) && (!args.cohort || monthJST(shop.registeredAt) === args.cohort),
    );
    const mapped = await Promise.all(
      dimensionRows.map(async (shop) => {
        const displayKpiPromise = getLatestShopKpi(ctx, displayRun, shop.shopId);
        const usageKpiPromise =
          displayRun._id === usageRun._id ? displayKpiPromise : getLatestShopKpi(ctx, usageRun, shop.shopId);
        const [organization, displayKpiDoc, usageKpiDoc] = await Promise.all([
          getOrganization(shop.organizationId),
          displayKpiPromise,
          usageKpiPromise,
        ]);
        if (!organization || organization.deletedAt !== undefined) return null;
        const displayKpis = displayKpiDoc ? toShopKpiDto(displayKpiDoc) : null;
        const usageKpis =
          displayRun._id === usageRun._id ? displayKpis : usageKpiDoc ? toShopKpiDto(usageKpiDoc) : null;
        const row: AnalyticsShopListRowDto = {
          ...toShopRowDto(shop, organization.displayName, displayKpis),
          ...classifyShopUsage({
            cutoffAt: usageRun.cutoffAt,
            latestActivityAt: shop.latestActivityAt ?? null,
            kpis: usageKpis,
          }),
        };
        return { row, usageComputedAt: usageKpis?.computedAt ?? null } satisfies ShopListRowWithUsageComputedAt;
      }),
    );
    const matched = mapped
      .filter((item): item is ShopListRowWithUsageComputedAt => item !== null)
      .filter((item) => shopRowMatches(item.row, args) && usageMatches(item.row.usageLikelihood, args.usage));
    const rows = matched.map((item) => item.row);
    const filteredInMemory =
      (args.sort !== "currentPlan" && args.plan !== null) ||
      args.cohort !== null ||
      args.shopSize !== null ||
      args.cadence !== null ||
      args.lineUsage !== null ||
      args.health !== null ||
      args.usage !== null ||
      args.completeness !== null ||
      mapped.some((item) => item === null);
    return {
      kind: "shops" as const,
      metadata: responseMetadata({
        state,
        computedAt: maxOrNull(
          matched.flatMap((item) => [
            ...(item.row.kpis ? [item.row.kpis.computedAt] : []),
            ...(item.usageComputedAt === null ? [] : [item.usageComputedAt]),
          ]),
        ),
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        warnings: [...rangeWarnings(state, args, range), ...filteredPageWarnings(page, filteredInMemory)],
      }),
      rows,
    };
  },
});

function rollupShopSeries(rows: Doc<"analyticsDailyShopKpis">[], granularity: "day" | "week" | "month") {
  const buckets = new Map<string, Doc<"analyticsDailyShopKpis">[]>();
  for (const row of rows) {
    const key = bucketDate(row.snapshotDate, granularity);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]): AnalyticsShopKpiDto => {
      const first = bucket[0];
      const latest = bucket.at(-1);
      if (!first || !latest) throw new Error("Analytics shop bucket is empty");
      const sources = bucket.map(shopSource);
      return {
        ...toShopKpiDto(latest),
        snapshotDate: date,
        rateRange: { from: first.snapshotDate, to: latest.snapshotDate },
        northStar: toRateDto(summedPair(sources, (row) => row.northStar)),
        deadlineSubmission: toRateDto(summedPair(sources, (row) => row.deadlineSubmission)),
        finalSubmission: toRateDto(summedPair(sources, (row) => row.finalSubmission)),
        completeness: combineCompleteness(bucket.map((row) => row.completeness)),
        computedAt: Math.max(...bucket.map((row) => row.computedAt)),
      };
    });
}

export const getShop = internalQuery({
  args: { shopId: v.string(), from: v.string(), to: v.string(), granularity: granularityArg },
  returns: v.union(shopDetailResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, { detailRetention: true });
    const latestRun = range.latestCompleteRun;
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    if (state.availability === "unavailable" || !latestRun) {
      return {
        kind: "shop" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: singletonPageInfo(0),
          warnings: rangeWarnings(state, args, range),
        }),
        shop: null,
        series: [],
      };
    }
    const shop = await getShopDimension(ctx, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const seriesFrom = range.effectiveFrom;
    const seriesTo = range.effectiveTo;
    const seriesDocs =
      seriesFrom && seriesTo
        ? await ctx.db
            .query("analyticsDailyShopKpis")
            .withIndex("by_shopId_and_snapshotDate", (q) =>
              q.eq("shopId", shopId).gte("snapshotDate", seriesFrom).lte("snapshotDate", seriesTo),
            )
            .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1)
        : [];
    const visibleSeriesDocs = seriesDocs.filter((row) => rowBelongsToCompleteRun(row, range));
    const incompleteBuckets = missingBuckets(range, args.granularity);
    const series = requireSeriesWithinPointLimit(
      rollupShopSeries(visibleSeriesDocs, args.granularity).filter(
        (point) => !incompleteBuckets.has(point.snapshotDate),
      ),
    );
    const currentDoc = await getLatestShopKpi(ctx, latestRun, shopId);
    const current = currentDoc ? toShopKpiDto(currentDoc) : null;
    return {
      kind: "shop" as const,
      metadata: responseMetadata({
        state,
        computedAt: maxOrNull(series.map((row) => row.computedAt)),
        pageInfo: singletonPageInfo(series.length),
        warnings: rangeWarnings(state, args, range),
      }),
      shop: toShopRowDto(shop, organization.displayName, current),
      series,
    };
  },
});

export const getShopCycles = internalQuery({
  args: {
    shopId: v.string(),
    from: v.string(),
    to: v.string(),
    cursor: nullableStringArg,
    limit: v.number(),
    sort: v.literal("periodStart"),
    direction: directionArg,
    completeness: nullableCompletenessArg,
  },
  returns: v.union(shopCyclesResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args);
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    if (state.availability === "unavailable" || !state.latestCompleteRun) {
      return {
        kind: "shopCycles" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          warnings: rangeWarnings(state, args, range),
        }),
        shopId: args.shopId,
        rows: [],
      };
    }
    const shop = await getShopDimension(ctx, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const completenessFilter = args.completeness;
    const page = completenessFilter
      ? await ctx.db
          .query("analyticsShiftCycles")
          .withIndex("by_shopId_and_deletedAt_and_completeness_and_periodStart", (q) =>
            q
              .eq("shopId", shopId)
              .eq("deletedAt", undefined)
              .eq("completeness", completenessFilter)
              .gte("periodStart", args.from)
              .lte("periodStart", args.to),
          )
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit))
      : await ctx.db
          .query("analyticsShiftCycles")
          .withIndex("by_shopId_and_deletedAt_and_periodStart", (q) =>
            q.eq("shopId", shopId).eq("deletedAt", undefined).gte("periodStart", args.from).lte("periodStart", args.to),
          )
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit));
    const rows = page.page.map((cycle) => toCycleRowDto(cycle, organization.displayName, shop.displayName));
    return {
      kind: "shopCycles" as const,
      metadata: responseMetadata({
        state,
        computedAt: rows.length > 0 ? Math.max(...rows.map((row) => row.updatedAt)) : null,
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        warnings: [...rangeWarnings(state, args, range), ...pageWarnings(page)],
      }),
      shopId: args.shopId,
      rows,
    };
  },
});

export const getCycle = internalQuery({
  args: { shopId: v.string(), recruitmentId: v.string() },
  returns: v.union(cycleDetailResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    const recruitmentId = ctx.db.normalizeId("recruitments", args.recruitmentId);
    if (!shopId || !recruitmentId) return null;
    if (state.availability === "unavailable" || !state.latestCompleteRun) {
      return {
        kind: "cycle" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: singletonPageInfo(0),
        }),
        cycle: null,
      };
    }
    const cycle = await ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .unique();
    if (!cycle || cycle.shopId !== shopId || cycle.deletedAt !== undefined) return null;
    const [shop, organization] = await Promise.all([
      getShopDimension(ctx, cycle.shopId),
      getOrganizationDimension(ctx, cycle.organizationId),
    ]);
    if (!shop || !organization || shop.deletedAt !== undefined || organization.deletedAt !== undefined) return null;
    const row = toCycleRowDto(cycle, organization.displayName, shop.displayName);
    return {
      kind: "cycle" as const,
      metadata: responseMetadata({
        state,
        computedAt: row.updatedAt,
        pageInfo: singletonPageInfo(1),
      }),
      cycle: row,
    };
  },
});

export const getSegments = internalQuery({
  args: {
    from: v.string(),
    to: v.string(),
    cursor: nullableStringArg,
    limit: v.number(),
    sort: v.literal("dimension"),
    direction: directionArg,
    dimension: v.union(
      v.literal("registrationCohort"),
      v.literal("plan"),
      v.literal("organizationShopCount"),
      v.literal("shopStaffSize"),
      v.literal("cadence"),
      v.literal("lineUsage"),
      v.literal("submissionTrend"),
      v.literal("adoptionAge"),
      v.null(),
    ),
    completeness: nullableCompletenessArg,
  },
  returns: segmentsResponseValidator,
  handler: async (ctx, args) => {
    const state = await getAnalyticsReadState(ctx);
    const range = await getCompleteRunRange(ctx, state, args, { detailRetention: true });
    const latestRun = range.latestCompleteRun;
    if (state.availability === "unavailable" || !latestRun) {
      return {
        kind: "segments" as const,
        metadata: responseMetadata({
          state,
          availability: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          warnings: rangeWarnings(state, args, range),
        }),
        rows: [],
      };
    }
    const completenessFilter = args.completeness;
    const page = completenessFilter
      ? await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_snapshotDate_and_completeness_and_dimension_and_bucket", (q) => {
            const complete = q.eq("snapshotDate", latestRun.targetDate).eq("completeness", completenessFilter);
            return args.dimension ? complete.eq("dimension", args.dimension) : complete;
          })
          .filter((q) => q.eq(q.field("runId"), latestRun._id))
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit))
      : await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_snapshotDate_and_dimension_and_bucket", (q) =>
            args.dimension
              ? q.eq("snapshotDate", latestRun.targetDate).eq("dimension", args.dimension)
              : q.eq("snapshotDate", latestRun.targetDate),
          )
          .filter((q) => q.eq(q.field("runId"), latestRun._id))
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit));
    const rows: AnalyticsSegmentRowDto[] = page.page.map((row) => {
      if (row.kpiEligibleShopCount === undefined) throw new Error("analytics_segment_eligibility_missing");
      return {
        snapshotDate: row.snapshotDate,
        dimension: row.dimension,
        bucket: row.bucket,
        shopCount: row.shopCount,
        kpiEligibleShopCount: row.kpiEligibleShopCount,
        milestoneCounts: row.milestoneCounts,
        healthSignalCounts: row.healthSignalCounts,
        northStar: toRateDto(row.northStar),
        deadlineSubmission: toRateDto(row.deadlineSubmission),
        finalSubmission: toRateDto(row.finalSubmission),
        completeness: row.completeness,
        computedAt: row.computedAt,
      };
    });
    return {
      kind: "segments" as const,
      metadata: responseMetadata({
        state,
        computedAt: rows.length > 0 ? Math.max(...rows.map((row) => row.computedAt)) : null,
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        warnings: [...rangeWarnings(state, args, range), ...pageWarnings(page)],
      }),
      rows,
    };
  },
});

export const getFeatureRequests = internalQuery({
  args: { cursor: nullableStringArg, limit: v.number() },
  returns: featureRequestsResponseValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit, FEATURE_REQUEST_LIST_LIMIT);
    const page = await ctx.db.query("featureRequests").order("desc").paginate(paginationOptions(args.cursor, limit));
    const rows = await Promise.all(
      page.page.map(async (request) => {
        const shop = await ctx.db.get(request.shopId);
        return {
          id: request._id,
          shopId: request.shopId,
          shopName: !shop || shop.isDeleted ? "削除済み店舗" : shop.name,
          senderType: request.staffId === undefined ? ("manager" as const) : ("staff" as const),
          comment: request.comment,
          createdAt: request._creationTime,
        };
      }),
    );
    const requestsPageInfo = pageInfo({
      cursor: args.cursor,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      pageSize: limit,
      returnedCount: rows.length,
    });
    const computedAt = maxOrNull(rows.map((row) => row.createdAt));
    const metadata = {
      availability: "available" as const,
      asOf: computedAt,
      dataStartDate: null,
      latestCompleteSnapshotDate: null,
      computedAt,
      warnings: ["要望データはAnalytics pipelineとは独立した現在値です"],
      pageInfo: requestsPageInfo,
    };
    return {
      kind: "requests" as const,
      metadata,
      rows,
      pageInfo: requestsPageInfo,
    };
  },
});
