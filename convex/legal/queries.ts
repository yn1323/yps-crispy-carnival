import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { managerQuery } from "../_lib/functions";
import { getLegalDocumentsForAudience, hasCurrentLegalConsent } from "./documents";

export const getManagerConsentStatus = managerQuery({
  args: {},
  handler: async (ctx) => {
    const documents = getLegalDocumentsForAudience("manager");
    if (!ctx.user || !ctx.shop) {
      return {
        required: false,
        documents,
      };
    }

    return {
      required: !hasCurrentLegalConsent(ctx.user, "manager"),
      documents,
    };
  },
});

export const getStaffConsentPageData = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const documents = getLegalDocumentsForAudience("staff");
    const tokenDoc = await ctx.db
      .query("legalConsentTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return { status: "expired" as const, documents };
    }

    const [staff, shop] = await Promise.all([ctx.db.get(tokenDoc.staffId), ctx.db.get(tokenDoc.shopId)]);
    if (!staff || staff.isDeleted || !shop || shop.isDeleted) {
      return { status: "expired" as const, documents };
    }

    if (hasCurrentLegalConsent(staff, "staff")) {
      return {
        status: "accepted" as const,
        staffName: staff.name,
        shopName: shop.name,
        documents,
      };
    }

    if (tokenDoc.usedAt) {
      return { status: "expired" as const, documents };
    }

    return {
      status: "ok" as const,
      staffName: staff.name,
      shopName: shop.name,
      expiresAt: tokenDoc.expiresAt,
      documents,
    };
  },
});

export const getStaffConsentNotificationDataInternal = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted || hasCurrentLegalConsent(staff, "staff")) return null;

    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) return null;

    return {
      staffId: staff._id,
      staffName: staff.name,
      staffEmail: staff.email,
      lineUserId: staff.lineUserId,
      lineFollowing: staff.lineFollowing,
      shopId: shop._id,
      shopName: shop.name,
      documents: getLegalDocumentsForAudience("staff"),
    };
  },
});
