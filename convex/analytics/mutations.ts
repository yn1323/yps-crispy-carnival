import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AnalyticsMetric } from "./metrics";

/**
 * 分析KPIの書き込みプリミティブ。
 * すべて「絶対値セットのupsert」（インクリメントではない）— これが冪等性の要で、
 * 同じ日を何度集計し直しても常に上書きになり、二重カウントが構造的に起きない。
 * 古いvalueSum等を残さないよう patch ではなく replace/insert する。
 */

type ShopSnapshotValues = Omit<Doc<"analyticsDailyShopSnapshots">, "_id" | "_creationTime">;
type ServiceSnapshotValues = Omit<Doc<"analyticsDailyServiceSnapshots">, "_id" | "_creationTime">;

export async function setDailyEventCount(
  ctx: MutationCtx,
  args: { date: string; metric: AnalyticsMetric; count: number; valueSum?: number },
) {
  const existing = await ctx.db
    .query("analyticsDailyEventCounts")
    .withIndex("by_date_metric", (q) => q.eq("date", args.date).eq("metric", args.metric))
    .first();
  const row = {
    date: args.date,
    metric: args.metric,
    count: args.count,
    valueSum: args.valueSum,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.replace(existing._id, row);
    return;
  }
  await ctx.db.insert("analyticsDailyEventCounts", row);
}

export async function setShopSnapshot(ctx: MutationCtx, values: ShopSnapshotValues) {
  const existing = await ctx.db
    .query("analyticsDailyShopSnapshots")
    .withIndex("by_date_shopId", (q) => q.eq("date", values.date).eq("shopId", values.shopId))
    .first();
  if (existing) {
    await ctx.db.replace(existing._id, values);
    return;
  }
  await ctx.db.insert("analyticsDailyShopSnapshots", values);
}

export async function setServiceSnapshot(ctx: MutationCtx, values: ServiceSnapshotValues) {
  const existing = await ctx.db
    .query("analyticsDailyServiceSnapshots")
    .withIndex("by_date", (q) => q.eq("date", values.date))
    .first();
  if (existing) {
    await ctx.db.replace(existing._id, values);
    return;
  }
  await ctx.db.insert("analyticsDailyServiceSnapshots", values);
}
