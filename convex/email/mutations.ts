import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { generateUUID } from "../_lib/uuid";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * マジックリンクトークンを生成してDBに保存
 * internalMutation — actions からのみ呼ばれる
 */
export const createMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const token = generateUUID();

    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      expiresAt: args.expiresAt ?? Date.now() + TWENTY_FOUR_HOURS_MS,
    });

    return { token };
  },
});
