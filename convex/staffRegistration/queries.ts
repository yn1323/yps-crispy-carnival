import { v } from "convex/values";
import { query } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerQuery } from "../_lib/functions";
import { STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { getOrganizationBillingPolicy } from "../organizationBilling/service";

const staffLegalDocumentsValidator = v.object({
  terms: v.object({
    audience: v.literal("staff"),
    kind: v.literal("terms"),
    title: v.string(),
    documentVersion: v.string(),
    requiredConsentVersion: v.string(),
    path: v.string(),
  }),
  privacy: v.object({
    audience: v.literal("staff"),
    kind: v.literal("privacy"),
    title: v.string(),
    documentVersion: v.string(),
    requiredConsentVersion: v.string(),
    path: v.string(),
  }),
});

const registrationPageDataValidator = v.union(
  v.object({ status: v.literal("expired"), documents: staffLegalDocumentsValidator }),
  v.object({ status: v.literal("ok"), shopName: v.string(), documents: staffLegalDocumentsValidator }),
);

const registrationLinkValidator = v.object({ token: v.string(), registrationUrl: v.string() });

function buildRegistrationUrl(token: string) {
  return `${APP_URL}/staff/register?token=${token}`;
}

export const getRegistrationPageData = query({
  args: { token: v.string() },
  returns: registrationPageDataValidator,
  handler: async (ctx, { token }) => {
    const documents = getLegalDocumentsForAudience("staff");
    const links = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .take(2);
    if (links.length !== 1) return { status: "expired" as const, documents };
    const link = links[0];
    if (link.revokedAt) return { status: "expired" as const, documents };

    const shop = await ctx.db.get(link.shopId);
    if (!shop || shop.isDeleted) return { status: "expired" as const, documents };
    if (shop.organizationId) {
      const [organization, billingPolicy] = await Promise.all([
        ctx.db.get(shop.organizationId),
        getOrganizationBillingPolicy(ctx, shop.organizationId),
      ]);
      if (
        !organization ||
        organization.isDeleted ||
        shop.operatingStatus !== "active" ||
        (billingPolicy !== null && !billingPolicy.canWriteBusinessData)
      ) {
        return { status: "expired" as const, documents };
      }
    } else if (shop.operatingStatus === "archived" || shop.operatingStatus === "planSuspended") {
      return { status: "expired" as const, documents };
    }

    return {
      status: "ok" as const,
      shopName: shop.name,
      documents,
    };
  },
});

export const getPendingRequests = managerQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("staffRegistrationRequests"),
      name: v.string(),
      email: v.string(),
      createdAt: v.number(),
    }),
  ),
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
  returns: v.union(registrationLinkValidator, v.null()),
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
