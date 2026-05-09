import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { managerMutation } from "../_lib/functions";
import { generateUUID } from "../_lib/uuid";
import { LEGAL_CONSENT_TOKEN_TTL_MS } from "../constants";
import { hasCurrentLegalConsent, type LegalConsentMethod } from "./documents";
import { recordStaffLegalConsent, recordUserLegalConsent } from "./service";

export const createStaffConsentToken = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    expiresAt: v.optional(v.number()),
    method: v.optional(v.union(v.literal("staff_email_link"), v.literal("line_link_notice"))),
  },
  handler: async (ctx, args) => {
    const token = generateUUID();
    const expiresAt = args.expiresAt ?? Date.now() + LEGAL_CONSENT_TOKEN_TTL_MS;
    const method = args.method ?? "staff_email_link";
    await ctx.db.insert("legalConsentTokens", {
      staffId: args.staffId,
      shopId: args.shopId,
      token,
      method,
      expiresAt,
    });
    return { token, expiresAt };
  },
});

export const acceptStaffLegalConsent = mutation({
  args: {
    token: v.string(),
    acceptedLegal: v.literal(true),
  },
  handler: async (ctx, { token }) => {
    const tokenDoc = await ctx.db
      .query("legalConsentTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!tokenDoc || tokenDoc.expiresAt < Date.now() || tokenDoc.usedAt) {
      return { status: "expired" as const };
    }

    const [staff, shop] = await Promise.all([ctx.db.get(tokenDoc.staffId), ctx.db.get(tokenDoc.shopId)]);
    if (!staff || staff.isDeleted || !shop || shop.isDeleted) {
      return { status: "expired" as const };
    }

    // 有効な同意がすでにある場合でも token は使用済みにする。
    // 古いリンクを再利用できない状態に揃え、結果だけは成功として返す。
    if (!hasCurrentLegalConsent(staff, "staff")) {
      await recordStaffLegalConsent(ctx, {
        staffId: staff._id,
        shopId: shop._id,
        method: tokenDoc.method as LegalConsentMethod,
      });
    }
    await ctx.db.patch(tokenDoc._id, { usedAt: Date.now() });
    return { status: "ok" as const };
  },
});

export const acceptStaffLegalConsentFromLine = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== args.shopId) {
      throw new ConvexError("Not found");
    }
    if (hasCurrentLegalConsent(staff, "staff")) return { status: "already_accepted" as const };
    await recordStaffLegalConsent(ctx, {
      staffId: args.staffId,
      shopId: args.shopId,
      method: "line_link_notice",
    });
    return { status: "ok" as const };
  },
});

export const acceptManagerLegalConsent = managerMutation({
  args: {
    acceptedLegal: v.literal(true),
  },
  handler: async (ctx) => {
    if (hasCurrentLegalConsent(ctx.user, "manager")) {
      return { status: "already_accepted" as const };
    }

    await recordUserLegalConsent(ctx, {
      userId: ctx.user._id,
      shopId: ctx.shop._id,
      method: "manager_reconsent",
    });

    return { status: "ok" as const };
  },
});
