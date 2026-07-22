import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerMutation } from "../_lib/functions";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail } from "../_lib/validation";
import { STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalConsentVersions } from "../legal/documents";
import { recordStaffLegalConsentSnapshot } from "../legal/service";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { getOrganizationBillingPolicy, requireOrganizationCapacity } from "../organizationBilling/service";
import {
  findActiveStaffByEmail,
  materializeOrganizationPeopleForStaffAddition,
  prepareOrganizationPeopleForStaffAddition,
  releasePendingInvitationReservationsForStaffAddition,
} from "../staff/service";
import { staffRegistrationFormSchema } from "./schemas";

const registrationRequestResultValidator = v.object({ status: v.literal("accepted") });
const registrationRequestHttpResultValidator = v.object({
  status: v.union(v.literal("accepted"), v.literal("unavailable")),
});
const registrationLinkResultValidator = v.object({ token: v.string(), registrationUrl: v.string() });
const REGISTRATION_LINK_UNAVAILABLE_MESSAGE = "登録リンクの有効期限が切れています";

type SubmitRegistrationRequestArgs = {
  token: string;
  name: string;
  email: string;
  acceptedLegal: boolean;
};

function registrationLinkUnavailableError() {
  return new ConvexError(REGISTRATION_LINK_UNAVAILABLE_MESSAGE);
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

async function submitRegistrationRequestImpl(
  ctx: MutationCtx,
  args: SubmitRegistrationRequestArgs,
): Promise<{ status: "accepted" }> {
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

  // 公開入口では、登録済み・申請済み・上限到達を同じ応答にしてメールアドレスの存在を秘匿する。
  const acceptedResult = { status: "accepted" as const };

  const existingStaff = await findActiveStaffByEmail(ctx, shop._id, email);
  if (existingStaff) {
    return acceptedResult;
  }

  const pendingRequest = await ctx.db
    .query("staffRegistrationRequests")
    .withIndex("by_shopId_emailNormalized_status", (q) =>
      q.eq("shopId", shop._id).eq("emailNormalized", email).eq("status", "pending"),
    )
    .first();
  if (pendingRequest) {
    return acceptedResult;
  }

  const pendingRequests = await ctx.db
    .query("staffRegistrationRequests")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", shop._id).eq("status", "pending"))
    .take(STAFF_REGISTRATION_PENDING_LIMIT);
  if (pendingRequests.length >= STAFF_REGISTRATION_PENDING_LIMIT) {
    return acceptedResult;
  }

  const versions = getLegalConsentVersions("staff");
  const now = Date.now();
  await ctx.db.insert("staffRegistrationRequests", {
    shopId: shop._id,
    name,
    email,
    emailNormalized: email,
    status: "pending",
    ...versions,
    consentedAt: now,
    createdAt: now,
  });
  return acceptedResult;
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

/** Siteverifyへの外部callより先に、攻撃者が分散できない入口budgetを消費する。 */
export const checkSubmissionIngressRateLimit = internalMutation({
  args: { ipKey: v.optional(v.string()) },
  returns: v.object({ allowed: v.boolean() }),
  handler: async (ctx, args) => {
    const budgets = [
      { name: "staffRegistrationGlobalShort" as const, key: "global" },
      ...(args.ipKey
        ? [
            { name: "staffRegistrationIpShort" as const, key: args.ipKey },
            { name: "staffRegistrationIpDaily" as const, key: args.ipKey },
          ]
        : []),
    ];
    for (const budget of budgets) {
      const result = await checkRateLimit(ctx, budget);
      if (!result.ok) return { allowed: false };
    }
    for (const budget of budgets) {
      const result = await rateLimit(ctx, budget);
      if (!result.ok) return { allowed: false };
    }
    return { allowed: true };
  },
});

/** Turnstile通過後だけ、有効linkに紐づくlink・email budgetを消費する。 */
export const checkSubmissionRateLimit = internalMutation({
  args: {
    token: v.string(),
    emailKey: v.string(),
    linkKey: v.string(),
  },
  returns: v.object({ status: v.union(v.literal("allowed"), v.literal("rate_limited"), v.literal("unavailable")) }),
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .take(2);
    const hasActiveUniqueLink = links.length === 1 && !links[0]?.revokedAt;
    // 無効tokenごとにrate-limit stateを作らせない。link固有budgetはDBで有効性を確認できたtokenにだけ使う。
    if (!hasActiveUniqueLink) return { status: "unavailable" as const };
    const budgets = [
      { name: "staffRegistrationEmailShort" as const, key: args.emailKey },
      { name: "staffRegistrationEmailDaily" as const, key: args.emailKey },
      { name: "staffRegistrationLinkShort" as const, key: args.linkKey },
      { name: "staffRegistrationLinkDaily" as const, key: args.linkKey },
    ];

    for (const budget of budgets) {
      const result = await checkRateLimit(ctx, budget);
      if (!result.ok) return { status: "rate_limited" as const };
    }
    for (const budget of budgets) {
      const result = await rateLimit(ctx, budget);
      if (!result.ok) return { status: "rate_limited" as const };
    }
    return { status: "allowed" as const };
  },
});

// 匿名クライアントからは直接呼ばせず、HTTP ActionでOrigin、body、Turnstile、rate limitを通した後だけ実行する。
export const submitRegistrationRequest = internalMutation({
  args: {
    token: v.string(),
    name: v.string(),
    email: v.string(),
    acceptedLegal: v.boolean(),
  },
  returns: registrationRequestResultValidator,
  handler: submitRegistrationRequestImpl,
});

export const submitRegistrationRequestFromHttp = internalMutation({
  args: {
    token: v.string(),
    name: v.string(),
    email: v.string(),
    acceptedLegal: v.boolean(),
  },
  returns: registrationRequestHttpResultValidator,
  handler: async (ctx, args) => {
    try {
      return await submitRegistrationRequestImpl(ctx, args);
    } catch (error) {
      if (error instanceof ConvexError && error.data === REGISTRATION_LINK_UNAVAILABLE_MESSAGE) {
        return { status: "unavailable" as const };
      }
      throw error;
    }
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
