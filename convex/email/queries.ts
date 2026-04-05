import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { formatDateLabel, formatPeriodLabel, generateDateRange } from "../_lib/dateFormat";

/**
 * シフト確定メール送信に必要なデータを一括取得
 */
export const getConfirmationEmailData = internalQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const [staffs, assignments] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", recruitment.shopId))
        .collect(),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    const activeStaffs = staffs.filter((s) => !s.isDeleted && s.email);

    // 期間内の全日付を生成
    const dates = generateDateRange(recruitment.periodStart, recruitment.periodEnd);

    // スタッフごとにシフト情報をグループ化
    const staffEntries = activeStaffs.map((staff) => {
      const staffAssignments = assignments.filter((a) => a.staffId === staff._id);
      const assignmentMap = new Map(staffAssignments.map((a) => [a.date, a]));

      const shifts = dates.map((date) => {
        const assignment = assignmentMap.get(date);
        return {
          date: formatDateLabel(date),
          startTime: assignment?.startTime ?? null,
          endTime: assignment?.endTime ?? null,
        };
      });

      return {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        shifts,
      };
    });

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      staffEntries,
    };
  },
});

/**
 * 再発行メール送信に必要なデータを取得
 */
export const getReissueEmailData = internalQuery({
  args: {
    staffId: v.id("staffs"),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { staffId, recruitmentId }) => {
    const [staff, recruitment] = await Promise.all([ctx.db.get(staffId), ctx.db.get(recruitmentId)]);
    if (!staff || staff.isDeleted || !recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      staffName: staff.name,
      staffEmail: staff.email,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
    };
  },
});
