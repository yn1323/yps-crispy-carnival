import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerMutation } from "../_lib/functions";
import { generateUUID } from "../_lib/uuid";
import { getLegalConsentVersions } from "../legal/documents";
import { recordStaffLegalConsentSnapshot } from "../legal/service";
import { findActiveStaffByEmail, normalizeEmail } from "../staff/service";
import { staffRegistrationFormSchema } from "./schemas";

function buildRegistrationUrl(token: string) {
  return `${APP_URL}/staff/register?token=${token}`;
}

async function findActiveRegistrationLink(ctx: { db: MutationCtx["db"]; shop: Doc<"shops"> }) {
  const links = await ctx.db
    .query("shopRegistrationLinks")
    .withIndex("by_shopId", (q) => q.eq("shopId", ctx.shop._id))
    .take(10);
  return links.find((candidate) => !candidate.revokedAt) ?? null;
}

export const ensureShopRegistrationLink = managerMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await findActiveRegistrationLink(ctx);
    if (existing) {
      return {
        token: existing.token,
        registrationUrl: buildRegistrationUrl(existing.token),
      };
    }

    const token = generateUUID();
    await ctx.db.insert("shopRegistrationLinks", {
      shopId: ctx.shop._id,
      token,
      createdAt: Date.now(),
    });
    return {
      token,
      registrationUrl: buildRegistrationUrl(token),
    };
  },
});

export const submitRegistrationRequest = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    email: v.string(),
    acceptedLegal: v.boolean(),
  },
  handler: async (ctx, args) => {
    const parsed = staffRegistrationFormSchema.safeParse({
      name: args.name,
      email: args.email,
      acceptedLegal: args.acceptedLegal,
    });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const link = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!link || link.revokedAt) {
      throw new ConvexError("登録リンクの有効期限が切れています");
    }

    const shop = await ctx.db.get(link.shopId);
    if (!shop || shop.isDeleted) {
      throw new ConvexError("登録リンクの有効期限が切れています");
    }

    const name = parsed.data.name;
    const email = normalizeEmail(parsed.data.email);

    const existingStaff = await findActiveStaffByEmail(ctx, shop._id, email);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスはすでに登録されています");
    }

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_emailNormalized_status", (q) =>
        q.eq("shopId", shop._id).eq("emailNormalized", email).eq("status", "pending"),
      )
      .first();
    if (pendingRequest) {
      throw new ConvexError("このメールアドレスは申請済みです");
    }

    const versions = getLegalConsentVersions("staff");
    const now = Date.now();
    const requestId = await ctx.db.insert("staffRegistrationRequests", {
      shopId: shop._id,
      name,
      email,
      emailNormalized: email,
      status: "pending",
      ...versions,
      consentedAt: now,
      createdAt: now,
    });
    return { status: "ok" as const, requestId };
  },
});

export const approveRequest = managerMutation({
  args: { requestId: v.id("staffRegistrationRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.shopId !== ctx.shop._id || request.status !== "pending") {
      throw new ConvexError("Not found");
    }

    const existingStaff = await findActiveStaffByEmail(ctx, ctx.shop._id, request.emailNormalized);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスは既に使用されています");
    }

    const staffId = await ctx.db.insert("staffs", {
      shopId: ctx.shop._id,
      name: request.name,
      email: request.email,
      emailNormalized: request.emailNormalized,
      isDeleted: false,
    });

    await recordStaffLegalConsentSnapshot(ctx, {
      staffId,
      shopId: ctx.shop._id,
      method: "staff_registration",
      versions: {
        termsConsentVersion: request.termsConsentVersion,
        privacyConsentVersion: request.privacyConsentVersion,
        termsDocumentVersion: request.termsDocumentVersion,
        privacyDocumentVersion: request.privacyDocumentVersion,
      },
      consentedAt: request.consentedAt,
    });

    const reviewedAt = Date.now();
    await ctx.db.patch(request._id, {
      status: "approved",
      approvedStaffId: staffId,
      reviewedAt,
      reviewedByUserId: ctx.user._id,
    });

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId,
      context: "registration_approved",
    });
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
      staffId,
    });

    return { staffId };
  },
});

export const rejectRequest = managerMutation({
  args: { requestId: v.id("staffRegistrationRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.shopId !== ctx.shop._id || request.status !== "pending") {
      throw new ConvexError("Not found");
    }
    await ctx.db.patch(request._id, {
      status: "rejected",
      reviewedAt: Date.now(),
      reviewedByUserId: ctx.user._id,
    });
  },
});
