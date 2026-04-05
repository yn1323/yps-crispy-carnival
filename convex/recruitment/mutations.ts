import { v } from "convex/values";
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
    return recruitmentId;
  },
});
