import { v } from "convex/values";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";

/**
 * シフト提出画面のデータ取得
 * フロントの SubmissionData 型に対応
 */
export const getSubmissionPageData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    if (ctx.session.recruitmentId !== recruitmentId) return null;

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      return null;
    }

    const isBeforeDeadline = Date.now() < getDeadlineCutoff(recruitment.deadline);

    const staffId = ctx.staff._id;
    const [submission, requests] = await Promise.all([
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
        .first(),
      ctx.db
        .query("shiftRequests")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
        .collect(),
    ]);

    return {
      shopName: ctx.shop.name,
      staffName: ctx.staff.name,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      deadline: recruitment.deadline,
      isBeforeDeadline,
      hasSubmitted: submission !== null,
      existingRequests: requests.map((r) => ({
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
      })),
      timeRange: {
        startTime: ctx.shop.shiftStartTime,
        endTime: ctx.shop.shiftEndTime,
      },
    };
  },
});
