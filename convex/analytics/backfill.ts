import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { addDays, dateJST, todayJST } from "../_lib/dateFormat";

/**
 * イベント系KPIの全期間バックフィル。デプロイ後に1回だけ手動実行する:
 *   npx convex run analytics/backfill:start '{}'
 *
 * 日次集計のイベント系フェーズ（Phase 3〜6）を fromDate から toDate まで1日ずつ直列に
 * 再利用する（運用とバックフィルが単一コードパス）。状態スナップショット（Phase 1〜2）は
 * 過去時点の状態を復元できないため対象外。
 *
 * 全書き込みが絶対値upsertなので、途中で失敗しても任意の fromDate から再実行するだけで復旧できる。
 * 進捗は analyticsDailyEventCounts の date 最大値で確認する。
 */
export const start = internalMutation({
  args: { fromDate: v.optional(v.string()), toDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const toDate = args.toDate ?? addDays(todayJST(), -1);

    let fromDate = args.fromDate;
    if (!fromDate) {
      // 既定値: 最古の店舗の作成日（サービス開始日）
      const oldestShop = await ctx.db.query("shops").order("asc").first();
      if (!oldestShop) return { started: false, reason: "no shops" };
      fromDate = dateJST(oldestShop._creationTime);
    }
    if (fromDate > toDate) {
      return { started: false, reason: `fromDate ${fromDate} is after toDate ${toDate}` };
    }

    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateNotificationEvents, {
      date: fromDate,
      stage: "sent",
      cursor: null,
      acc: {},
      followUp: { untilDate: toDate },
    });
    return { started: true, fromDate, toDate };
  },
});
