import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerMutation } from "../_lib/functions";
import { generateUUID } from "../_lib/uuid";
import { getLegalConsentVersions } from "../legal/documents";
import { recordStaffLegalConsentSnapshot } from "../legal/service";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { getOrganizationBillingPolicy, requireOrganizationCapacity } from "../organizationBilling/service";
import {
  findActiveStaffByEmail,
  materializeOrganizationPeopleForStaffAddition,
  normalizeEmail,
  prepareOrganizationPeopleForStaffAddition,
  releasePendingInvitationReservationsForStaffAddition,
} from "../staff/service";
import { staffRegistrationFormSchema } from "./schemas";

const registrationRequestResultValidator = v.union(
  v.object({ status: v.literal("ok"), requestId: v.id("staffRegistrationRequests") }),
  v.object({ status: v.literal("already_registered") }),
  v.object({ status: v.literal("already_applied") }),
);
const registrationLinkResultValidator = v.object({ token: v.string(), registrationUrl: v.string() });

function registrationLinkUnavailableError() {
  return new ConvexError("登録リンクの有効期限が切れています");
}

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
  returns: registrationLinkResultValidator,
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
  returns: registrationRequestResultValidator,
  handler: async (ctx, args) => {
    const parsed = staffRegistrationFormSchema.safeParse({
      name: args.name,
      email: args.email,
      acceptedLegal: args.acceptedLegal,
    });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const links = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .take(2);
    if (links.length !== 1) {
      throw registrationLinkUnavailableError();
    }
    const link = links[0];
    if (link.revokedAt) {
      throw registrationLinkUnavailableError();
    }

    const shop = await ctx.db.get(link.shopId);
    if (!shop || shop.isDeleted) {
      throw registrationLinkUnavailableError();
    }
    if (shop.organizationId) {
      const organization = await ctx.db.get(shop.organizationId);
      const billingPolicy = await getOrganizationBillingPolicy(ctx, shop.organizationId);
      if (
        !organization ||
        organization.isDeleted ||
        shop.operatingStatus !== "active" ||
        (billingPolicy !== null && !billingPolicy.canWriteBusinessData)
      ) {
        // 公開Capabilityでは、店舗や契約の内部状態を区別できるエラーを返さない。
        throw registrationLinkUnavailableError();
      }
    } else if (shop.operatingStatus === "archived" || shop.operatingStatus === "planSuspended") {
      throw registrationLinkUnavailableError();
    }

    const name = parsed.data.name;
    const email = normalizeEmail(parsed.data.email);

    // 重複・申請済みは「想定内の利用フロー」なので throw せず status を返す。
    // throw すると Convex のログにエラーとして残ってしまうため、observability は warn で残す。
    // メールアドレスは生で残さず domain 部分のみログに含める（Dashboard 共有時の漏洩防止）。
    const logSkip = (reason: string) =>
      console.warn("[submitRegistrationRequest] skip", { reason, shopId: shop._id, emailDomain: email.split("@")[1] });

    const existingStaff = await findActiveStaffByEmail(ctx, shop._id, email);
    if (existingStaff) {
      logSkip("already_registered");
      return { status: "already_registered" as const };
    }

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_emailNormalized_status", (q) =>
        q.eq("shopId", shop._id).eq("emailNormalized", email).eq("status", "pending"),
      )
      .first();
    if (pendingRequest) {
      logSkip("already_applied");
      return { status: "already_applied" as const };
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
  returns: v.object({ staffId: v.id("staffs") }),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.shopId !== ctx.shop._id || request.status !== "pending") {
      throw new ConvexError("Not found");
    }

    const existingStaff = await findActiveStaffByEmail(ctx, ctx.shop._id, request.emailNormalized);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスは既に使用されています");
    }

    const organizationId = ctx.shop.organizationId;
    let organizationPersonId: Id<"organizationPeople"> | undefined;
    let staffSourceState: "new" | "activePerson" = "new";
    let staffName = request.name;
    let staffEmail = request.email;
    let staffEmailNormalized = request.emailNormalized;
    if (organizationId) {
      if (ctx.organization?._id !== organizationId) {
        throw new ConvexError("Not found");
      }
      const prepared = await prepareOrganizationPeopleForStaffAddition(ctx, {
        organizationId,
        shopId: ctx.shop._id,
        entries: [{ name: request.name, email: request.emailNormalized }],
        deferCapacityCheck: true,
      });
      // 同じ人物へのmanager招待が予約した枠を解放してから、実人物を加えた見込み人数を再検証する。
      // 後続が失敗すればmutation全体がrollbackされ、予約状態だけが変わることはない。
      await releasePendingInvitationReservationsForStaffAddition(ctx, organizationId, prepared);
      const additionalPeople = prepared.filter((entry) => entry.addsPersonToUsage).length;
      if (additionalPeople > 0) {
        await requireOrganizationCapacity(ctx, { organizationId, additionalPeople });
      }
      const [materialized] = await materializeOrganizationPeopleForStaffAddition(ctx, organizationId, prepared);
      if (!materialized) {
        throw new ConvexError("Not found");
      }
      organizationPersonId = materialized.personId;
      staffSourceState = materialized.personState === "active" ? "activePerson" : "new";
      staffName = materialized.name;
      staffEmail = materialized.email;
      staffEmailNormalized = materialized.email;
    }

    const staffId = await ctx.db.insert("staffs", {
      shopId: ctx.shop._id,
      ...(organizationId && organizationPersonId ? { organizationId, organizationPersonId } : {}),
      name: staffName,
      email: staffEmail,
      emailNormalized: staffEmailNormalized,
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

    if (organizationId) {
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: ctx.user._id,
        actorPersonId: ctx.organizationMember?.personId,
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        fromState: staffSourceState,
        toState: `active:${ctx.shop._id}:batch:1`,
        correlationId: `${organizationId}:staff-registration:${request._id}:staff`,
        occurredAt: reviewedAt,
      });
    }
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId,
      context: "registration_approved",
      ...notificationOrigin,
    });
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
      staffId,
      ...notificationOrigin,
    });

    return { staffId };
  },
});

export const rejectRequest = managerMutation({
  args: { requestId: v.id("staffRegistrationRequests") },
  returns: v.null(),
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
    return null;
  },
});
