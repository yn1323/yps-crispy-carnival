import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { ANALYTICS_QUERY_RANGE_LIMIT } from "../constants";

/**
 * 分析KPIの参照API。すべて internalQuery（公開queryなし）。
 * Convexダッシュボード / `npx convex run analytics/queries:xxx '{...}'` から実行する。
 *
 * handler本体は素の fetch* 関数に切り出してある。将来ダッシュボード画面等で公開する場合は、
 * adminQuery ラッパーで同じ関数を包み直すだけでよい。
 */

export async function fetchServiceSnapshotRange(ctx: QueryCtx, args: { from: string; to: string }) {
  return await ctx.db
    .query("analyticsDailyServiceSnapshots")
    .withIndex("by_date", (q) => q.gte("date", args.from).lte("date", args.to))
    .take(ANALYTICS_QUERY_RANGE_LIMIT);
}

export const getServiceSnapshotRange = internalQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => await fetchServiceSnapshotRange(ctx, args),
});

export async function fetchEventSeries(ctx: QueryCtx, args: { metric: string; from: string; to: string }) {
  return await ctx.db
    .query("analyticsDailyEventCounts")
    .withIndex("by_metric_date", (q) => q.eq("metric", args.metric).gte("date", args.from).lte("date", args.to))
    .take(ANALYTICS_QUERY_RANGE_LIMIT);
}

export const getEventSeries = internalQuery({
  args: { metric: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => await fetchEventSeries(ctx, args),
});

export async function fetchShopSnapshotSeries(ctx: QueryCtx, args: { shopId: Id<"shops">; from: string; to: string }) {
  return await ctx.db
    .query("analyticsDailyShopSnapshots")
    .withIndex("by_shopId_date", (q) => q.eq("shopId", args.shopId).gte("date", args.from).lte("date", args.to))
    .take(ANALYTICS_QUERY_RANGE_LIMIT);
}

export const getShopSnapshotSeries = internalQuery({
  args: { shopId: v.id("shops"), from: v.string(), to: v.string() },
  handler: async (ctx, args) => await fetchShopSnapshotSeries(ctx, args),
});

export async function fetchDailySummary(ctx: QueryCtx, args: { date: string }) {
  const serviceSnapshot = await ctx.db
    .query("analyticsDailyServiceSnapshots")
    .withIndex("by_date", (q) => q.eq("date", args.date))
    .first();
  const eventCounts = await ctx.db
    .query("analyticsDailyEventCounts")
    .withIndex("by_date_metric", (q) => q.eq("date", args.date))
    .take(ANALYTICS_QUERY_RANGE_LIMIT);
  return { serviceSnapshot, eventCounts };
}

export const getDailySummary = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, args) => await fetchDailySummary(ctx, args),
});
