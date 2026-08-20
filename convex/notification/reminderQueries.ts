import { v } from "convex/values";
import { formatPeriodLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { resolveStaffLineRecipient } from "../line/service";
import { toNotificationLineRecipient } from "../notificationOutbox/types";
import { isShiftTargetStaff } from "../staff/service";

/**
 * 催促メール送信に必要なデータを取得（未提出スタッフのみ）
 */
export const getReminderEmailData = internalQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;
    if (recruitment.status !== "open" || recruitment.lastReminderSentAt || !recruitment.reminderScheduledAt) {
      return null;
    }
    if (Date.now() >= getDeadlineCutoff(recruitment.deadline)) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const [staffs, submissions] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    const submittedStaffIds = new Set(submissions.map((s) => s.staffId));
    // シフト対象外スタッフは募集自体を受け取らないため、催促も送らない。
    const unsubmittedStaffs = staffs.filter((s) => isShiftTargetStaff(s) && !submittedStaffIds.has(s._id));
    const staffEntries = (
      await Promise.all(
        unsubmittedStaffs.map(async (s) => {
          const lineRecipient = await resolveStaffLineRecipient(ctx, { staffId: s._id, shopId: s.shopId });
          const projectedLineRecipient = toNotificationLineRecipient(lineRecipient);
          return {
            staffId: s._id,
            name: s.name,
            email: s.email,
            lineUserId: lineRecipient?.lineUserId,
            lineFollowing: lineRecipient?.following,
            lineRecipient: projectedLineRecipient,
          };
        }),
      )
    ).filter((s) => s.email.length > 0 || (s.lineUserId && s.lineFollowing));

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      deadline: recruitment.deadline,
      staffEntries,
    };
  },
});

/**
 * 不達再通知用に、1スタッフ分の催促通知データを取得する。
 */
export const getReminderEmailDataForStaff = internalQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
  },
  handler: async (ctx, { recruitmentId, staffId }) => {
    const [recruitment, staff] = await Promise.all([ctx.db.get(recruitmentId), ctx.db.get(staffId)]);
    if (!recruitment || recruitment.isDeleted || !staff || !isShiftTargetStaff(staff)) return null;
    if (staff.shopId !== recruitment.shopId) return null;
    if (recruitment.status !== "open" || !recruitment.reminderScheduledAt) return null;
    if (Date.now() >= getDeadlineCutoff(recruitment.deadline)) return null;

    const submission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
      .first();
    if (submission) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;
    const lineRecipient = await resolveStaffLineRecipient(ctx, { staffId: staff._id, shopId: staff.shopId });
    if (!staff.email && !(lineRecipient?.lineUserId && lineRecipient.following)) return null;

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      deadline: recruitment.deadline,
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineRecipient?.lineUserId,
        lineFollowing: lineRecipient?.following,
        lineRecipient: toNotificationLineRecipient(lineRecipient),
      },
    };
  },
});
