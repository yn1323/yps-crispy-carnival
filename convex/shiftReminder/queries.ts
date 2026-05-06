import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { formatDateLabel, formatPeriodLabel } from "../_lib/dateFormat";

/**
 * 催促メール送信に必要なデータを取得（未提出スタッフのみ）
 */
export const getReminderEmailData = internalQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const [staffs, submissions] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", recruitment.shopId))
        .collect(),
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    const submittedStaffIds = new Set(submissions.map((s) => s.staffId));
    const unsubmittedStaffs = staffs.filter((s) => !s.isDeleted && !submittedStaffIds.has(s._id) && s.email.length > 0);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      deadline: formatDateLabel(recruitment.deadline),
      staffEntries: unsubmittedStaffs.map((s) => ({
        staffId: s._id,
        name: s.name,
        email: s.email,
        lineUserId: s.lineUserId,
        lineFollowing: s.lineFollowing,
      })),
    };
  },
});
