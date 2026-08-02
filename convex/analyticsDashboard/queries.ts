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
  AnalyticsShopRowDto,
  AnalyticsTrendMetric,
  AnalyticsTrendPointDto,
  AnalyticsTrendValueDto,
} from "./dto";
import {
  bucketDate,
  combineCompleteness,
  effectiveSnapshotDate,
  getLatestOrganizationKpi,
  getLatestShopKpi,
  getOrganizationDimension,
  getPipelineState,
  getShopDimension,
  pageInfo,
  responseMetadata,
  toCycleRowDto,
  toOrganizationKpiDto,
  toOrganizationRowDto,
  toRateDto,
  toShopKpiDto,
  toShopRowDto,
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

function completeWhenEmpty(rowCount: number, values: AnalyticsCompleteness[]) {
  return rowCount === 0 ? ("complete" as const) : combineCompleteness(values);
}

function missingDataWarnings(from: string, to: string, dataStartDate: string | undefined, latest: string | undefined) {
  const warnings: string[] = [];
  if (dataStartDate && from < dataStartDate) warnings.push("データ蓄積開始日より前の期間は値がありません");
  if (!latest || to > latest) warnings.push("指定期間の末日まで完全なsnapshotがありません");
  return warnings;
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const currentRows =
      generation && effectiveTo
        ? await getScopedSeries(ctx, { ...args, generation, to: effectiveTo })
        : ([] as SeriesSource[]);
    if (currentRows === null) return null;
    const effectiveCompareTo = args.compareTo ? effectiveSnapshotDate(state, args.compareTo) : null;
    const comparisonRows =
      generation && args.compareFrom && effectiveCompareTo
        ? await getScopedSeries(ctx, {
            generation,
            from: args.compareFrom,
            to: effectiveCompareTo,
            organizationId: args.organizationId,
            shopId: args.shopId,
          })
        : ([] as SeriesSource[]);
    if (comparisonRows === null) return null;
    const current = overviewSnapshot(currentRows);
    const comparison = overviewSnapshot(comparisonRows);
    const completeness = current
      ? combineCompleteness([current.completeness, ...(comparison ? [comparison.completeness] : [])])
      : "unavailable";
    return {
      kind: "overview" as const,
      metadata: responseMetadata({
        state,
        completeness,
        computedAt: maxOrNull([current?.computedAt, comparison?.computedAt].filter((value) => value !== undefined)),
        pageInfo: singletonPageInfo(current ? 1 : 0),
        ranges: [
          { from: args.from, to: args.to },
          ...(args.compareFrom && args.compareTo ? [{ from: args.compareFrom, to: args.compareTo }] : []),
        ],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
          ...(args.compareFrom && args.compareTo
            ? missingDataWarnings(
                args.compareFrom,
                args.compareTo,
                state?.dataStartDate,
                state?.latestCompleteSnapshotDate,
              )
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
  return {
    snapshotDate: doc.snapshotDate,
    counts: {
      organizationCount: 1,
      shopCount: 1,
      kpiEligibleShopCount: 1,
      activeShopCount: doc.hasRecentActivity ? 1 : 0,
      personCount: doc.uniquePersonCount,
      staffMembershipCount: doc.staffMembershipCount,
      unlinkedStaffCount: doc.unlinkedStaffCount,
      shiftTargetCount: doc.shiftTargetCount,
      managerMembershipCount: doc.managerMembershipCount,
      managerStaffCount: doc.managerStaffCount,
    },
    milestoneCounts: {
      registered: 1,
      firstRecruitment: doc.milestoneDates.firstRecruitmentAt === undefined ? 0 : 1,
      firstSubmission: doc.milestoneDates.firstSubmissionAt === undefined ? 0 : 1,
      firstConfirmed: doc.milestoneDates.firstConfirmedAt === undefined ? 0 : 1,
      secondConfirmed: doc.milestoneDates.secondConfirmedAt === undefined ? 0 : 1,
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
    generation: string;
    from: string;
    to: string;
    organizationId: string | null;
    shopId: string | null;
  },
): Promise<SeriesSource[] | null> {
  if (args.shopId) {
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    const shop = await getShopDimension(ctx, args.generation, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, args.generation, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const rows = await ctx.db
      .query("analyticsDailyShopKpis")
      .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
        q
          .eq("generation", args.generation)
          .eq("shopId", shopId)
          .gte("snapshotDate", args.from)
          .lte("snapshotDate", args.to),
      )
      .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
    return rows.map(shopSource);
  }
  if (args.organizationId) {
    const organizationId = ctx.db.normalizeId("organizations", args.organizationId);
    if (!organizationId) return null;
    const organization = await getOrganizationDimension(ctx, args.generation, organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const rows = await ctx.db
      .query("analyticsDailyOrganizationKpis")
      .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
        q
          .eq("generation", args.generation)
          .eq("organizationId", organizationId)
          .gte("snapshotDate", args.from)
          .lte("snapshotDate", args.to),
      )
      .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
    return rows.map(organizationSource);
  }
  const rows = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", args.generation).gte("snapshotDate", args.from).lte("snapshotDate", args.to),
    )
    .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1);
  return rows.map(serviceSource);
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const rows =
      generation && effectiveTo
        ? await getScopedSeries(ctx, { ...args, generation, to: effectiveTo })
        : ([] as SeriesSource[]);
    if (rows === null) return null;
    const metrics = args.metrics as AnalyticsTrendMetric[];
    const series = requireSeriesWithinPointLimit(
      groupedSources(rows, args.granularity).map(([date, bucket]) => trendPoint(date, bucket, metrics)),
    );
    return {
      kind: "trends" as const,
      metadata: responseMetadata({
        state,
        completeness: combineCompleteness(series.map((point) => point.completeness)),
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        ranges: [{ from: args.from, to: args.to }],
        warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
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
      rates: milestoneRates(latest.milestoneCounts, latest.counts.shopCount),
      completeness: combineCompleteness(bucket.map((row) => row.completeness)),
      computedAt: Math.max(...bucket.map((row) => row.computedAt)),
    };
  });
}

function milestoneRates(
  counts: SeriesSource["milestoneCounts"],
  registeredShopCount: number,
): AnalyticsMilestoneRatesDto {
  const registeredReach = toRateDto({ numerator: counts.registered, denominator: registeredShopCount });
  return {
    registered: {
      reach: registeredReach,
      previousStepConversion: registeredReach,
    },
    firstRecruitment: {
      reach: toRateDto({ numerator: counts.firstRecruitment, denominator: registeredShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstRecruitment, denominator: counts.registered }),
    },
    firstSubmission: {
      reach: toRateDto({ numerator: counts.firstSubmission, denominator: registeredShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstSubmission, denominator: counts.firstRecruitment }),
    },
    firstConfirmed: {
      reach: toRateDto({ numerator: counts.firstConfirmed, denominator: registeredShopCount }),
      previousStepConversion: toRateDto({ numerator: counts.firstConfirmed, denominator: counts.firstSubmission }),
    },
    secondConfirmed: {
      reach: toRateDto({ numerator: counts.secondConfirmed, denominator: registeredShopCount }),
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const rows = generation && effectiveTo ? await getScopedSeries(ctx, { ...args, generation, to: effectiveTo }) : [];
    if (rows === null) return null;
    const series = requireSeriesWithinPointLimit(milestoneSeries(rows, args.granularity));
    return {
      kind: "milestones" as const,
      metadata: responseMetadata({
        state,
        completeness: combineCompleteness(series.map((point) => point.completeness)),
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        ranges: [{ from: args.from, to: args.to }],
        warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const rows = generation && effectiveTo ? await getScopedSeries(ctx, { ...args, generation, to: effectiveTo }) : [];
    if (rows === null) return null;
    const series = requireSeriesWithinPointLimit(healthSeries(rows, args.granularity));
    return {
      kind: "health" as const,
      metadata: responseMetadata({
        state,
        completeness: combineCompleteness(series.map((point) => point.completeness)),
        computedAt: series.length > 0 ? Math.max(...series.map((point) => point.computedAt)) : null,
        pageInfo: singletonPageInfo(series.length),
        ranges: [{ from: args.from, to: args.to }],
        warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
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
    generation: string;
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
      .withIndex("by_generation_and_deletedAt_and_currentPlan_and_registeredAt", (q) => {
        const active = q.eq("generation", args.generation).eq("deletedAt", undefined);
        return args.plan ? active.eq("currentPlan", args.plan) : active;
      })
      .order(args.direction)
      .paginate(options);
  }
  return await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_deletedAt_and_registeredAt", (q) =>
      q.eq("generation", args.generation).eq("deletedAt", undefined),
    )
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    if (!generation || !effectiveTo) {
      return {
        kind: "organizations" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        rows: [],
      };
    }
    const page = await organizationPage(ctx, { ...args, generation });
    const dimensionRows = page.page.filter((organization) => !args.plan || organization.currentPlan === args.plan);
    const mapped = await Promise.all(
      dimensionRows.map(async (organization) => {
        const kpi = await getLatestOrganizationKpi(ctx, generation, organization.organizationId, effectiveTo);
        return toOrganizationRowDto(organization, kpi ? toOrganizationKpiDto(kpi) : null);
      }),
    );
    const rows = mapped.filter((row) => !args.completeness || row.kpis?.completeness === args.completeness);
    const filteredInMemory = (args.sort !== "currentPlan" && args.plan !== null) || args.completeness !== null;
    const completeness = completeWhenEmpty(
      rows.length,
      rows.flatMap((row) => (row.kpis ? [row.kpis.completeness] : [])),
    );
    return {
      kind: "organizations" as const,
      metadata: responseMetadata({
        state,
        completeness,
        computedAt: maxComputedAt(rows),
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        ranges: [{ from: args.from, to: args.to }],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
          ...filteredPageWarnings(page, filteredInMemory),
        ],
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
  generation: string,
  organizationId: Id<"organizations">,
  cursor: string | null,
  limit: number,
) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_organizationId_and_deletedAt_and_registeredAt", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId).eq("deletedAt", undefined),
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const organizationId = ctx.db.normalizeId("organizations", args.organizationId);
    if (!organizationId) return null;
    if (!generation) {
      return {
        kind: "organization" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        organization: null,
        series: [],
        shops: [],
      };
    }
    const organization = await getOrganizationDimension(ctx, generation, organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const seriesDocs = effectiveTo
      ? await ctx.db
          .query("analyticsDailyOrganizationKpis")
          .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
            q
              .eq("generation", generation)
              .eq("organizationId", organizationId)
              .gte("snapshotDate", args.from)
              .lte("snapshotDate", effectiveTo),
          )
          .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1)
      : [];
    const series = requireSeriesWithinPointLimit(rollupOrganizationSeries(seriesDocs, args.granularity));
    const currentKpi = seriesDocs.at(-1);
    const shopsPage = await organizationShopPage(ctx, generation, organizationId, args.cursor, args.limit);
    const shops = await Promise.all(
      shopsPage.page.map(async (shop) => {
        const kpi = effectiveTo ? await getLatestShopKpi(ctx, generation, shop.shopId, effectiveTo) : null;
        return toShopRowDto(shop, organization.displayName, kpi ? toShopKpiDto(kpi) : null);
      }),
    );
    const current = currentKpi ? toOrganizationKpiDto(currentKpi) : null;
    const completenessValues = [
      ...series.map((row) => row.completeness),
      ...shops.flatMap((row) => (row.kpis ? [row.kpis.completeness] : [])),
    ];
    const completeness = series.length === 0 ? "unavailable" : combineCompleteness(completenessValues);
    return {
      kind: "organization" as const,
      metadata: responseMetadata({
        state,
        completeness,
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
        ranges: [{ from: args.from, to: args.to }],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
          ...pageWarnings(shopsPage),
        ],
      }),
      organization: toOrganizationRowDto(organization, current),
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

async function shopPage(
  ctx: QueryCtx,
  args: {
    generation: string;
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
        .withIndex("by_gen_org_deleted_plan_registered", (q) => {
          const active = q
            .eq("generation", args.generation)
            .eq("organizationId", organizationId)
            .eq("deletedAt", undefined);
          return args.plan ? active.eq("currentPlan", args.plan) : active;
        })
        .order(args.direction)
        .paginate(options);
    }
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_generation_and_deletedAt_and_currentPlan_and_registeredAt", (q) => {
        const active = q.eq("generation", args.generation).eq("deletedAt", undefined);
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
        .withIndex("by_gen_org_deleted_activity_registered", (q) =>
          q.eq("generation", args.generation).eq("organizationId", organizationId).eq("deletedAt", undefined),
        )
        .order(args.direction)
        .paginate(options);
    }
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_gen_deleted_activity_registered", (q) =>
        q.eq("generation", args.generation).eq("deletedAt", undefined),
      )
      .order(args.direction)
      .paginate(options);
  }
  if (args.organizationId) {
    const organizationId = args.organizationId;
    return await ctx.db
      .query("analyticsShops")
      .withIndex("by_generation_and_organizationId_and_deletedAt_and_registeredAt", (q) =>
        q.eq("generation", args.generation).eq("organizationId", organizationId).eq("deletedAt", undefined),
      )
      .order(args.direction)
      .paginate(options);
  }
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_deletedAt_and_registeredAt", (q) =>
      q.eq("generation", args.generation).eq("deletedAt", undefined),
    )
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
    completeness: nullableCompletenessArg,
  },
  returns: v.union(shopsResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    if (!generation || !effectiveTo) {
      return {
        kind: "shops" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        rows: [],
      };
    }
    const organizationId = args.organizationId ? ctx.db.normalizeId("organizations", args.organizationId) : null;
    if (args.organizationId && !organizationId) return null;
    if (organizationId) {
      const organization = await getOrganizationDimension(ctx, generation, organizationId);
      if (!organization || organization.deletedAt !== undefined) return null;
    }
    const page = await shopPage(ctx, { ...args, generation, organizationId });
    const organizations = new Map<Id<"organizations">, ReturnType<typeof getOrganizationDimension>>();
    const getOrganization = (id: Id<"organizations">) => {
      const existing = organizations.get(id);
      if (existing) return existing;
      const promise = getOrganizationDimension(ctx, generation, id);
      organizations.set(id, promise);
      return promise;
    };
    const dimensionRows = page.page.filter(
      (shop) =>
        (!args.plan || shop.currentPlan === args.plan) && (!args.cohort || monthJST(shop.registeredAt) === args.cohort),
    );
    const mapped = await Promise.all(
      dimensionRows.map(async (shop) => {
        const [organization, kpi] = await Promise.all([
          getOrganization(shop.organizationId),
          getLatestShopKpi(ctx, generation, shop.shopId, effectiveTo),
        ]);
        if (!organization || organization.deletedAt !== undefined) return null;
        return toShopRowDto(shop, organization.displayName, kpi ? toShopKpiDto(kpi) : null);
      }),
    );
    const rows = mapped
      .filter((row): row is AnalyticsShopRowDto => row !== null)
      .filter((row) => shopRowMatches(row, args));
    const filteredInMemory =
      (args.sort !== "currentPlan" && args.plan !== null) ||
      args.cohort !== null ||
      args.shopSize !== null ||
      args.cadence !== null ||
      args.lineUsage !== null ||
      args.health !== null ||
      args.completeness !== null ||
      mapped.some((row) => row === null);
    const completeness = completeWhenEmpty(
      rows.length,
      rows.flatMap((row) => (row.kpis ? [row.kpis.completeness] : [])),
    );
    return {
      kind: "shops" as const,
      metadata: responseMetadata({
        state,
        completeness,
        computedAt: maxComputedAt(rows),
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        ranges: [{ from: args.from, to: args.to }],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
          ...filteredPageWarnings(page, filteredInMemory),
        ],
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    if (!generation) {
      return {
        kind: "shop" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: singletonPageInfo(0),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        shop: null,
        series: [],
      };
    }
    const shop = await getShopDimension(ctx, generation, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, generation, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    const seriesDocs = effectiveTo
      ? await ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
            q
              .eq("generation", generation)
              .eq("shopId", shopId)
              .gte("snapshotDate", args.from)
              .lte("snapshotDate", effectiveTo),
          )
          .take(ANALYTICS_DASHBOARD_MAX_RANGE_DAYS + 1)
      : [];
    const series = requireSeriesWithinPointLimit(rollupShopSeries(seriesDocs, args.granularity));
    const currentDoc = seriesDocs.at(-1);
    const current = currentDoc ? toShopKpiDto(currentDoc) : null;
    return {
      kind: "shop" as const,
      metadata: responseMetadata({
        state,
        completeness: series.length === 0 ? "unavailable" : combineCompleteness(series.map((row) => row.completeness)),
        computedAt: maxOrNull(series.map((row) => row.computedAt)),
        pageInfo: singletonPageInfo(series.length),
        ranges: [{ from: args.from, to: args.to }],
        warnings: missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    if (!shopId) return null;
    if (!generation) {
      return {
        kind: "shopCycles" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        shopId: args.shopId,
        rows: [],
      };
    }
    const shop = await getShopDimension(ctx, generation, shopId);
    if (!shop || shop.deletedAt !== undefined) return null;
    const organization = await getOrganizationDimension(ctx, generation, shop.organizationId);
    if (!organization || organization.deletedAt !== undefined) return null;
    const completenessFilter = args.completeness;
    const page = completenessFilter
      ? await ctx.db
          .query("analyticsShiftCycles")
          .withIndex("by_gen_shop_deleted_complete_period", (q) =>
            q
              .eq("generation", generation)
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
          .withIndex("by_generation_and_shopId_and_deletedAt_and_periodStart", (q) =>
            q
              .eq("generation", generation)
              .eq("shopId", shopId)
              .eq("deletedAt", undefined)
              .gte("periodStart", args.from)
              .lte("periodStart", args.to),
          )
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit));
    const rows = page.page.map((cycle) => toCycleRowDto(cycle, organization.displayName, shop.displayName));
    const completeness = completeWhenEmpty(
      rows.length,
      rows.map((row) => row.completeness),
    );
    return {
      kind: "shopCycles" as const,
      metadata: responseMetadata({
        state,
        completeness,
        computedAt: rows.length > 0 ? Math.max(...rows.map((row) => row.updatedAt)) : null,
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        ranges: [{ from: args.from, to: args.to }],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
          ...pageWarnings(page),
        ],
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    const recruitmentId = ctx.db.normalizeId("recruitments", args.recruitmentId);
    if (!shopId || !recruitmentId) return null;
    if (!generation) {
      return {
        kind: "cycle" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: singletonPageInfo(0),
        }),
        cycle: null,
      };
    }
    const cycle = await ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_generation_and_recruitmentId", (q) =>
        q.eq("generation", generation).eq("recruitmentId", recruitmentId),
      )
      .unique();
    if (!cycle || cycle.shopId !== shopId || cycle.deletedAt !== undefined) return null;
    const [shop, organization] = await Promise.all([
      getShopDimension(ctx, generation, cycle.shopId),
      getOrganizationDimension(ctx, generation, cycle.organizationId),
    ]);
    if (!shop || !organization || shop.deletedAt !== undefined || organization.deletedAt !== undefined) return null;
    const row = toCycleRowDto(cycle, organization.displayName, shop.displayName);
    return {
      kind: "cycle" as const,
      metadata: responseMetadata({
        state,
        completeness: row.completeness,
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
    const state = await getPipelineState(ctx);
    const generation = state?.activeGeneration;
    const effectiveTo = effectiveSnapshotDate(state, args.to);
    if (!generation || !effectiveTo) {
      return {
        kind: "segments" as const,
        metadata: responseMetadata({
          state,
          completeness: "unavailable",
          computedAt: null,
          pageInfo: pageInfo({ cursor: args.cursor, pageSize: args.limit, returnedCount: 0 }),
          ranges: [{ from: args.from, to: args.to }],
          warnings: missingDataWarnings(args.from, args.to, state?.dataStartDate, state?.latestCompleteSnapshotDate),
        }),
        rows: [],
      };
    }
    const completenessFilter = args.completeness;
    const page = completenessFilter
      ? await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_gen_date_complete_dimension_bucket", (q) => {
            const complete = q
              .eq("generation", generation)
              .eq("snapshotDate", effectiveTo)
              .eq("completeness", completenessFilter);
            return args.dimension ? complete.eq("dimension", args.dimension) : complete;
          })
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit))
      : await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
            args.dimension
              ? q.eq("generation", generation).eq("snapshotDate", effectiveTo).eq("dimension", args.dimension)
              : q.eq("generation", generation).eq("snapshotDate", effectiveTo),
          )
          .order(args.direction)
          .paginate(paginationOptions(args.cursor, args.limit));
    const rows: AnalyticsSegmentRowDto[] = page.page.map((row) => ({
      snapshotDate: row.snapshotDate,
      dimension: row.dimension,
      bucket: row.bucket,
      shopCount: row.shopCount,
      milestoneCounts: row.milestoneCounts,
      healthSignalCounts: row.healthSignalCounts,
      northStar: toRateDto(row.northStar),
      deadlineSubmission: toRateDto(row.deadlineSubmission),
      finalSubmission: toRateDto(row.finalSubmission),
      completeness: row.completeness,
      computedAt: row.computedAt,
    }));
    return {
      kind: "segments" as const,
      metadata: responseMetadata({
        state,
        completeness: completeWhenEmpty(
          rows.length,
          rows.map((row) => row.completeness),
        ),
        computedAt: rows.length > 0 ? Math.max(...rows.map((row) => row.computedAt)) : null,
        pageInfo: pageInfo({
          cursor: args.cursor,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          pageSize: args.limit,
          returnedCount: rows.length,
        }),
        ranges: [{ from: args.from, to: args.to }],
        warnings: [
          ...missingDataWarnings(args.from, args.to, state.dataStartDate, state.latestCompleteSnapshotDate),
          ...pageWarnings(page),
        ],
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
    const computedAt = Date.now();
    const metadata = {
      asOf: computedAt,
      dataStartDate: null,
      latestCompleteSnapshotDate: null,
      computedAt,
      completeness: "complete" as const,
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
