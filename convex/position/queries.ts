/**
 * ポジションドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗のポジション一覧取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";

// 店舗のポジション一覧を取得
export const listByShop = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    return positions.sort((a, b) => a.order - b.order);
  },
});
