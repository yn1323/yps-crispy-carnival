import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { authenticatedMutation, managerMutation, staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { sessionMatchesAccessKind } from "../_lib/staffAccess";
import { requireOrganizationActorForShop, requireOrganizationReadActor } from "../organization/access";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { requireOrganizationBusinessWrite } from "../organizationBilling/service";
import { submitFeatureRequestSchema } from "./schemas";

async function submitManagerFeatureRequest(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    target: { kind: "shop"; shopId: Id<"shops"> } | { kind: "organization"; organizationId: Id<"organizations"> };
    comment: string;
    requestId: string;
  },
) {
  const parsed = submitFeatureRequestSchema.safeParse({
    comment: args.comment,
    requestId: args.requestId,
  });
  if (!parsed.success) {
    throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }

  const existing = await ctx.db
    .query("featureRequests")
    .withIndex("by_userId_and_requestId", (q) => q.eq("userId", args.userId).eq("requestId", parsed.data.requestId))
    .unique();
  if (existing) return { status: "accepted" as const };

  const shortLimit = await rateLimit(ctx, { name: "featureRequestShort", key: args.userId });
  if (!shortLimit.ok) {
    throw new ConvexError("少し時間をおいて、もう一度お試しください。");
  }
  const dailyLimit = await rateLimit(ctx, { name: "featureRequestDaily", key: args.userId });
  if (!dailyLimit.ok) {
    throw new ConvexError("本日の送信回数が上限に達しました。\n少し時間をおいて、もう一度お試しください。");
  }

  await ctx.db.insert("featureRequests", {
    ...(args.target.kind === "shop" ? { shopId: args.target.shopId } : { organizationId: args.target.organizationId }),
    userId: args.userId,
    comment: parsed.data.comment,
    requestId: parsed.data.requestId,
  });

  return { status: "accepted" as const };
}

export const submit = managerMutation({
  args: {
    comment: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ status: v.literal("accepted") }),
  handler: async (ctx, args) =>
    await submitManagerFeatureRequest(ctx, {
      ...args,
      userId: ctx.user._id,
      target: { kind: "shop", shopId: ctx.shop._id },
    }),
});

/**
 * 認証済みappから、URLで確定した組織をcanonicalな認可境界にして要望を送信する。
 * 現在店舗が確定していれば店舗scope、未確定なら組織scopeとして保存する。
 */
export const submitForOrganization = authenticatedMutation({
  args: {
    expectedOrganizationId: v.id("organizations"),
    shopId: v.optional(v.id("shops")),
    comment: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ status: v.literal("accepted") }),
  handler: async (ctx, args) => {
    if (!ctx.user) throw new ConvexError("Not found");
    const user = ctx.user;

    if (args.shopId) {
      const actor = await requireOrganizationActorForShop(ctx, {
        user,
        shopId: args.shopId,
      });
      if (
        actor.organization._id !== args.expectedOrganizationId ||
        organizationShopOperatingStatus(actor.shop.operatingStatus) !== "active"
      ) {
        throw new ConvexError("Not found");
      }
      await requireOrganizationBusinessWrite(ctx, actor.organization._id);

      return await submitManagerFeatureRequest(ctx, {
        target: { kind: "shop", shopId: actor.shop._id },
        userId: user._id,
        comment: args.comment,
        requestId: args.requestId,
      });
    }

    const actor = await requireOrganizationReadActor(ctx, {
      user,
      organizationId: args.expectedOrganizationId,
    });
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);

    return await submitManagerFeatureRequest(ctx, {
      target: { kind: "organization", organizationId: actor.organization._id },
      userId: user._id,
      comment: args.comment,
      requestId: args.requestId,
    });
  },
});

export const submitFromStaff = staffSessionMutation({
  args: {
    comment: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ status: v.literal("accepted") }),
  handler: async (ctx, args) => {
    if (!sessionMatchesAccessKind(ctx.session, "submit")) {
      throw new ConvexError("Session expired");
    }

    const parsed = submitFeatureRequestSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
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
      throw new ConvexError("少し時間をおいて、もう一度お試しください。");
    }
    const dailyLimit = await rateLimit(ctx, { name: "staffFeatureRequestDaily", key: ctx.staff._id });
    if (!dailyLimit.ok) {
      throw new ConvexError("本日の送信回数が上限に達しました。\n少し時間をおいて、もう一度お試しください。");
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
