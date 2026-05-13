import { v } from "convex/values";
import { query } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerQuery } from "../_lib/functions";
import { STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalDocumentsForAudience } from "../legal/documents";

function buildRegistrationUrl(token: string) {
  return `${APP_URL}/staff/register?token=${token}`;
}

export const getRegistrationPageData = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const documents = getLegalDocumentsForAudience("staff");
    const link = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!link || link.revokedAt) return { status: "expired" as const, documents };

    const shop = await ctx.db.get(link.shopId);
    if (!shop || shop.isDeleted) return { status: "expired" as const, documents };

    return {
      status: "ok" as const,
      shopName: shop.name,
      documents,
    };
  },
});

export const getPendingRequests = managerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.shop) return [];
    const shop = ctx.shop;
    const requests = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", shop._id).eq("status", "pending"))
      .order("asc")
      .take(STAFF_REGISTRATION_PENDING_LIMIT);

    return requests.map((request) => ({
      _id: request._id,
      name: request.name,
      email: request.email,
      createdAt: request.createdAt,
    }));
  },
});

export const getActiveRegistrationLink = managerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.shop) return null;
    const shop = ctx.shop;
    const links = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .take(10);
    const link = links.find((candidate) => !candidate.revokedAt);
    if (!link) return null;
    return {
      token: link.token,
      registrationUrl: buildRegistrationUrl(link.token),
    };
  },
});
