import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { formatDateLabel, formatPeriodLabel, generateDateRange, todayJST } from "../_lib/dateFormat";

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

    const activeStaffs = staffs.filter((s) => !s.isDeleted);

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
        lineUserId: staff.lineUserId,
        lineFollowing: staff.lineFollowing,
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
 * 募集開始メール送信に必要なデータを取得
 */
export const getRecruitmentEmailData = internalQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId", (q) => q.eq("shopId", recruitment.shopId))
      .collect();
    const activeStaffs = staffs.filter((s) => !s.isDeleted);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      deadline: recruitment.deadline,
      staffEntries: activeStaffs.map((s) => ({
        staffId: s._id,
        name: s.name,
        email: s.email,
        lineUserId: s.lineUserId,
        lineFollowing: s.lineFollowing,
      })),
    };
  },
});

/**
 * 後から追加・LINE連携された1スタッフに、現在募集中の希望提出通知を送るためのデータを取得する。
 */
export const getOpenRecruitmentNotificationDataForStaff = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted) return null;

    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) return null;

    const today = todayJST();
    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", staff.shopId).eq("status", "open"))
      .order("desc")
      .take(50);

    const openRecruitments = recruitments
      .filter((r) => !r.isDeleted && r.deadline >= today)
      .map((r) => ({
        recruitmentId: r._id,
        periodLabel: formatPeriodLabel(r.periodStart, r.periodEnd),
        deadline: r.deadline,
      }));

    return {
      shopId: staff.shopId,
      shopName: shop.name,
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: staff.lineUserId,
        lineFollowing: staff.lineFollowing,
      },
      recruitments: openRecruitments,
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
      lineUserId: staff.lineUserId,
      lineFollowing: staff.lineFollowing,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
    };
  },
});
