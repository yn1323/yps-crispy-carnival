import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { rateLimit } from "../_lib/rateLimits";

export const checkSubmissionRateLimit = internalMutation({
  args: { emailKey: v.string(), ipKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const global = await rateLimit(ctx, { name: "contactGlobal", key: "global" });
    if (!global.ok) return { allowed: false as const };

    const shortEmail = await rateLimit(ctx, { name: "contactEmailShort", key: args.emailKey });
    if (!shortEmail.ok) return { allowed: false as const };

    const hourlyEmail = await rateLimit(ctx, { name: "contactEmailHourly", key: args.emailKey });
    if (!hourlyEmail.ok) return { allowed: false as const };

    if (args.ipKey) {
      const shortIp = await rateLimit(ctx, { name: "contactIpShort", key: args.ipKey });
      if (!shortIp.ok) return { allowed: false as const };
    }

    return { allowed: true as const };
  },
});
