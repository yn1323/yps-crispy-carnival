import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { dateToUtcMs, formatUtcDate } from "../_lib/dateFormat";
import { ANALYTICS_METRICS, allNotificationEventMetrics, notificationMetric } from "../analytics/metrics";
import { fetchEventSeries, fetchServiceSnapshotRange, fetchShopSnapshotSeries } from "../analytics/queries";
import {
  daysSince,
  lastReachedOnboardingStep,
  onboardingStepLabel,
  type ShopStageInputs,
  shopStageAlerts,
} from "../analytics/stage";
import { FEATURE_REQUEST_LIST_LIMIT } from "../constants";
import { isShiftTargetStaff } from "../staff/service";
import type {
  EventCountDto,
  EventMetricTotalDto,
  FeatureRequestRowDto,
  NotificationBreakdownRow,
  ServiceSnapshotDto,
  ShopRankingSort,
  ShopRecruitmentRowDto,
  ShopSnapshotDto,
  ShopStageCounts,
  ShopStageKey,
  ShopStageRowDto,
  StageTransitionMetricDto,
  StageTransitionSummaryDto,
} from "./dto";
import { ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT } from "./schemas";

const OVERVIEW_METRICS = [
  ANALYTICS_METRICS.shopCreated,
  ANALYTICS_METRICS.staffCreated,
  ANALYTICS_METRICS.recruitmentCreated,
  ANALYTICS_METRICS.recruitmentConfirmed,
  ANALYTICS_METRICS.recruitmentConfirmedSubmittedTotal,
  ANALYTICS_METRICS.recruitmentConfirmedExpectedStaffTotal,
  ANALYTICS_METRICS.submissionFirst,
  ANALYTICS_METRICS.lineLinked,
  ANALYTICS_METRICS.registrationRequested,
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toServiceSnapshotDto(doc: Doc<"analyticsDailyServiceSnapshots">): ServiceSnapshotDto {
  return {
    date: doc.date,
    shopCount: doc.shopCount,
    shopCountByPlan: doc.shopCountByPlan,
    staffCount: doc.staffCount,
    shiftTargetStaffCount: doc.shiftTargetStaffCount,
    lineLinkedStaffCount: doc.lineLinkedStaffCount,
    lineFollowingStaffCount: doc.lineFollowingStaffCount,
    openRecruitmentCount: doc.openRecruitmentCount,
    pendingRegistrationRequestCount: doc.pendingRegistrationRequestCount,
    shopStageCounts: doc.shopStageCounts ?? null,
    computedAt: doc.computedAt,
  };
}

function toEventCountDto(doc: Doc<"analyticsDailyEventCounts">): EventCountDto {
  return {
    date: doc.date,
    metric: doc.metric,
    count: doc.count,
    valueSum: doc.valueSum ?? null,
  };
}

function sumSeries(metric: string, series: EventCountDto[]): EventMetricTotalDto {
  let valueSum: number | null = null;
  for (const point of series) {
    if (point.valueSum !== null) valueSum = (valueSum ?? 0) + point.valueSum;
  }
  return {
    metric,
    count: series.reduce((sum, point) => sum + point.count, 0),
    valueSum,
  };
}

async function getEventSeriesDtos(ctx: QueryCtx, args: { metric: string; from: string; to: string }) {
  const rows = await fetchEventSeries(ctx, args);
  return rows.map(toEventCountDto);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function dateStringToEpochDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = dateToUtcMs(value);
  if (!Number.isFinite(ms) || formatUtcDate(ms) !== value) return null;
  return Math.floor(ms / MS_PER_DAY);
}

async function getBoundedShopSnapshotsByDate(ctx: QueryCtx, date: string) {
  const snapshots = await ctx.db
    .query("analyticsDailyShopSnapshots")
    .withIndex("by_date_shopId", (q) => q.eq("date", date))
    .take(ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT + 1);
  if (snapshots.length > ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT) {
    throw new Error("Analytics shop snapshot page limit exceeded");
  }
  return snapshots;
}

function transitionMetric(
  pairs: { from: ShopStageKey; to: ShopStageKey }[],
  fromPredicate: (stage: ShopStageKey) => boolean,
  toPredicate: (from: ShopStageKey, to: ShopStageKey) => boolean,
): StageTransitionMetricDto {
  let denominator = 0;
  let numerator = 0;
  for (const pair of pairs) {
    if (!fromPredicate(pair.from)) continue;
    denominator += 1;
    if (toPredicate(pair.from, pair.to)) numerator += 1;
  }
  return { numerator, denominator, rate: ratio(numerator, denominator) };
}

function isDormantStage(stage: ShopStageKey) {
  return stage === "activeTrialDormant" || stage === "retainedDormant";
}

function isRetainedStage(stage: ShopStageKey) {
  return stage === "retained" || stage === "retainedDormant";
}

async function getStageTransitionSummary(
  ctx: QueryCtx,
  snapshots: ServiceSnapshotDto[],
): Promise<StageTransitionSummaryDto | null> {
  const stageSnapshots = snapshots.filter((snapshot) => snapshot.shopStageCounts !== null);
  const fromDate = stageSnapshots[0]?.date;
  const toDate = stageSnapshots[stageSnapshots.length - 1]?.date;
  if (!fromDate || !toDate) return null;

  const [fromRows, toRows] = await Promise.all([
    getBoundedShopSnapshotsByDate(ctx, fromDate),
    getBoundedShopSnapshotsByDate(ctx, toDate),
  ]);
  const toByShopId = new Map(toRows.map((row) => [row.shopId, row]));
  const pairs = fromRows.flatMap((fromRow) => {
    if (!fromRow.stage) return [];
    const toRow = toByShopId.get(fromRow.shopId);
    if (!toRow?.stage) return [];
    return [{ from: fromRow.stage, to: toRow.stage }];
  });

  return {
    fromDate,
    toDate,
    beforeStartToActiveTrial: transitionMetric(
      pairs,
      (stage) => stage === "beforeStart",
      (_from, to) => to !== "beforeStart",
    ),
    activeTrialToRetained: transitionMetric(
      pairs,
      (stage) => stage === "activeTrial",
      (_from, to) => isRetainedStage(to),
    ),
    retainedToDormant: transitionMetric(
      pairs,
      (stage) => stage === "retained",
      (_from, to) => to === "retainedDormant",
    ),
    dormantToRecovered: transitionMetric(
      pairs,
      isDormantStage,
      (from, to) =>
        (from === "activeTrialDormant" && (to === "activeTrial" || to === "retained")) ||
        (from === "retainedDormant" && to === "retained"),
    ),
  };
}

async function getShopName(ctx: QueryCtx, shopId: Id<"shops">) {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return "削除済み店舗";
  return shop.name;
}

async function getSnapshotShopIdentity(ctx: QueryCtx, doc: Doc<"analyticsDailyShopSnapshots">) {
  if (doc.shopName !== undefined && doc.shopCreatedAt !== undefined) {
    return { shopName: doc.shopName, shopCreatedAt: doc.shopCreatedAt };
  }
  const shop = await ctx.db.get(doc.shopId);
  return {
    shopName: doc.shopName ?? (!shop || shop.isDeleted ? "削除済み店舗" : shop.name),
    shopCreatedAt: doc.shopCreatedAt ?? shop?._creationTime ?? null,
  };
}

async function toShopSnapshotDto(ctx: QueryCtx, doc: Doc<"analyticsDailyShopSnapshots">): Promise<ShopSnapshotDto> {
  const { shopName } = await getSnapshotShopIdentity(ctx, doc);
  return {
    date: doc.date,
    shopId: doc.shopId,
    shopName,
    planKey: doc.planKey,
    staffCount: doc.staffCount,
    shiftTargetStaffCount: doc.shiftTargetStaffCount,
    lineLinkedStaffCount: doc.lineLinkedStaffCount,
    lineFollowingStaffCount: doc.lineFollowingStaffCount,
    openRecruitmentCount: doc.openRecruitmentCount,
    lineLinkedRate: ratio(doc.lineLinkedStaffCount, doc.shiftTargetStaffCount),
    lineFollowingRate: ratio(doc.lineFollowingStaffCount, doc.lineLinkedStaffCount),
    computedAt: doc.computedAt,
  };
}

function rankingValue(row: ShopSnapshotDto, sort: ShopRankingSort) {
  if (sort === "lineLinkedRate") return row.lineLinkedRate ?? -1;
  return row[sort];
}

function parseNotificationMetric(metric: string): Omit<NotificationBreakdownRow, "count"> | null {
  const [namespace, channel, outcome, notificationKind] = metric.split(".");
  if (namespace !== "notification") return null;
  if (channel !== "email" && channel !== "line") return null;
  if (outcome !== "sent" && outcome !== "failed") return null;
  if (
    notificationKind !== "recruitment" &&
    notificationKind !== "reminder" &&
    notificationKind !== "confirmation" &&
    notificationKind !== "lineInvite" &&
    notificationKind !== "other"
  ) {
    return null;
  }
  return { metric, channel, outcome, notificationKind };
}

export const getOverview = internalQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const serviceSnapshots = (await fetchServiceSnapshotRange(ctx, args)).map(toServiceSnapshotDto);
    const stageTransitions = await getStageTransitionSummary(ctx, serviceSnapshots);
    const eventSeries = await Promise.all(
      OVERVIEW_METRICS.map(async (metric) => {
        const series = await getEventSeriesDtos(ctx, { metric, from: args.from, to: args.to });
        return sumSeries(metric, series);
      }),
    );
    return {
      kind: "overview" as const,
      range: args,
      latestServiceSnapshot: serviceSnapshots[serviceSnapshots.length - 1] ?? null,
      serviceSnapshots,
      eventTotals: eventSeries,
      stageTransitions,
    };
  },
});

export const getEventTrends = internalQuery({
  args: { from: v.string(), to: v.string(), metrics: v.array(v.string()) },
  handler: async (ctx, args) => {
    const nestedSeries = await Promise.all(
      args.metrics.map((metric) => getEventSeriesDtos(ctx, { metric, from: args.from, to: args.to })),
    );
    const series = nestedSeries.flat();
    return {
      kind: "eventTrends" as const,
      range: { from: args.from, to: args.to },
      metrics: args.metrics,
      series,
      totals: args.metrics.map((metric) =>
        sumSeries(
          metric,
          series.filter((point) => point.metric === metric),
        ),
      ),
    };
  },
});

export const getNotificationBreakdown = internalQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const metrics = allNotificationEventMetrics();
    const nestedSeries = await Promise.all(
      metrics.map((metric) => getEventSeriesDtos(ctx, { metric, from: args.from, to: args.to })),
    );
    const series = nestedSeries.flat();
    const rows = metrics.flatMap((metric): NotificationBreakdownRow[] => {
      const parsed = parseNotificationMetric(metric);
      if (!parsed) return [];
      const count = series.filter((point) => point.metric === metric).reduce((sum, point) => sum + point.count, 0);
      return [{ ...parsed, count }];
    });
    return {
      kind: "notificationBreakdown" as const,
      range: args,
      rows,
      series,
    };
  },
});

function emptyStageCounts(): ShopStageCounts {
  return { beforeStart: 0, activeTrial: 0, activeTrialDormant: 0, retained: 0, retainedDormant: 0 };
}

async function toShopStageRowDto(ctx: QueryCtx, doc: Doc<"analyticsDailyShopSnapshots">): Promise<ShopStageRowDto> {
  const { shopName, shopCreatedAt } = await getSnapshotShopIdentity(ctx, doc);
  const base = {
    shopId: doc.shopId,
    shopName,
    shopCreatedAt,
    firstRecruitmentCreatedAt: doc.firstRecruitmentCreatedAt ?? null,
    firstRecruitmentDeadline: doc.firstRecruitmentDeadline ?? null,
    lastShiftCreatedAt: doc.lastShiftCreatedAt ?? null,
    lastShiftPeriodStart: doc.lastShiftPeriodStart ?? null,
    lastShiftPeriodEnd: doc.lastShiftPeriodEnd ?? null,
    lastShiftSubmissionRate: doc.lastShiftSubmissionRate ?? null,
    averageRecruitmentOpenDays: doc.averageRecruitmentOpenDays ?? null,
    averageDeadlineToConfirmationDays: doc.averageDeadlineToConfirmationDays ?? null,
    reminderSentStaffRate: doc.reminderSentStaffRate ?? null,
    planKey: doc.planKey,
    staffCount: doc.staffCount,
    shiftTargetStaffCount: doc.shiftTargetStaffCount,
    lineLinkedStaffCount: doc.lineLinkedStaffCount,
    openRecruitmentCount: doc.openRecruitmentCount,
    computedAt: doc.computedAt,
  };
  // ステージ集計導入前のスナップショット（再集計されれば埋まる）
  if (doc.stage === undefined) {
    return {
      ...base,
      stage: null,
      recruitmentCount: null,
      confirmedRecruitmentCount: null,
      openRecruitmentSubmittedCount: null,
      submittedRecruitmentCount: null,
      openNotificationFailureCount: null,
      recruitmentCreatedLast30Days: null,
      submissionRate: null,
      confirmedSubmissionRate: null,
      averageFirstSubmissionLeadTimeMs: null,
      averageConfirmationLeadTimeMs: null,
      emailNotificationSentCount: null,
      lineNotificationSentCount: null,
      notificationLineSentRate: null,
      postReminderSubmissionRate: null,
      resubmissionRate: null,
      lastRecruitmentSubmissionRate: null,
      lastRecruitmentCreatedAt: null,
      lastRecruitmentConfirmedAt: null,
      lastConfirmedRecruitmentLeadTimeMs: null,
      hasSubmission: null,
      hasNotificationSent: null,
      hasCurrentOrFutureConfirmedShift: null,
      hasCurrentConfirmedShift: null,
      hasFutureOpenRecruitment: null,
      hasFutureConfirmedShift: null,
      hadActiveOrRetainedStage: null,
      hadRetainedStage: null,
      lastActivityAt: null,
      stageReferenceAt: null,
      stalledDays: null,
      onboardingStepLabel: null,
      alerts: [],
    };
  }

  const inputs: ShopStageInputs = {
    realStaffCount: doc.shiftTargetStaffCount,
    recruitmentCount: doc.recruitmentCount ?? 0,
    confirmedRecruitmentCount: doc.confirmedRecruitmentCount ?? 0,
    hasSubmission: doc.hasSubmission ?? false,
    hasNotificationSent: doc.hasNotificationSent ?? false,
    hasCurrentOrFutureConfirmedShift: doc.hasCurrentOrFutureConfirmedShift ?? false,
    hasCurrentConfirmedShift: doc.hasCurrentConfirmedShift ?? false,
    hasOpenRecruitment: doc.openRecruitmentCount > 0,
    hasFutureOpenRecruitment: doc.hasFutureOpenRecruitment ?? doc.openRecruitmentCount > 0,
    hasFutureConfirmedShift:
      doc.hasFutureConfirmedShift ?? ((doc.hasCurrentOrFutureConfirmedShift ?? false) && !doc.hasCurrentConfirmedShift),
    hadActiveOrRetainedStage: doc.hadActiveOrRetainedStage ?? doc.stage !== "beforeStart",
    hadRetainedStage: doc.hadRetainedStage ?? isRetainedStage(doc.stage),
    lastActivityAt: doc.lastActivityAt ?? doc.computedAt,
  };
  const stageReferenceAt = doc.stageReferenceAt ?? doc.computedAt;
  const emailNotificationSentCount = doc.emailNotificationSentCount ?? null;
  const lineNotificationSentCount = doc.lineNotificationSentCount ?? null;
  const notificationLineSentRate =
    emailNotificationSentCount === null || lineNotificationSentCount === null
      ? null
      : ratio(lineNotificationSentCount, emailNotificationSentCount + lineNotificationSentCount);
  return {
    ...base,
    stage: doc.stage,
    recruitmentCount: inputs.recruitmentCount,
    confirmedRecruitmentCount: inputs.confirmedRecruitmentCount,
    openRecruitmentSubmittedCount: doc.openRecruitmentSubmittedCount ?? 0,
    submittedRecruitmentCount: doc.submittedRecruitmentCount ?? null,
    openNotificationFailureCount: doc.openNotificationFailureCount ?? 0,
    recruitmentCreatedLast30Days: doc.recruitmentCreatedLast30Days ?? null,
    submissionRate: doc.submissionRate ?? null,
    confirmedSubmissionRate: doc.confirmedSubmissionRate ?? null,
    averageFirstSubmissionLeadTimeMs: doc.averageFirstSubmissionLeadTimeMs ?? null,
    averageConfirmationLeadTimeMs: doc.averageConfirmationLeadTimeMs ?? null,
    emailNotificationSentCount,
    lineNotificationSentCount,
    notificationLineSentRate,
    postReminderSubmissionRate: doc.postReminderSubmissionRate ?? null,
    resubmissionRate: doc.resubmissionRate ?? null,
    lastRecruitmentSubmissionRate: doc.lastRecruitmentSubmissionRate ?? null,
    lastRecruitmentCreatedAt: doc.lastRecruitmentCreatedAt ?? null,
    lastRecruitmentConfirmedAt: doc.lastRecruitmentConfirmedAt ?? null,
    lastConfirmedRecruitmentLeadTimeMs: doc.lastConfirmedRecruitmentLeadTimeMs ?? null,
    hasSubmission: inputs.hasSubmission,
    hasNotificationSent: inputs.hasNotificationSent,
    hasCurrentOrFutureConfirmedShift: inputs.hasCurrentOrFutureConfirmedShift,
    hasCurrentConfirmedShift: inputs.hasCurrentConfirmedShift,
    hasFutureOpenRecruitment: inputs.hasFutureOpenRecruitment,
    hasFutureConfirmedShift: inputs.hasFutureConfirmedShift,
    hadActiveOrRetainedStage: inputs.hadActiveOrRetainedStage,
    hadRetainedStage: inputs.hadRetainedStage,
    lastActivityAt: inputs.lastActivityAt,
    stageReferenceAt,
    stalledDays: daysSince(inputs.lastActivityAt, stageReferenceAt),
    onboardingStepLabel: onboardingStepLabel(lastReachedOnboardingStep(inputs)),
    alerts: shopStageAlerts({
      inputs,
      stage: doc.stage,
      openRecruitmentSubmittedCount: doc.openRecruitmentSubmittedCount ?? 0,
      openNotificationFailureCount: doc.openNotificationFailureCount ?? 0,
      nowMs: stageReferenceAt,
    }),
  };
}

export const getShopStages = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const snapshots = await getBoundedShopSnapshotsByDate(ctx, args.date);

    const stageCounts = emptyStageCounts();
    let unclassifiedCount = 0;
    const rows: ShopStageRowDto[] = [];
    for (const snapshot of snapshots) {
      const row = await toShopStageRowDto(ctx, snapshot);
      rows.push(row);
      if (row.stage === null) unclassifiedCount += 1;
      else stageCounts[row.stage] += 1;
    }
    // 要確認（アラートあり）を先頭に、次に停止日数が長い順
    rows.sort((a, b) => b.alerts.length - a.alerts.length || (b.stalledDays ?? 0) - (a.stalledDays ?? 0));

    return {
      kind: "shopStages" as const,
      date: args.date,
      stageCounts,
      unclassifiedCount,
      rows,
    };
  },
});

export const getShopRanking = internalQuery({
  args: {
    date: v.string(),
    sort: v.union(
      v.literal("staffCount"),
      v.literal("shiftTargetStaffCount"),
      v.literal("lineLinkedRate"),
      v.literal("openRecruitmentCount"),
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const snapshots = await getBoundedShopSnapshotsByDate(ctx, args.date);
    const rows = await Promise.all(snapshots.map((snapshot) => toShopSnapshotDto(ctx, snapshot)));
    rows.sort((a, b) => rankingValue(b, args.sort) - rankingValue(a, args.sort));
    return {
      kind: "shopRanking" as const,
      date: args.date,
      sort: args.sort,
      rows: rows.slice(0, args.limit),
    };
  },
});

function recruitmentSortValue(recruitment: Doc<"recruitments">) {
  return dateStringToEpochDay(recruitment.periodStart) ?? Number.NEGATIVE_INFINITY;
}

async function getCurrentShiftTargetStaffIds(ctx: QueryCtx, shopId: Id<"shops">) {
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT);
  return new Set(staffs.filter(isShiftTargetStaff).map((staff) => staff._id));
}

async function getCurrentShiftTargetStaffCount(ctx: QueryCtx, shopId: Id<"shops">) {
  return (await getCurrentShiftTargetStaffIds(ctx, shopId)).size;
}

function toShopRecruitmentRowDto(
  recruitment: Doc<"recruitments">,
  stats: Doc<"recruitmentStats"> | null,
  currentShiftTargetStaffCount: number,
): ShopRecruitmentRowDto {
  return {
    confirmedAt: recruitment.confirmedAt ?? null,
    createdAt: recruitment._creationTime,
    currentShiftTargetStaffCount,
    deadline: recruitment.deadline,
    periodEnd: recruitment.periodEnd,
    periodStart: recruitment.periodStart,
    recruitmentId: recruitment._id,
    status: recruitment.status,
    submittedCount:
      stats?.submittedCount === undefined ? null : Math.min(stats.submittedCount, currentShiftTargetStaffCount),
  };
}

export const getShopRecruitments = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const [recruitments, recruitmentStats, currentShiftTargetStaffCount] = await Promise.all([
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", args.shopId).eq("isDeleted", false))
        .order("desc")
        .take(ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT),
      ctx.db
        .query("recruitmentStats")
        .withIndex("by_shopId", (q) => q.eq("shopId", args.shopId))
        .take(ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT),
      getCurrentShiftTargetStaffCount(ctx, args.shopId),
    ]);
    const statsByRecruitmentId = new Map(recruitmentStats.map((stats) => [stats.recruitmentId, stats]));
    const rows = recruitments
      .sort((a, b) => recruitmentSortValue(b) - recruitmentSortValue(a) || b._creationTime - a._creationTime)
      .map((recruitment) =>
        toShopRecruitmentRowDto(
          recruitment,
          statsByRecruitmentId.get(recruitment._id) ?? null,
          currentShiftTargetStaffCount,
        ),
      );

    return {
      kind: "shopRecruitments" as const,
      shopId: args.shopId,
      shopName: await getShopName(ctx, args.shopId),
      rows,
    };
  },
});

export const getFeatureRequests = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("featureRequests")
      .order("desc")
      .paginate({
        cursor: args.cursor,
        numItems: Math.min(Math.max(1, args.limit), FEATURE_REQUEST_LIST_LIMIT),
      });
    const rows: FeatureRequestRowDto[] = await Promise.all(
      page.page.map(async (request) => {
        const shop = await ctx.db.get(request.shopId);
        const isStaffRequest = request.staffId !== undefined;
        return {
          id: request._id,
          shopId: request.shopId,
          shopName: !shop || shop.isDeleted ? "削除済み店舗" : shop.name,
          senderType: isStaffRequest ? ("staff" as const) : ("manager" as const),
          comment: request.comment,
          createdAt: request._creationTime,
        };
      }),
    );
    return {
      kind: "featureRequests" as const,
      rows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getShopDetail = internalQuery({
  args: { shopId: v.id("shops"), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const series = await Promise.all(
      (await fetchShopSnapshotSeries(ctx, args)).map((snapshot) => toShopSnapshotDto(ctx, snapshot)),
    );
    return {
      kind: "shopDetail" as const,
      range: { from: args.from, to: args.to },
      shopId: args.shopId,
      shopName: await getShopName(ctx, args.shopId),
      series,
    };
  },
});

export const notificationMetrics = {
  emailReminderSent: notificationMetric("email", "sent", "reminder"),
  lineReminderSent: notificationMetric("line", "sent", "reminder"),
  emailReminderFailed: notificationMetric("email", "failed", "reminder"),
  lineReminderFailed: notificationMetric("line", "failed", "reminder"),
} as const;
