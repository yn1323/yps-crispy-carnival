/**
 * 募集ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗のシフト募集一覧取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { RecruitmentStatusType } from "../constants";

// 店舗の募集一覧取得
export const listByShop = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shop_and_startDate", (q) => q.eq("shopId", args.shopId))
      .order("desc")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    return recruitments.map((r) => ({
      _id: r._id,
      startDate: r.startDate,
      endDate: r.endDate,
      deadline: r.deadline,
      status: r.status as RecruitmentStatusType,
      appliedCount: r.appliedCount,
      totalStaffCount: r.totalStaffCount,
      confirmedAt: r.confirmedAt,
    }));
  },
});
