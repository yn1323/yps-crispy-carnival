import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import { generateUUID } from "../_lib/uuid";
import { getLegalConsentVersions, hasCurrentLegalConsent, type LegalConsentMethod } from "./documents";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type RecordStaffConsentArgs = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
  sourceRecruitmentId?: Id<"recruitments">;
};

type RecordUserConsentArgs = {
  userId: Id<"users">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
};

export async function recordStaffLegalConsent(ctx: MutationCtx, args: RecordStaffConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("staff");
  const legalConsent = {
    legalTermsVersion: versions.termsVersion,
    legalPrivacyVersion: versions.privacyVersion,
    legalConsentedAt: now,
    legalConsentMethod: args.method,
  };

  await ctx.db.patch(args.staffId, legalConsent);
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "staff",
    staffId: args.staffId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
    sourceRecruitmentId: args.sourceRecruitmentId,
  });

  return legalConsent;
}

export async function recordUserLegalConsent(ctx: MutationCtx, args: RecordUserConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("manager");
  const legalConsent = {
    legalTermsVersion: versions.termsVersion,
    legalPrivacyVersion: versions.privacyVersion,
    legalConsentedAt: now,
    legalConsentMethod: args.method,
  };

  await ctx.db.patch(args.userId, legalConsent);
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "user",
    userId: args.userId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
  });

  return legalConsent;
}

export const createStaffConsentToken = internalMutation({
  args: {
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    expiresAt: v.optional(v.number()),
    method: v.optional(v.union(v.literal("staff_email_link"), v.literal("line_link_notice"))),
  },
  handler: async (ctx, args) => {
    const token = generateUUID();
    const expiresAt = args.expiresAt ?? Date.now() + THIRTY_DAYS_MS;
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
