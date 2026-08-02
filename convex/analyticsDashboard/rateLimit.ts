import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { rateLimit } from "../_lib/rateLimits";

export const consumeServiceRequest = internalMutation({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    retryAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const result = await rateLimit(ctx, { name: "analyticsDashboardService", key: "service" });
    return {
      allowed: result.ok,
      retryAt: result.retryAt ?? null,
    };
  },
});
