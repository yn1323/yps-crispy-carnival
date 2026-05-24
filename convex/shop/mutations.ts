import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const updateShopSettings = managerMutation({
  args: {
    shopName: v.string(),
    regularClosedDays: v.array(
      v.union(
        v.literal("sun"),
        v.literal("mon"),
        v.literal("tue"),
        v.literal("wed"),
        v.literal("thu"),
        v.literal("fri"),
        v.literal("sat"),
      ),
    ),
    submissionPattern: submissionPatternValidator,
  },
  handler: async (ctx, args) => {
    const name = args.shopName.trim();
    if (name.length === 0) {
      throw new ConvexError("店舗名を入力してください");
    }
    const submissionPattern = normalizeSubmissionPattern(args.submissionPattern);
    await ctx.db.patch(ctx.shop._id, {
      name,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => args.regularClosedDays.includes(day)),
      submissionPattern,
    });
  },
});
