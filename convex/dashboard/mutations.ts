import { v } from "convex/values";
import { authenticatedMutation } from "../_lib/functions";

export const dismissOnboarding = authenticatedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!ctx.user || ctx.user.isDeleted) return null;
    await ctx.db.patch(ctx.user._id, { dashboardOnboardingDismissedAt: Date.now() });
    return null;
  },
});
