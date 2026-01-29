/**
 * 必要人員設定 - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗の必要人員設定の取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";

// 店舗の必要人員設定を全曜日分取得
export const getByShopId = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const staffingList = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();

    return staffingList;
  },
});

// 特定の曜日の必要人員設定を取得
export const getByShopIdAndDay = query({
  args: {
    shopId: v.id("shops"),
    dayOfWeek: v.number(),
  },
  handler: async (ctx, args) => {
    const staffingList = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();

    return staffingList.find((s) => s.dayOfWeek === args.dayOfWeek) ?? null;
  },
});
