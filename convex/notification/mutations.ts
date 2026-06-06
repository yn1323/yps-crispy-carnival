import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { staffAccessKindValidator } from "../_lib/staffAccess";
import { generateUUID } from "../_lib/uuid";
import { MAGIC_LINK_DEFAULT_TTL_MS } from "../constants";

/**
 * マジックリンクトークンを生成してDBに保存
 * internalMutation — actions からのみ呼ばれる
 */
export const createMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    accessKind: staffAccessKindValidator,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const token = generateUUID();

    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      accessKind: args.accessKind,
      expiresAt: args.expiresAt ?? Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
    });

    return { token };
  },
});

/**
 * submitリンクは通知経路が違っても同じURLを使い回す。
 * 確定シフト閲覧の view リンクはワンタイム制御があるため、この関数では扱わない。
 */
export const getOrCreateSubmitMagicLink = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existingLinks = await ctx.db
      .query("magicLinks")
      .withIndex("by_staffId_recruitmentId_accessKind", (q) =>
        q.eq("staffId", args.staffId).eq("recruitmentId", args.recruitmentId).eq("accessKind", "submit"),
      )
      .collect();
    const existing = existingLinks.find((link) => !link.revokedAt);

    if (existing) {
      if (existing.expiresAt !== args.expiresAt) {
        await ctx.db.patch(existing._id, { expiresAt: args.expiresAt });
      }
      return { token: existing.token };
    }

    const token = generateUUID();

    await ctx.db.insert("magicLinks", {
      token,
      staffId: args.staffId,
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      accessKind: "submit",
      expiresAt: args.expiresAt,
    });

    return { token };
  },
});

export const markReminderSent = internalMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") return null;
    await ctx.db.patch(args.recruitmentId, { lastReminderSentAt: args.sentAt });
    return null;
  },
});
