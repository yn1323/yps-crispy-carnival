import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { formatPeriodLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { getStaffLineAccount } from "../line/service";

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
    const unsubmittedStaffs = staffs.filter((s) => !submittedStaffIds.has(s._id));
    const staffEntries = (
      await Promise.all(
        unsubmittedStaffs.map(async (s) => {
          const lineAccount = await getStaffLineAccount(ctx, s._id);
          return {
            staffId: s._id,
            name: s.name,
            email: s.email,
            lineUserId: lineAccount?.lineUserId,
            lineFollowing: lineAccount?.following,
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
