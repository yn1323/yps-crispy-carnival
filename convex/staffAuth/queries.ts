import { v } from "convex/values";
import { query } from "../_generated/server";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { timeToMinutes } from "../_lib/time";

/**
 * セッション認証付きシフト閲覧データ取得
 */
export const getShiftViewData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    if (ctx.session.recruitmentId !== recruitmentId) return null;

    const { _id: shopId } = ctx.shop;

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== shopId) {
      return null;
    }

    const [staffs, assignments] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect(),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    const activeStaffs = staffs.filter((s) => !s.isDeleted);

    return {
      shopName: ctx.shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      staffs: activeStaffs.map((s) => ({ _id: s._id, name: s.name })),
      assignments: assignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      timeRange: {
        start: Math.floor(timeToMinutes(ctx.shop.shiftStartTime) / 60),
        end: Math.ceil(timeToMinutes(ctx.shop.shiftEndTime) / 60),
        unit: 30 as const,
      },
    };
  },
});

/**
 * 募集情報の公開データ取得（認証不要）
 * 再発行ページのヘッダー表示用
 */
export const getRecruitmentInfo = query({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    return {
      shopName: shop.name,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
    };
  },
});
