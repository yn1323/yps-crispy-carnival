import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { getOrganizationInvitationSigningSecret } from "../_lib/config";
import { authenticatedMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { requireOrganizationActorForShop } from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { getOrganizationBillingState, organizationPersonCountsTowardPeopleLimit } from "../organization/service";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationCapacity,
  requireOrganizationPaidFeature,
} from "../organizationBilling/service";
import { normalizeEmail } from "../staff/service";
import { getOrganizationInvitationExpiresAt } from "./constants";
import { createOrganizationManagerInvitationSchema, organizationInvitationRequestSchema } from "./schemas";
import {
  getOrganizationInvitationPurpose,
  type OrganizationInvitationPurpose,
  resolveFreeManagerExchangeEligibility,
  resolveOrganizationInvitationEligibility,
} from "./service";
import { deriveInvitationToken, digestInvitationToken, invitationRateLimitKey } from "./token";

const invitationMutationResultValidator = v.object({
  status: v.union(v.literal("created"), v.literal("alreadyPending"), v.literal("revoked")),
  invitationId: v.id("organizationInvitations"),
});

const acceptInvitationResultValidator = v.union(
  v.object({ status: v.literal("accepted"), organizationId: v.id("organizations"), shopId: v.optional(v.id("shops")) }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("emailMismatch") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("conflict") }),
);

async function invitationRateKey(organizationId: Id<"organizations">, emailNormalized: string) {
  return invitationRateLimitKey(await digestInvitationToken(`${organizationId}:${emailNormalized}`));
}

async function requireNoOtherPendingFreeManagerExchange(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  now: number,
  excludedInvitationId?: Id<"organizationInvitations">,
) {
  const pendingInvitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "pending"))
    .collect();
  const hasOtherExchange = pendingInvitations.some(
    (invitation) =>
      invitation._id !== excludedInvitationId &&
      invitation.expiresAt > now &&
      getOrganizationInvitationPurpose(invitation) === "freeManagerExchange",
  );
  if (hasOtherExchange) throw new ConvexError("管理者交代の招待は一度に一件までです");
}

async function issueInvitation(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    inviterMember: Doc<"organizationMembers">;
    email: string;
    emailNormalized: string;
    purpose: OrganizationInvitationPurpose;
    reservedSeat: boolean;
    organizationBillingVersionAtOrigin?: number;
    predecessorInvitationId?: Id<"organizationInvitations">;
    now: number;
  },
) {
  const version = 1;
  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId: args.organization._id,
    email: args.email,
    emailNormalized: args.emailNormalized,
    tokenDigest: `pending:${generateUUID()}`,
    status: "pending",
    purpose: args.purpose,
    inviterMemberId: args.inviterMember._id,
    reservedSeat: args.reservedSeat,
    version,
    predecessorInvitationId: args.predecessorInvitationId,
    expiresAt: getOrganizationInvitationExpiresAt(args.now),
    createdAt: args.now,
    updatedAt: args.now,
  });
  const token = await deriveInvitationToken({
    invitationId,
    version,
    signingSecret: getOrganizationInvitationSigningSecret(),
  });
  await ctx.db.patch(invitationId, { tokenDigest: await digestInvitationToken(token) });
  const invitation = await ctx.db.get(invitationId);
  if (!invitation) throw new ConvexError("招待を作成できませんでした");

  await ctx.scheduler.runAt(invitation.expiresAt, internal.organizationInvitation.mutations.expire, {
    invitationId,
    expectedVersion: version,
    expectedExpiresAt: invitation.expiresAt,
  });
  await ctx.scheduler.runAfter(0, internal.organizationInvitation.actions.enqueueManagerInvitation, {
    invitationId,
    expectedVersion: version,
    ...(args.organizationBillingVersionAtOrigin !== undefined
      ? { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }
      : {}),
  });
  return invitation;
}

export const create = authenticatedMutation({
  args: { shopId: v.id("shops"), email: v.string(), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    const organization = actor.organization;
    const organizationMember = actor.member;
    await requireOrganizationBusinessWrite(ctx, organization._id);
    const parsed = createOrganizationManagerInvitationSchema.safeParse(args);
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    const emailNormalized = normalizeEmail(parsed.data.email);
    const requestKey = await toAuditRequestKey(parsed.data.requestId);
    const correlationId = `${organization._id}:manager-invite:create:${requestKey}`;
    const priorAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    const priorInvitationId = priorAudit?.targetId
      ? ctx.db.normalizeId("organizationInvitations", priorAudit.targetId)
      : null;
    if (priorInvitationId) return { status: "alreadyPending" as const, invitationId: priorInvitationId };

    const billingState = await getOrganizationBillingState(ctx, organization._id);
    const hasFreeEntitlement = Boolean(
      billingState && deriveOrganizationBillingPolicy(billingState.state).entitlementPlan === "free",
    );
    if (!hasFreeEntitlement) await requireOrganizationPaidFeature(ctx, organization._id);
    const pending = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
        q.eq("organizationId", organization._id).eq("emailNormalized", emailNormalized).eq("status", "pending"),
      )
      .take(2);
    if (pending.length > 1) throw new ConvexError("招待の状態を確認できません");
    const now = Date.now();
    if (pending[0]?.expiresAt > now) {
      const expectedPurpose = hasFreeEntitlement ? "freeManagerExchange" : "managerAddition";
      if (
        getOrganizationInvitationPurpose(pending[0]) !== expectedPurpose ||
        !(await resolveOrganizationInvitationEligibility(ctx, pending[0]))
      ) {
        throw new ConvexError("この招待は現在の契約では利用できません");
      }
      return { status: "alreadyPending" as const, invitationId: pending[0]._id };
    }
    const key = await invitationRateKey(organization._id, emailNormalized);
    const [shortLimit, dailyLimit] = await Promise.all([
      rateLimit(ctx, { name: "organizationManagerInviteCreateShort", key }),
      rateLimit(ctx, { name: "organizationManagerInviteCreateDaily", key }),
    ]);
    if (!shortLimit.ok || !dailyLimit.ok) throw new ConvexError("招待回数が多いため、時間をおいてお試しください");
    if (pending[0]) {
      await ctx.db.patch(pending[0]._id, {
        status: "expired",
        expiredAt: now,
        reservedSeat: false,
        version: pending[0].version + 1,
        updatedAt: now,
      });
    }

    let purpose: OrganizationInvitationPurpose = "managerAddition";
    let reservedSeat = false;
    if (hasFreeEntitlement) {
      const exchange = await resolveFreeManagerExchangeEligibility(ctx, {
        organizationId: organization._id,
        inviterMemberId: organizationMember._id,
        emailNormalized,
      });
      if (!exchange) {
        throw new ConvexError("Freeでは事業者内の既存スタッフとの管理者交代だけを招待できます");
      }
      await requireNoOtherPendingFreeManagerExchange(ctx, organization._id, now);
      await requireOrganizationCapacity(ctx, { organizationId: organization._id });
      purpose = "freeManagerExchange";
    } else {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", organization._id).eq("emailNormalized", emailNormalized),
        )
        .take(2);
      if (people.length > 1) throw new ConvexError("同じメールアドレスの利用者を一意に確認できません");
      const existingPerson = people[0];
      if (existingPerson?.status === "removed") {
        throw new ConvexError("削除済みの利用者です。利用者画面から再追加してください");
      }
      if (existingPerson) {
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", organization._id).eq("personId", existingPerson._id),
          )
          .take(2);
        if (members.length > 1) throw new ConvexError("管理者所属を一意に確認できません");
        if (members[0]?.status === "active") throw new ConvexError("この利用者はすでに管理者です");
      }

      reservedSeat = existingPerson
        ? !(await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, existingPerson._id))
        : true;
      await requireOrganizationCapacity(ctx, {
        organizationId: organization._id,
        additionalPeople: reservedSeat ? 1 : 0,
        additionalActiveManagers: 1,
      });
    }
    const invitation = await issueInvitation(ctx, {
      organization,
      inviterMember: organizationMember,
      email: parsed.data.email,
      emailNormalized,
      purpose,
      reservedSeat,
      ...(billingState ? { organizationBillingVersionAtOrigin: billingState.version } : {}),
      now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: organizationMember.userId,
      actorPersonId: organizationMember.personId,
      action: "organization.manager_invited",
      targetKind: "invitation",
      targetId: invitation._id,
      toState: purpose === "freeManagerExchange" ? "pendingFreeManagerExchange" : "pending",
      correlationId,
      occurredAt: now,
    });
    return { status: "created" as const, invitationId: invitation._id };
  },
});

export const revoke = authenticatedMutation({
  args: { shopId: v.id("shops"), invitationId: v.id("organizationInvitations"), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください");
    const requestKey = await toAuditRequestKey(parsed.data.requestId);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.organizationId !== actor.organization._id) throw new ConvexError("Not found");
    if (invitation.status === "revoked") return { status: "revoked" as const, invitationId: invitation._id };
    if (invitation.status !== "pending") throw new ConvexError("この招待は取り消せません");
    const now = Date.now();
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      revokedAt: now,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.manager_invitation_revoked",
      targetKind: "invitation",
      targetId: invitation._id,
      fromState: "pending",
      toState: "revoked",
      correlationId: `${actor.organization._id}:manager-invite:revoke:${requestKey}`,
      occurredAt: now,
    });
    return { status: "revoked" as const, invitationId: invitation._id };
  },
});

export const resend = authenticatedMutation({
  args: { shopId: v.id("shops"), invitationId: v.id("organizationInvitations"), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    const organization = actor.organization;
    const organizationMember = actor.member;
    await requireOrganizationBusinessWrite(ctx, organization._id);
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください");
    const requestKey = await toAuditRequestKey(parsed.data.requestId);
    const correlationId = `${organization._id}:manager-invite:resend:${requestKey}`;
    const priorAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    const priorInvitationId = priorAudit?.targetId
      ? ctx.db.normalizeId("organizationInvitations", priorAudit.targetId)
      : null;
    if (priorInvitationId) return { status: "alreadyPending" as const, invitationId: priorInvitationId };

    const oldInvitation = await ctx.db.get(args.invitationId);
    if (!oldInvitation || oldInvitation.organizationId !== organization._id) throw new ConvexError("Not found");
    if (oldInvitation.status !== "pending" && oldInvitation.status !== "expired") {
      throw new ConvexError("この招待は再送できません");
    }
    const now = Date.now();
    const wasExpired = oldInvitation.status === "expired" || oldInvitation.expiresAt <= now;
    const sameEmailPending = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
        q
          .eq("organizationId", organization._id)
          .eq("emailNormalized", oldInvitation.emailNormalized)
          .eq("status", "pending"),
      )
      .take(2);
    if (sameEmailPending.length > 1) throw new ConvexError("招待の状態を確認できません");
    const otherPending = sameEmailPending.find((invitation) => invitation._id !== oldInvitation._id);
    if (otherPending && otherPending.expiresAt > now) {
      return { status: "alreadyPending" as const, invitationId: otherPending._id };
    }
    if (otherPending) {
      await ctx.db.patch(otherPending._id, {
        status: "expired",
        expiredAt: now,
        reservedSeat: false,
        version: otherPending.version + 1,
        updatedAt: now,
      });
    }
    const eligibility = await resolveOrganizationInvitationEligibility(ctx, oldInvitation);
    if (!eligibility) throw new ConvexError("この招待は現在の契約では利用できません");
    const purpose = getOrganizationInvitationPurpose(oldInvitation);
    let reservedSeat = false;
    if (purpose === "freeManagerExchange") {
      await requireNoOtherPendingFreeManagerExchange(ctx, organization._id, now, oldInvitation._id);
      await requireOrganizationCapacity(ctx, { organizationId: organization._id });
    } else {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", organization._id).eq("emailNormalized", oldInvitation.emailNormalized),
        )
        .take(2);
      if (people.length > 1 || people[0]?.status === "removed") {
        throw new ConvexError("招待先の利用者を一意に確認できません");
      }
      if (people[0]) {
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", organization._id).eq("personId", people[0]._id),
          )
          .take(2);
        if (members.length > 1) throw new ConvexError("管理者所属を一意に確認できません");
        if (members[0]?.status === "active") throw new ConvexError("この利用者はすでに管理者です");
      }
      reservedSeat = people[0]
        ? !(await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, people[0]._id))
        : true;
      const existingReservationCounts = !wasExpired && oldInvitation.reservedSeat;
      await requireOrganizationCapacity(ctx, {
        organizationId: organization._id,
        additionalPeople: reservedSeat && !existingReservationCounts ? 1 : 0,
        additionalActiveManagers: 1,
      });
    }
    const key = await invitationRateKey(organization._id, oldInvitation.emailNormalized);
    const shortLimit = await rateLimit(ctx, { name: "organizationManagerInviteResendShort", key });
    if (!shortLimit.ok) throw new ConvexError("少し時間をおいて、もう一度お試しください");

    await ctx.db.patch(oldInvitation._id, {
      status: wasExpired ? "expired" : "revoked",
      ...(wasExpired ? { expiredAt: oldInvitation.expiredAt ?? now } : { revokedAt: now }),
      reservedSeat: false,
      version: oldInvitation.version + 1,
      updatedAt: now,
    });
    const invitation = await issueInvitation(ctx, {
      organization,
      inviterMember: organizationMember,
      email: oldInvitation.email,
      emailNormalized: oldInvitation.emailNormalized,
      purpose,
      reservedSeat,
      organizationBillingVersionAtOrigin: (await getOrganizationBillingState(ctx, organization._id))?.version,
      predecessorInvitationId: oldInvitation._id,
      now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: organizationMember.userId,
      actorPersonId: organizationMember.personId,
      action: "organization.manager_invitation_resent",
      targetKind: "invitation",
      targetId: invitation._id,
      fromState: wasExpired ? "expired" : "pending",
      toState: purpose === "freeManagerExchange" ? "pendingFreeManagerExchange" : "pending",
      correlationId,
      occurredAt: now,
    });
    return { status: "created" as const, invitationId: invitation._id };
  },
});

export const expire = internalMutation({
  args: {
    invitationId: v.id("organizationInvitations"),
    expectedVersion: v.number(),
    expectedExpiresAt: v.number(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (
      invitation?.status !== "pending" ||
      invitation.version !== args.expectedVersion ||
      invitation.expiresAt !== args.expectedExpiresAt ||
      Date.now() < invitation.expiresAt
    ) {
      return { changed: false };
    }
    const now = Date.now();
    await ctx.db.patch(invitation._id, {
      status: "expired",
      expiredAt: now,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
    return { changed: true };
  },
});

export const accept = authenticatedMutation({
  args: { token: v.string() },
  returns: acceptInvitationResultValidator,
  handler: async (ctx, args) => {
    if (args.token.length !== 43) return { status: "invalid" as const };
    const tokenDigest = await digestInvitationToken(args.token);
    const limit = await rateLimit(ctx, {
      name: "organizationManagerInviteAccept",
      key: invitationRateLimitKey(tokenDigest),
    });
    if (!limit.ok) return { status: "unavailable" as const };
    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", tokenDigest))
      .take(2);
    if (invitations.length !== 1) return { status: "invalid" as const };
    const invitation = invitations[0];
    if (invitation.status === "accepted") return { status: "used" as const };
    if (invitation.status === "revoked") return { status: "revoked" as const };
    if (invitation.status !== "pending") return { status: "expired" as const };
    if (invitation.expiresAt <= Date.now()) return { status: "expired" as const };

    const verifiedEmail =
      ctx.identity.emailVerified === true && ctx.identity.email ? normalizeEmail(ctx.identity.email) : null;
    if (!verifiedEmail || verifiedEmail !== invitation.emailNormalized) {
      return { status: "emailMismatch" as const };
    }
    const eligibility = await resolveOrganizationInvitationEligibility(ctx, invitation);
    if (!eligibility) return { status: "unavailable" as const };
    const { inviter } = eligibility;
    const purpose = getOrganizationInvitationPurpose(invitation);

    if (ctx.user?.isDeleted) return { status: "unavailable" as const };
    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("emailNormalized", verifiedEmail),
      )
      .take(2);
    if (people.length > 1 || people[0]?.status === "removed") return { status: "conflict" as const };
    if (people[0]?.userId && people[0].userId !== ctx.user?._id) return { status: "conflict" as const };
    const authenticatedUserId = ctx.user?._id;
    const peopleForUser = authenticatedUserId
      ? await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_userId", (q) =>
            q.eq("organizationId", invitation.organizationId).eq("userId", authenticatedUserId),
          )
          .take(2)
      : [];
    if (peopleForUser.length > 1 || (peopleForUser[0] && peopleForUser[0]._id !== people[0]?._id)) {
      return { status: "conflict" as const };
    }
    if (invitation.reservedSeat && people[0]) {
      // 既存人物を有効管理者へ変える直前に予約枠を実人数判定へ移す。
      // すでにstaff等で算入済みなら増分0、未算入ならcapacityへ1を渡す。
      await ctx.db.patch(invitation._id, { reservedSeat: false, updatedAt: Date.now() });
    }

    const existingMembers = people[0]
      ? await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", invitation.organizationId).eq("personId", people[0]._id),
          )
          .take(2)
      : [];
    if (existingMembers.length > 1) return { status: "conflict" as const };
    if (existingMembers[0]?.userId && existingMembers[0].userId !== ctx.user?._id) {
      return { status: "conflict" as const };
    }
    const existingPersonCounts = people[0]
      ? await organizationPersonCountsTowardPeopleLimit(ctx, invitation.organizationId, people[0]._id)
      : false;
    if (
      purpose === "freeManagerExchange" &&
      (!people[0] || eligibility.purpose !== "freeManagerExchange" || people[0]._id !== eligibility.targetPerson._id)
    ) {
      return { status: "conflict" as const };
    }
    const reservationCoversNewPerson = invitation.reservedSeat && !people[0];
    const capacity = await requireOrganizationCapacity(ctx, {
      organizationId: invitation.organizationId,
      additionalPeople: (!people[0] || !existingPersonCounts) && !reservationCoversNewPerson ? 1 : 0,
      additionalActiveManagers: purpose === "freeManagerExchange" || existingMembers[0]?.status === "active" ? 0 : 1,
    }).catch(() => null);
    if (!capacity) return { status: "unavailable" as const };

    const userId = ctx.user
      ? ctx.user._id
      : await ctx.db.insert("users", {
          authTokenIdentifier: ctx.identity.tokenIdentifier,
          name: ctx.identity.name ?? verifiedEmail.split("@", 1)[0],
          email: verifiedEmail,
          emailNormalized: verifiedEmail,
          role: "manager",
          isDeleted: false,
        });
    if (ctx.user) {
      await ctx.db.patch(ctx.user._id, { email: verifiedEmail, emailNormalized: verifiedEmail });
    }

    const now = Date.now();
    const personId = people[0]
      ? people[0]._id
      : await ctx.db.insert("organizationPeople", {
          organizationId: invitation.organizationId,
          userId,
          name: ctx.user?.name || ctx.identity.name || verifiedEmail.split("@", 1)[0],
          email: verifiedEmail,
          emailNormalized: verifiedEmail,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
    if (people[0] && !people[0].userId) {
      await ctx.db.patch(people[0]._id, { userId, updatedAt: now });
    }

    const member = existingMembers[0];
    if (!member) {
      await ctx.db.insert("organizationMembers", {
        organizationId: invitation.organizationId,
        personId,
        userId,
        status: "active",
        invitedByMemberId: inviter._id,
        createdAt: now,
        updatedAt: now,
      });
    } else if (member.status !== "active") {
      await ctx.db.patch(member._id, { status: "active", invitedByMemberId: inviter._id, updatedAt: now });
    }

    if (purpose === "freeManagerExchange") {
      if (eligibility.purpose !== "freeManagerExchange") return { status: "conflict" as const };
      await ctx.db.patch(inviter._id, { status: "readOnly", updatedAt: now });
      await ctx.db.patch(eligibility.billingState._id, {
        freeManagerPersonId: personId,
        version: eligibility.billingState.version + 1,
        updatedAt: now,
      });
      await recordOrganizationAuditEvent(ctx, {
        organizationId: invitation.organizationId,
        actorUserId: userId,
        actorPersonId: personId,
        action: "organization.free_selection_changed",
        targetKind: "billing",
        targetId: eligibility.billingState._id,
        fromState: `manager:${inviter.personId}`,
        toState: `manager:${personId}`,
        correlationId: `${invitation._id}:free-manager-exchange:${invitation.version}`,
        occurredAt: now,
      });
    }

    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", invitation.organizationId))
      .collect();
    for (const shop of shops) {
      if (shop.isDeleted) continue;
      const legacyMemberships = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", userId).eq("shopId", shop._id))
        .take(2);
      if (legacyMemberships.length > 1) throw new ConvexError("所属を一意に確認できません");
      if (!legacyMemberships[0]) {
        await ctx.db.insert("shopMembers", { shopId: shop._id, userId, role: "manager", isDeleted: false });
      } else if (legacyMemberships[0].isDeleted) {
        await ctx.db.patch(legacyMemberships[0]._id, { isDeleted: false });
      }
    }

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByPersonId: personId,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: invitation.organizationId,
      actorUserId: userId,
      actorPersonId: personId,
      action: "organization.manager_invitation_accepted",
      targetKind: "invitation",
      targetId: invitation._id,
      fromState: "pending",
      toState: "accepted",
      correlationId: `${invitation._id}:accept:${invitation.version}`,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.organizationInvitation.actions.enqueueAcceptanceNotifications, {
      invitationId: invitation._id,
      expectedVersion: invitation.version + 1,
      organizationBillingVersionAtOrigin: capacity.billingState.version + (purpose === "freeManagerExchange" ? 1 : 0),
    });
    const firstActiveShop = shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "active");
    const firstReadableShop =
      firstActiveShop ??
      shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "planSuspended") ??
      shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "archived");
    return firstReadableShop
      ? { status: "accepted" as const, organizationId: invitation.organizationId, shopId: firstReadableShop._id }
      : { status: "accepted" as const, organizationId: invitation.organizationId };
  },
});
