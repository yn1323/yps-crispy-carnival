import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { formatDateLabel, formatPeriodLabel, generateDateRange, todayJST } from "../_lib/dateFormat";
import { getSubmissionPattern, type ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { OPEN_RECRUITMENT_NOTIFICATION_LIMIT } from "../constants";
import { getStaffLineAccount } from "../line/service";

type AssignmentTime = {
  startTime: string;
  endTime: string;
  optionId?: string;
};

function buildShiftTimeLabel(assignments: AssignmentTime[], pattern: ShiftSubmissionPattern) {
  if (assignments.length === 0) return null;
  const sortedAssignments = assignments.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (pattern.kind === "dateOnly") {
    return "出勤";
  }

  if (pattern.kind === "shiftType") {
    const optionById = new Map(pattern.options.map((option) => [option.id, option]));
    return sortedAssignments
      .map((assignment) => {
        const option = assignment.optionId
          ? optionById.get(assignment.optionId)
          : pattern.options.find(
              (item) => item.startTime === assignment.startTime && item.endTime === assignment.endTime,
            );
        return option
          ? `${option.name}（${option.startTime}-${option.endTime}）`
          : `${assignment.startTime}-${assignment.endTime}`;
      })
      .join(" / ");
  }

  return sortedAssignments.map((assignment) => `${assignment.startTime}-${assignment.endTime}`).join(" / ");
}

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
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    // 期間内の全日付を生成
    const dates = generateDateRange(recruitment.periodStart, recruitment.periodEnd);
    const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
    const submissionPattern = getSubmissionPattern(recruitment.submissionPattern, {
      startTime: recruitment.shiftStartTime,
      endTime: recruitment.shiftEndTime,
    });

    // スタッフごとにシフト情報をグループ化
    const staffEntries = await Promise.all(
      staffs.map(async (staff) => {
        const staffAssignments = assignments.filter((a) => a.staffId === staff._id);
        const assignmentsByDate = new Map<string, AssignmentTime[]>();
        for (const assignment of staffAssignments) {
          const items = assignmentsByDate.get(assignment.date) ?? [];
          items.push({
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
          });
          assignmentsByDate.set(assignment.date, items);
        }
        const lineAccount = await getStaffLineAccount(ctx, staff._id);

        const shifts = dates.map((date) => {
          const timeLabel = shopClosedDateSet.has(date)
            ? "定休日"
            : buildShiftTimeLabel(assignmentsByDate.get(date) ?? [], submissionPattern);
          return {
            date: formatDateLabel(date),
            timeLabel,
          };
        });

        return {
          staffId: staff._id,
          name: staff.name,
          email: staff.email,
          lineUserId: lineAccount?.lineUserId,
          lineFollowing: lineAccount?.following,
          shifts,
        };
      }),
    );

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
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
      .collect();

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      deadline: recruitment.deadline,
      staffEntries: await Promise.all(
        staffs.map(async (s) => {
          const lineAccount = await getStaffLineAccount(ctx, s._id);
          return {
            staffId: s._id,
            name: s.name,
            email: s.email,
            lineUserId: lineAccount?.lineUserId,
            lineFollowing: lineAccount?.following,
          };
        }),
      ),
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
      .take(OPEN_RECRUITMENT_NOTIFICATION_LIMIT);

    const openRecruitments = recruitments
      .filter((r) => !r.isDeleted && r.deadline >= today)
      .map((r) => ({
        recruitmentId: r._id,
        periodLabel: formatPeriodLabel(r.periodStart, r.periodEnd),
        deadline: r.deadline,
      }));

    const lineAccount = await getStaffLineAccount(ctx, staff._id);

    return {
      shopId: staff.shopId,
      shopName: shop.name,
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineAccount?.lineUserId,
        lineFollowing: lineAccount?.following,
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
    if (staff.shopId !== recruitment.shopId) return null;
    if (recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const lineAccount = await getStaffLineAccount(ctx, staff._id);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      staffName: staff.name,
      staffEmail: staff.email,
      lineUserId: lineAccount?.lineUserId,
      lineFollowing: lineAccount?.following,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
    };
  },
});
