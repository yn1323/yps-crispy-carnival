import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { updateShopSettingsSchema } from "./schemas";

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
    const parsed = updateShopSettingsSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const submissionPattern = normalizeSubmissionPattern(input.submissionPattern);
    await ctx.db.patch(ctx.shop._id, {
      name: input.shopName,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => input.regularClosedDays.includes(day)),
      submissionPattern,
    });
  },
});
