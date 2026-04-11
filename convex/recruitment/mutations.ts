import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { todayJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";

export const createRecruitment = managerMutation({
  args: {
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    const today = todayJST();

    if (args.deadline < today) {
      throw new ConvexError("締切日は今日以降にしてください");
    }
    if (args.periodStart <= today) {
      throw new ConvexError("開始日は明日以降にしてください");
    }
    if (args.periodEnd < args.periodStart) {
      throw new ConvexError("終了日は開始日以降にしてください");
    }
    if (args.deadline >= args.periodStart) {
      throw new ConvexError("締切日は開始日より前にしてください");
    }

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
