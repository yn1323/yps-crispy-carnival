import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { authenticatedQuery } from "../_lib/functions";
import { getStaffLineAccount } from "../line/service";
import { getLegalDocumentsForAudience } from "./documents";
import { hasCurrentStaffLegalConsent, hasCurrentUserLegalConsent } from "./service";

const legalDocumentValidator = v.object({
  audience: v.union(v.literal("manager"), v.literal("staff")),
  kind: v.union(v.literal("terms"), v.literal("privacy")),
  title: v.string(),
  documentVersion: v.string(),
  requiredConsentVersion: v.string(),
  path: v.string(),
});

const legalDocumentsValidator = v.object({
  terms: legalDocumentValidator,
  privacy: legalDocumentValidator,
});

export const getManagerConsentStatus = authenticatedQuery({
  args: {},
  returns: v.object({
    required: v.boolean(),
    documents: legalDocumentsValidator,
  }),
  handler: async (ctx) => {
    const documents = getLegalDocumentsForAudience("manager");
    if (!ctx.identity || !ctx.user || ctx.user.isDeleted) {
      return {
        required: false,
        documents,
      };
    }

    return {
      required: !(await hasCurrentUserLegalConsent(ctx, ctx.user._id)),
      documents,
    };
  },
});

export const getStaffConsentPageData = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({ status: v.literal("expired"), documents: legalDocumentsValidator }),
    v.object({
      status: v.literal("accepted"),
      staffName: v.string(),
      shopName: v.string(),
      documents: legalDocumentsValidator,
    }),
    v.object({
      status: v.literal("ok"),
      staffName: v.string(),
      shopName: v.string(),
      expiresAt: v.number(),
      documents: legalDocumentsValidator,
    }),
  ),
  handler: async (ctx, { token }) => {
    const documents = getLegalDocumentsForAudience("staff");
    const tokenDocs = await ctx.db
      .query("legalConsentTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .take(2);
    if (tokenDocs.length !== 1) {
      return { status: "expired" as const, documents };
    }
    const tokenDoc = tokenDocs[0];
    if (tokenDoc.revokedAt || tokenDoc.expiresAt < Date.now()) {
      return { status: "expired" as const, documents };
    }

    const [staff, shop] = await Promise.all([ctx.db.get(tokenDoc.staffId), ctx.db.get(tokenDoc.shopId)]);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== tokenDoc.shopId ||
      !shop ||
      !(await isShopParentActive(ctx, shop))
    ) {
      return { status: "expired" as const, documents };
    }

    if (await hasCurrentStaffLegalConsent(ctx, staff._id)) {
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
  args: { staffId: v.id("staffs"), includeConsented: v.optional(v.boolean()) },
  handler: async (ctx, { staffId, includeConsented }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted) return null;
    if (!includeConsented && (await hasCurrentStaffLegalConsent(ctx, staff._id))) return null;

    const shop = await ctx.db.get(staff.shopId);
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;
    const lineAccount = await getStaffLineAccount(ctx, staff._id);

    return {
      staffId: staff._id,
      staffName: staff.name,
      staffEmail: staff.email,
      lineUserId: lineAccount?.lineUserId,
      lineFollowing: lineAccount?.following,
      shopId: shop._id,
      shopName: shop.name,
      documents: getLegalDocumentsForAudience("staff"),
    };
  },
});
