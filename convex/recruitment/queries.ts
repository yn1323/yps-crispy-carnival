/**
 * 募集ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗のシフト募集一覧取得
 * - 募集詳細取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { RecruitmentStatusType } from "../constants";

// 募集詳細取得
export const getById = query({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted) {
      return null;
    }

    return {
      _id: recruitment._id,
      shopId: recruitment.shopId,
      startDate: recruitment.startDate,
      endDate: recruitment.endDate,
      deadline: recruitment.deadline,
      status: recruitment.status as RecruitmentStatusType,
      appliedCount: recruitment.appliedCount,
      totalStaffCount: recruitment.totalStaffCount,
      confirmedAt: recruitment.confirmedAt,
      createdAt: recruitment.createdAt,
    };
  },
});

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
