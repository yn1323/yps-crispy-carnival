import { authenticatedMutation } from "../_lib/functions";

export const dismissOnboarding = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    if (!ctx.user || ctx.user.isDeleted) return;
    await ctx.db.patch(ctx.user._id, { dashboardOnboardingDismissedAt: Date.now() });
  },
});
