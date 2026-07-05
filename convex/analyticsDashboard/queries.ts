import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { ANALYTICS_METRICS, allNotificationEventMetrics, notificationMetric } from "../analytics/metrics";
import { fetchEventSeries, fetchServiceSnapshotRange, fetchShopSnapshotSeries } from "../analytics/queries";
import type {
  EventCountDto,
  EventMetricTotalDto,
  NotificationBreakdownRow,
  ServiceSnapshotDto,
  ShopRankingSort,
  ShopSnapshotDto,
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

async function getShopName(ctx: QueryCtx, shopId: Id<"shops">) {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return "削除済み店舗";
  return shop.name;
}

async function toShopSnapshotDto(ctx: QueryCtx, doc: Doc<"analyticsDailyShopSnapshots">): Promise<ShopSnapshotDto> {
  return {
    date: doc.date,
    shopId: doc.shopId,
    shopName: await getShopName(ctx, doc.shopId),
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
    const snapshots = await ctx.db
      .query("analyticsDailyShopSnapshots")
      .withIndex("by_date_shopId", (q) => q.eq("date", args.date))
      .take(ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT);
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
