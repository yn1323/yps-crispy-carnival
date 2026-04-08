import { v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";

export const createRecruitment = managerMutation({
  args: {
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: ctx.shop._id,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      deadline: args.deadline,
      status: "open",
      isDeleted: false,
    });
    // 全スタッフに募集開始メールを送信
    await ctx.scheduler.runAfter(0, internal.email.actions.sendRecruitmentNotificationEmails, {
      recruitmentId,
    });

    return recruitmentId;
  },
});
