import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { managerLimitRecoveryMutation, managerMutation } from "../_lib/functions";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail } from "../_lib/validation";
import { STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalConsentVersions } from "../legal/documents";
import { recordStaffLegalConsentSnapshot } from "../legal/service";
import { getOrganizationPersonLineState, resolveOrganizationPersonLineInheritanceRecipient } from "../line/service";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { syncActivatedOrganizationStaffOrder } from "../organization/staffOrder";
import { requireOrganizationCapacity } from "../organizationBilling/service";
import {
  findActiveStaffByEmail,
  materializeOrganizationPeopleForStaffAddition,
  prepareOrganizationPeopleForStaffAddition,
  releasePendingInvitationReservationsForStaffAddition,
} from "../staff/service";
import { resolveStaffRegistrationCapability } from "./capability";
import { staffRegistrationFormSchema } from "./schemas";
import { resolveStaffRegistrationApprovalAvailability, STAFF_REGISTRATION_APPROVAL_DISABLED_REASON } from "./service";

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
    throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }

  const shop = await resolveStaffRegistrationCapability(ctx, args.token);
  if (!shop) throw registrationLinkUnavailableError();

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

  // HTTP Actionの事前確認後に課金状態や利用数が変わっていても、PIIを書き込む直前の正本で閉じる。
  const writableShop = await resolveStaffRegistrationCapability(ctx, args.token);
  if (!writableShop || writableShop._id !== shop._id) {
    throw registrationLinkUnavailableError();
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
    const shop = await resolveStaffRegistrationCapability(ctx, args.token);
    // 利用不能なcapabilityごとにrate-limit stateを作らせず、link固有budgetは申請可能な店舗だけに使う。
    if (!shop) return { status: "unavailable" as const };
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

    const organizationId = ctx.shop.organizationId;
    if (organizationId) {
      if (ctx.organization?._id !== organizationId) {
        throw new ConvexError("Not found");
      }
      const approvalAvailability = await resolveStaffRegistrationApprovalAvailability(ctx, {
        organizationId,
        targetShopId: ctx.shop._id,
        emailNormalized: request.emailNormalized,
      });
      if (!approvalAvailability.canApprove) {
        throw new ConvexError(
          approvalAvailability.approveDisabledReason ?? STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
        );
      }
    }

    const existingStaff = await findActiveStaffByEmail(ctx, ctx.shop._id, request.emailNormalized);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスはすでに使用されています。");
    }

    let organizationPersonId: Id<"organizationPeople"> | undefined;
    let reactivatedPersonId: Id<"organizationPeople"> | undefined;
    let staffSourceState: "new" | "activePerson" | "removedPerson" = "new";
    let staffName = request.name;
    let staffEmail = request.email;
    let staffEmailNormalized = request.emailNormalized;
    if (organizationId) {
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
      reactivatedPersonId = materialized.reactivated ? materialized.personId : undefined;
      staffSourceState = materialized.reactivated
        ? "removedPerson"
        : materialized.personState === "active"
          ? "activePerson"
          : "new";
      staffName = materialized.name;
      staffEmail = materialized.email;
      staffEmailNormalized = materialized.email;
    }

    let lineState: Awaited<ReturnType<typeof getOrganizationPersonLineState>> = null;
    let lineRecipient: Awaited<ReturnType<typeof resolveOrganizationPersonLineInheritanceRecipient>> = null;
    if (organizationId && organizationPersonId) {
      lineRecipient = await resolveOrganizationPersonLineInheritanceRecipient(ctx, {
        organizationId,
        organizationPersonId,
      });
      lineState = await getOrganizationPersonLineState(ctx, { organizationId, organizationPersonId });
      if (!lineState) {
        throw new ConvexError("スタッフのLINE連携状態を確認できません。\n画面を更新して、もう一度お試しください。");
      }
      const expectedStatus = lineRecipient
        ? lineRecipient.following
          ? "linked_following"
          : "linked_unfollowed"
        : "unlinked";
      if (
        lineState.status !== expectedStatus ||
        (lineRecipient !== null && lineRecipient.authority !== lineState.authority)
      ) {
        throw new ConvexError("スタッフのLINE連携状態を確認できません。\n画面を更新して、もう一度お試しください。");
      }
    }

    // TODO[narrow]: 全deploymentでm025/m027完走・staff readiness 0確認後、canonical IDsを必須にする。
    const staffId = await ctx.db.insert("staffs", {
      shopId: ctx.shop._id,
      ...(organizationId && organizationPersonId ? { organizationId, organizationPersonId } : {}),
      name: staffName,
      email: staffEmail,
      emailNormalized: staffEmailNormalized,
      excludedFromShift: false,
      isDeleted: false,
    });
    if (organizationId) {
      await syncActivatedOrganizationStaffOrder(ctx, { organizationId });
    }
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
      const correlationBase = `${organizationId}:staff-registration:${request._id}`;
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: ctx.user._id,
        actorPersonId: ctx.organizationMember?.personId,
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        fromState: staffSourceState,
        toState: `active:${ctx.shop._id}:batch:1`,
        correlationId: `${correlationBase}:staff`,
        occurredAt: reviewedAt,
        analyticsEvent: {
          eventType: "staffMembership.changed",
          shopId: ctx.shop._id,
          subjectId: staffId,
          payload: {
            kind: "staffMembership",
            staffId,
            ...(organizationPersonId ? { organizationPersonId } : {}),
            ...(organizationPersonId ? { personFirstObservedAt: reviewedAt } : {}),
            status: "active",
            isShiftTarget: true,
            validFrom: reviewedAt,
            lineLinked: lineState !== null && lineState.status !== "unlinked",
            lineFollowing: lineState?.status === "linked_following",
          },
        },
      });
      if (reactivatedPersonId) {
        await recordOrganizationAuditEvent(ctx, {
          organizationId,
          actorUserId: ctx.user._id,
          actorPersonId: ctx.organizationMember?.personId,
          action: "organization.person_reactivated",
          targetKind: "person",
          targetId: reactivatedPersonId,
          fromState: "removed",
          toState: "active",
          correlationId: `${correlationBase}:person:${reactivatedPersonId}`,
          occurredAt: reviewedAt,
          suppressAnalyticsEvent: true,
        });
      }
    }
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

    if (!lineRecipient) {
      await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
        staffId,
        ...(organizationPersonId && lineState
          ? {
              organizationPersonId,
              lineLinkGenerationAtSchedule: lineState.generation,
            }
          : {}),
        context: "registration_approved",
        ...notificationOrigin,
      });
    }
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
      staffId,
      ...notificationOrigin,
    });

    return { staffId };
  },
});

export const rejectRequest = managerLimitRecoveryMutation("rejectStaffRegistrationRequest")({
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
