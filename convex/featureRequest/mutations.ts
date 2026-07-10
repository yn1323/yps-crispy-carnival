import { ConvexError, v } from "convex/values";
import { managerMutation, staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { submitFeatureRequestSchema } from "./schemas";

export const submit = managerMutation({
  args: {
    comment: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = submitFeatureRequestSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const existing = await ctx.db
      .query("featureRequests")
      .withIndex("by_userId_and_requestId", (q) => q.eq("userId", ctx.user._id).eq("requestId", parsed.data.requestId))
      .unique();
    if (existing) return { status: "accepted" as const };

    const shortLimit = await rateLimit(ctx, { name: "featureRequestShort", key: ctx.user._id });
    if (!shortLimit.ok) {
      throw new ConvexError("少し時間をおいて、もう一度お試しください");
    }
    const dailyLimit = await rateLimit(ctx, { name: "featureRequestDaily", key: ctx.user._id });
    if (!dailyLimit.ok) {
      throw new ConvexError("本日の送信回数が上限に達しました。時間をおいて、もう一度お試しください");
    }

    await ctx.db.insert("featureRequests", {
      shopId: ctx.shop._id,
      userId: ctx.user._id,
      comment: parsed.data.comment,
      requestId: parsed.data.requestId,
    });

    return { status: "accepted" as const };
  },
});

export const submitFromStaff = staffSessionMutation({
  args: {
    comment: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = submitFeatureRequestSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const existing = await ctx.db
      .query("featureRequests")
      .withIndex("by_staffId_and_requestId", (q) =>
        q.eq("staffId", ctx.staff._id).eq("requestId", parsed.data.requestId),
      )
      .unique();
    if (existing) return { status: "accepted" as const };

    const shortLimit = await rateLimit(ctx, { name: "staffFeatureRequestShort", key: ctx.staff._id });
    if (!shortLimit.ok) {
      throw new ConvexError("少し時間をおいて、もう一度お試しください");
    }
    const dailyLimit = await rateLimit(ctx, { name: "staffFeatureRequestDaily", key: ctx.staff._id });
    if (!dailyLimit.ok) {
      throw new ConvexError("本日の送信回数が上限に達しました。時間をおいて、もう一度お試しください");
    }

    await ctx.db.insert("featureRequests", {
      shopId: ctx.shop._id,
      staffId: ctx.staff._id,
      comment: parsed.data.comment,
      requestId: parsed.data.requestId,
    });

    return { status: "accepted" as const };
  },
});
