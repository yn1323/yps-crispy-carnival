import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { getOrganizationInvitationSigningSecret, isManagerInvitationEnabled } from "../_lib/config";
import { authenticatedMutation } from "../_lib/functions";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail } from "../_lib/validation";
import { cancelOrganizationRecipientBusinessNotifications } from "../notificationOutbox/mutations";
import { requireOrganizationActorForShop } from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import {
  getOrganizationBillingState,
  organizationPersonCountsTowardPeopleLimit,
  removeLegacyOrganizationManagerAccess,
} from "../organization/service";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationCapacity,
  requireOrganizationPaidFeature,
} from "../organizationBilling/service";
import { getActiveStaffInShop } from "../staff/service";
import { getOrganizationInvitationExpiresAt } from "./constants";
import {
  getOrganizationInvitationLinkedByPersonId,
  isOrganizationInvitationIssued,
  isOrganizationInvitationLinked,
} from "./lifecycle";
import { getOrganizationInvitationPurpose, type OrganizationInvitationPurpose } from "./purpose";
import {
  createExternalOrganizationManagerInvitationSchema,
  createOrganizationManagerInvitationSchema,
  organizationInvitationRequestSchema,
} from "./schemas";
import { resolveFreeManagerExchangeEligibility, resolveOrganizationInvitationEligibility } from "./service";
import { deriveInvitationToken, digestInvitationToken, invitationRateLimitKey } from "./token";

const invitationMutationResultValidator = v.object({
  status: v.union(v.literal("created"), v.literal("alreadyPending"), v.literal("revoked")),
  invitationId: v.id("organizationInvitations"),
});

const invitationIssueResultValidator = v.object({
  status: v.union(v.literal("issued"), v.literal("alreadyIssued")),
  invitationId: v.id("organizationInvitations"),
});

function toInvitationIssueResult(result: {
  status: "created" | "alreadyPending";
  invitationId: Id<"organizationInvitations">;
}) {
  return {
    status: result.status === "created" ? ("issued" as const) : ("alreadyIssued" as const),
    invitationId: result.invitationId,
  };
}

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

const linkAccountResultValidator = v.union(
  v.object({ status: v.literal("linked"), organizationId: v.id("organizations"), shopId: v.optional(v.id("shops")) }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("emailMismatch") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("conflict") }),
);

const MANAGER_INVITATION_UNAVAILABLE_MESSAGE = "管理者の招待は現在ご利用いただけません";

function requireManagerInvitationEnabled() {
  if (!isManagerInvitationEnabled()) throw new ConvexError(MANAGER_INVITATION_UNAVAILABLE_MESSAGE);
}

type OrganizationInvitationLinkCtx = MutationCtx & {
  identity: UserIdentity;
  user: Doc<"users"> | null;
};

async function invitationRateKey(organizationId: Id<"organizations">, emailNormalized: string) {
  return invitationRateLimitKey(await digestInvitationToken(`${organizationId}:${emailNormalized}`));
}

async function invitationAcceptActorRateKey(identity: UserIdentity) {
  return invitationRateLimitKey(await digestInvitationToken(`actor:${identity.tokenIdentifier}`));
}

async function requireInvitationResendBudget(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  emailNormalized: string,
) {
  const key = await invitationRateKey(organizationId, emailNormalized);
  const limits = [
    { name: "organizationManagerInviteResendShort", key },
    { name: "organizationManagerInviteResendDaily", key },
  ] as const;
  const statuses = await Promise.all(limits.map(async (limit) => await checkRateLimit(ctx, limit)));
  if (statuses.some((status) => !status.ok)) {
    throw new ConvexError(
      "招待回数が多いため、送信を一時制限しています。\n少し時間をおいてから、もう一度お試しください。",
    );
  }

  for (const limit of limits) {
    const consumed = await rateLimit(ctx, limit);
    if (!consumed.ok) {
      // 同じtransaction内の確認後なので通常は到達しない。throwして先行consumeもrollbackする。
      throw new Error("Organization invitation resend rate limit changed during consumption");
    }
  }
}

async function requireNoOtherPendingFreeManagerExchange(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  now: number,
  excludedInvitationId?: Id<"organizationInvitations">,
) {
  const pendingInvitations = (
    await Promise.all(
      (["issued", "pending"] as const).map((status) =>
        ctx.db
          .query("organizationInvitations")
          .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
          .collect(),
      ),
    )
  ).flat();
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
    invitedName?: string;
    purpose: OrganizationInvitationPurpose;
    reservedSeat: boolean;
    organizationBillingVersionAtOrigin?: number;
    predecessorInvitationId?: Id<"organizationInvitations">;
    targetPersonId?: Id<"organizationPeople">;
    now: number;
  },
) {
  const version = 1;
  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId: args.organization._id,
    email: args.email,
    emailNormalized: args.emailNormalized,
    invitedName: args.invitedName ?? args.email.split("@", 1)[0],
    tokenDigest: `issuing:${generateUUID()}`,
    status: "issued",
    purpose: args.purpose,
    inviterMemberId: args.inviterMember._id,
    ...(args.targetPersonId ? { targetPersonId: args.targetPersonId } : {}),
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

async function reissueActiveInvitation(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    inviterMember: Doc<"organizationMembers">;
    oldInvitation: Doc<"organizationInvitations">;
    invitedName?: string;
    targetPersonId?: Id<"organizationPeople">;
    organizationBillingVersionAtOrigin?: number;
    correlationId: string;
    now: number;
  },
) {
  await requireInvitationResendBudget(ctx, args.organization._id, args.oldInvitation.emailNormalized);

  await ctx.db.patch(args.oldInvitation._id, {
    status: "revoked",
    revokedAt: args.now,
    reservedSeat: false,
    version: args.oldInvitation.version + 1,
    updatedAt: args.now,
  });

  const purpose = getOrganizationInvitationPurpose(args.oldInvitation);
  const invitation = await issueInvitation(ctx, {
    organization: args.organization,
    inviterMember: args.inviterMember,
    email: args.oldInvitation.email,
    emailNormalized: args.oldInvitation.emailNormalized,
    invitedName: args.invitedName ?? args.oldInvitation.invitedName,
    purpose,
    reservedSeat: args.oldInvitation.reservedSeat,
    ...(args.organizationBillingVersionAtOrigin !== undefined
      ? { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }
      : {}),
    predecessorInvitationId: args.oldInvitation._id,
    ...(args.targetPersonId ? { targetPersonId: args.targetPersonId } : {}),
    now: args.now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: args.organization._id,
    actorUserId: args.inviterMember.userId,
    actorPersonId: args.inviterMember.personId,
    action: "organization.manager_invitation_resent",
    targetKind: "invitation",
    targetId: invitation._id,
    fromState: "issued",
    toState: purpose === "freeManagerExchange" ? "issuedFreeManagerExchange" : "issued",
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
  return invitation;
}

async function createManagerInvitation(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    inviterMember: Doc<"organizationMembers">;
    email: string;
    invitedName?: string;
    requestId: string;
    targetPerson?: Doc<"organizationPeople">;
    reissueExisting?: boolean;
  },
) {
  // 新しい発行入口が増えても公開フラグを迂回しないよう、public handlerに加えて共通処理でも閉じる。
  requireManagerInvitationEnabled();
  const { organization, inviterMember } = args;
  let targetPerson = args.targetPerson;
  await requireOrganizationBusinessWrite(ctx, organization._id);
  const emailNormalized = normalizeEmail(args.email);
  if (
    targetPerson &&
    (targetPerson.organizationId !== organization._id ||
      targetPerson.status !== "active" ||
      targetPerson.emailNormalized !== emailNormalized)
  ) {
    throw new ConvexError("Not found");
  }

  if (!targetPerson) {
    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", organization._id).eq("emailNormalized", emailNormalized),
      )
      .take(2);
    if (people.length > 1) {
      throw new ConvexError(
        "同じメールアドレスのユーザーが複数見つかりました。\nグループのユーザー情報を確認してください。",
      );
    }
    if (people[0]?.status === "removed") {
      throw new ConvexError("このユーザーは削除済みです。\nユーザー画面から再追加してください。");
    }
    targetPerson = people[0];
  }

  const requestKey = await toAuditRequestKey(args.requestId);
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

  const now = Date.now();
  const pendingByEmail = (
    await Promise.all(
      (["issued", "pending"] as const).map((status) =>
        ctx.db
          .query("organizationInvitations")
          .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
            q.eq("organizationId", organization._id).eq("emailNormalized", emailNormalized).eq("status", status),
          )
          .collect(),
      ),
    )
  ).flat();
  const pendingForTarget = targetPerson
    ? (
        await Promise.all(
          (["issued", "pending"] as const).map((status) =>
            ctx.db
              .query("organizationInvitations")
              .withIndex("by_organizationId_and_targetPersonId_and_status", (q) =>
                q.eq("organizationId", organization._id).eq("targetPersonId", targetPerson._id).eq("status", status),
              )
              .collect(),
          ),
        )
      ).flat()
    : [];
  const activeByEmail = pendingByEmail.filter((invitation) => invitation.expiresAt > now);
  const activeForTarget = pendingForTarget.filter((invitation) => invitation.expiresAt > now);
  if (activeByEmail.length > 1 || activeForTarget.length > 1) {
    throw new ConvexError("招待の状態を確認できません");
  }

  const currentEmailInvitation = activeByEmail[0];
  const staleTargetInvitation = activeForTarget.find((invitation) => invitation.emailNormalized !== emailNormalized);
  if (currentEmailInvitation && staleTargetInvitation && currentEmailInvitation._id !== staleTargetInvitation._id) {
    throw new ConvexError("招待の状態を確認できません");
  }

  const expectedPurpose: OrganizationInvitationPurpose = hasFreeEntitlement ? "freeManagerExchange" : "managerAddition";
  if (currentEmailInvitation) {
    if (
      (targetPerson &&
        currentEmailInvitation.targetPersonId &&
        currentEmailInvitation.targetPersonId !== targetPerson._id) ||
      getOrganizationInvitationPurpose(currentEmailInvitation) !== expectedPurpose
    ) {
      throw new ConvexError("この招待は現在の契約では利用できません");
    }
    const invitationForEligibility = targetPerson
      ? { ...currentEmailInvitation, targetPersonId: targetPerson._id }
      : currentEmailInvitation;
    if (!(await resolveOrganizationInvitationEligibility(ctx, invitationForEligibility))) {
      throw new ConvexError("この招待は現在の契約では利用できません");
    }
    if (!args.reissueExisting) {
      if (targetPerson && !currentEmailInvitation.targetPersonId) {
        await ctx.db.patch(currentEmailInvitation._id, { targetPersonId: targetPerson._id, updatedAt: now });
      }
      return { status: "alreadyPending" as const, invitationId: currentEmailInvitation._id };
    }
    const targetPersonId = targetPerson?._id ?? currentEmailInvitation.targetPersonId;
    const invitation = await reissueActiveInvitation(ctx, {
      organization,
      inviterMember,
      oldInvitation: currentEmailInvitation,
      invitedName: args.invitedName ?? targetPerson?.name ?? currentEmailInvitation.invitedName,
      ...(targetPersonId ? { targetPersonId } : {}),
      ...(billingState ? { organizationBillingVersionAtOrigin: billingState.version } : {}),
      correlationId,
      now,
    });
    return { status: "created" as const, invitationId: invitation._id };
  }

  const key = await invitationRateKey(organization._id, emailNormalized);
  const [shortLimit, dailyLimit] = await Promise.all([
    rateLimit(ctx, { name: "organizationManagerInviteCreateShort", key }),
    rateLimit(ctx, { name: "organizationManagerInviteCreateDaily", key }),
  ]);
  if (!shortLimit.ok || !dailyLimit.ok) {
    throw new ConvexError(
      "招待回数が多いため、送信を一時制限しています。\n少し時間をおいてから、もう一度お試しください。",
    );
  }

  let purpose: OrganizationInvitationPurpose = "managerAddition";
  let reservedSeat = false;
  if (hasFreeEntitlement) {
    const exchange = await resolveFreeManagerExchangeEligibility(ctx, {
      organizationId: organization._id,
      inviterMemberId: inviterMember._id,
      emailNormalized,
      ...(targetPerson ? { targetPersonId: targetPerson._id } : {}),
    });
    if (!exchange) {
      throw new ConvexError("無料プランでは、グループ内の既存スタッフへの管理者交代のみ行えます。");
    }
    await requireNoOtherPendingFreeManagerExchange(ctx, organization._id, now, staleTargetInvitation?._id);
    await requireOrganizationCapacity(ctx, { organizationId: organization._id });
    purpose = "freeManagerExchange";
  } else {
    const people = targetPerson ? [targetPerson] : [];
    if (people.length > 1) {
      throw new ConvexError(
        "同じメールアドレスのユーザーが複数見つかりました。\nグループのユーザー情報を確認してください。",
      );
    }
    const existingPerson = people[0];
    if (existingPerson?.status === "removed") {
      throw new ConvexError("このユーザーは削除済みです。\nユーザー画面から再追加してください。");
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
      ...(staleTargetInvitation ? { excludedInvitationId: staleTargetInvitation._id } : {}),
    });
  }

  const invitationsToExpire = new Map<Id<"organizationInvitations">, Doc<"organizationInvitations">>();
  for (const invitation of [...pendingByEmail, ...pendingForTarget]) {
    if (invitation.expiresAt <= now) invitationsToExpire.set(invitation._id, invitation);
  }
  for (const invitation of invitationsToExpire.values()) {
    await ctx.db.patch(invitation._id, {
      status: "expired",
      expiredAt: now,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
  }
  if (staleTargetInvitation) {
    await ctx.db.patch(staleTargetInvitation._id, {
      status: "revoked",
      revokedAt: now,
      reservedSeat: false,
      version: staleTargetInvitation.version + 1,
      updatedAt: now,
    });
  }

  const invitation = await issueInvitation(ctx, {
    organization,
    inviterMember,
    email: args.email,
    emailNormalized,
    invitedName: args.invitedName ?? targetPerson?.name ?? args.email.split("@", 1)[0],
    purpose,
    reservedSeat,
    ...(billingState ? { organizationBillingVersionAtOrigin: billingState.version } : {}),
    ...(staleTargetInvitation ? { predecessorInvitationId: staleTargetInvitation._id } : {}),
    ...(targetPerson ? { targetPersonId: targetPerson._id } : {}),
    now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: organization._id,
    actorUserId: inviterMember.userId,
    actorPersonId: inviterMember.personId,
    action: "organization.manager_invited",
    targetKind: "invitation",
    targetId: invitation._id,
    toState: purpose === "freeManagerExchange" ? "issuedFreeManagerExchange" : "issued",
    correlationId,
    occurredAt: now,
  });
  return { status: "created" as const, invitationId: invitation._id };
}

export const create = authenticatedMutation({
  args: { shopId: v.id("shops"), email: v.string(), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    requireManagerInvitationEnabled();
    const parsed = createOrganizationManagerInvitationSchema.safeParse(args);
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    return await createManagerInvitation(ctx, {
      organization: actor.organization,
      inviterMember: actor.member,
      email: parsed.data.email,
      requestId: parsed.data.requestId,
    });
  },
});

export const createExternal = authenticatedMutation({
  args: { shopId: v.id("shops"), name: v.string(), email: v.string(), requestId: v.string() },
  returns: invitationIssueResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    requireManagerInvitationEnabled();
    const parsed = createExternalOrganizationManagerInvitationSchema.safeParse(args);
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    const result = await createManagerInvitation(ctx, {
      organization: actor.organization,
      inviterMember: actor.member,
      invitedName: parsed.data.name,
      email: parsed.data.email,
      requestId: parsed.data.requestId,
      reissueExisting: true,
    });
    return toInvitationIssueResult(result);
  },
});

export const createForPerson = authenticatedMutation({
  args: { shopId: v.id("shops"), personId: v.id("organizationPeople"), requestId: v.string() },
  returns: invitationIssueResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    requireManagerInvitationEnabled();
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
    const targetPerson = await ctx.db.get(args.personId);
    if (
      !targetPerson ||
      targetPerson.organizationId !== actor.organization._id ||
      targetPerson.status !== "active" ||
      normalizeEmail(targetPerson.email) !== targetPerson.emailNormalized
    ) {
      throw new ConvexError("Not found");
    }
    const result = await createManagerInvitation(ctx, {
      organization: actor.organization,
      inviterMember: actor.member,
      email: targetPerson.email,
      requestId: parsed.data.requestId,
      targetPerson,
      reissueExisting: true,
    });
    return toInvitationIssueResult(result);
  },
});

export const createForStaff = authenticatedMutation({
  args: { shopId: v.id("shops"), staffId: v.id("staffs"), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    requireManagerInvitationEnabled();
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
    const staff = await getActiveStaffInShop(ctx, args.shopId, args.staffId);
    if (!staff?.organizationId || !staff.organizationPersonId || staff.organizationId !== actor.organization._id) {
      throw new ConvexError("Not found");
    }
    const targetPerson = await ctx.db.get(staff.organizationPersonId);
    if (
      !targetPerson ||
      targetPerson.organizationId !== actor.organization._id ||
      targetPerson.status !== "active" ||
      normalizeEmail(staff.email) !== targetPerson.emailNormalized ||
      normalizeEmail(targetPerson.email) !== targetPerson.emailNormalized
    ) {
      throw new ConvexError("Not found");
    }
    return await createManagerInvitation(ctx, {
      organization: actor.organization,
      inviterMember: actor.member,
      email: targetPerson.email,
      requestId: parsed.data.requestId,
      targetPerson,
      reissueExisting: true,
    });
  },
});

export const revoke = authenticatedMutation({
  args: { shopId: v.id("shops"), invitationId: v.id("organizationInvitations"), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
    const requestKey = await toAuditRequestKey(parsed.data.requestId);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.organizationId !== actor.organization._id) throw new ConvexError("Not found");
    if (invitation.status === "revoked") return { status: "revoked" as const, invitationId: invitation._id };
    if (!isOrganizationInvitationIssued(invitation)) throw new ConvexError("この招待は取り消せません");
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
      fromState: "issued",
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
    requireManagerInvitationEnabled();
    const organization = actor.organization;
    const organizationMember = actor.member;
    await requireOrganizationBusinessWrite(ctx, organization._id);
    const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
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
    if (!isOrganizationInvitationIssued(oldInvitation) && oldInvitation.status !== "expired") {
      throw new ConvexError("この招待は再送できません");
    }
    const now = Date.now();
    const wasExpired = oldInvitation.status === "expired" || oldInvitation.expiresAt <= now;
    const sameEmailPending = (
      await Promise.all(
        (["issued", "pending"] as const).map((status) =>
          ctx.db
            .query("organizationInvitations")
            .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("emailNormalized", oldInvitation.emailNormalized)
                .eq("status", status),
            )
            .take(2),
        ),
      )
    ).flat();
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
      await requireOrganizationCapacity(ctx, {
        organizationId: organization._id,
        additionalPeople: reservedSeat ? 1 : 0,
        additionalActiveManagers: 1,
        excludedInvitationId: oldInvitation._id,
      });
    }
    await requireInvitationResendBudget(ctx, organization._id, oldInvitation.emailNormalized);

    await ctx.db.patch(oldInvitation._id, {
      status: wasExpired ? "expired" : "revoked",
      ...(wasExpired ? { expiredAt: oldInvitation.expiredAt ?? now } : { revokedAt: now }),
      reservedSeat: false,
      version: oldInvitation.version + 1,
      updatedAt: now,
    });
    const currentBillingState = await getOrganizationBillingState(ctx, organization._id);
    const invitation = await issueInvitation(ctx, {
      organization,
      inviterMember: organizationMember,
      email: oldInvitation.email,
      emailNormalized: oldInvitation.emailNormalized,
      ...(oldInvitation.invitedName ? { invitedName: oldInvitation.invitedName } : {}),
      purpose,
      reservedSeat,
      ...(currentBillingState ? { organizationBillingVersionAtOrigin: currentBillingState.version } : {}),
      predecessorInvitationId: oldInvitation._id,
      ...(oldInvitation.targetPersonId ? { targetPersonId: oldInvitation.targetPersonId } : {}),
      now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: organizationMember.userId,
      actorPersonId: organizationMember.personId,
      action: "organization.manager_invitation_resent",
      targetKind: "invitation",
      targetId: invitation._id,
      fromState: wasExpired ? "expired" : "issued",
      toState: purpose === "freeManagerExchange" ? "issuedFreeManagerExchange" : "issued",
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
      !invitation ||
      !isOrganizationInvitationIssued(invitation) ||
      invitation.version !== args.expectedVersion ||
      invitation.expiresAt !== args.expectedExpiresAt ||
      Date.now() < invitation.expiresAt
    ) {
      return { changed: false };
    }
    const organization = await ctx.db.get(invitation.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
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

async function linkAccountWithToken(
  ctx: OrganizationInvitationLinkCtx,
  args: { token: string },
  options?: { linkedInvitationResult?: "linked" | "used" },
) {
  if (!isManagerInvitationEnabled()) return { status: "unavailable" as const };
  if (args.token.length !== 43) return { status: "invalid" as const };
  const actorLimit = await rateLimit(ctx, {
    name: "organizationManagerInviteAcceptActor",
    key: await invitationAcceptActorRateKey(ctx.identity),
  });
  if (!actorLimit.ok) return { status: "unavailable" as const };

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
  const organization = await ctx.db.get(invitation.organizationId);
  if (!organization || organization.isDeleted) return { status: "unavailable" as const };
  const verifiedEmail =
    ctx.identity.emailVerified === true && ctx.identity.email ? normalizeEmail(ctx.identity.email) : null;
  if (!verifiedEmail || verifiedEmail !== invitation.emailNormalized) {
    return { status: "emailMismatch" as const };
  }
  if (ctx.user && (ctx.user.isDeleted || ctx.user.accountDeletionRequestedAt !== undefined)) {
    return { status: "unavailable" as const };
  }
  if (isOrganizationInvitationLinked(invitation)) {
    if (options?.linkedInvitationResult === "used") return { status: "used" as const };
    const linkedByPersonId = getOrganizationInvitationLinkedByPersonId(invitation);
    const linkedPerson = linkedByPersonId ? await ctx.db.get(linkedByPersonId) : null;
    if (!ctx.user || !linkedPerson || linkedPerson.userId !== ctx.user._id) return { status: "used" as const };
    const linkedMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("personId", linkedPerson._id),
      )
      .take(2);
    if (
      linkedMembers.length !== 1 ||
      linkedMembers[0].status !== "active" ||
      linkedMembers[0].userId !== ctx.user._id
    ) {
      return { status: "used" as const };
    }
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", invitation.organizationId))
      .collect();
    const firstReadableShop =
      shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "active") ??
      shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "planSuspended") ??
      shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "archived");
    return firstReadableShop
      ? { status: "linked" as const, organizationId: invitation.organizationId, shopId: firstReadableShop._id }
      : { status: "linked" as const, organizationId: invitation.organizationId };
  }
  if (invitation.status === "revoked") return { status: "revoked" as const };
  if (!isOrganizationInvitationIssued(invitation)) return { status: "expired" as const };
  if (invitation.expiresAt <= Date.now()) return { status: "expired" as const };
  const eligibility = await resolveOrganizationInvitationEligibility(ctx, invitation);
  if (!eligibility) return { status: "unavailable" as const };
  const { inviter } = eligibility;
  const purpose = getOrganizationInvitationPurpose(invitation);

  const targetPersonId = invitation.targetPersonId;
  let people: Doc<"organizationPeople">[];
  if (targetPersonId) {
    const targetPerson = await ctx.db.get(targetPersonId);
    people =
      targetPerson &&
      targetPerson.organizationId === invitation.organizationId &&
      targetPerson.emailNormalized === verifiedEmail
        ? [targetPerson]
        : [];
  } else {
    people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("emailNormalized", verifiedEmail),
      )
      .take(2);
  }
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
  const capacity = await requireOrganizationCapacity(ctx, {
    organizationId: invitation.organizationId,
    additionalPeople: !people[0] || !existingPersonCounts ? 1 : 0,
    additionalActiveManagers: purpose === "freeManagerExchange" || existingMembers[0]?.status === "active" ? 0 : 1,
    excludedInvitationId: invitation._id,
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
        name: invitation.invitedName || ctx.user?.name || ctx.identity.name || verifiedEmail.split("@", 1)[0],
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
    await ctx.db.patch(inviter._id, { status: "removed", updatedAt: now });
    await removeLegacyOrganizationManagerAccess(ctx, invitation.organizationId, inviter.userId);
    const invitationsIssuedByFormerManager = (
      await Promise.all(
        (["issued", "pending"] as const).map((status) =>
          ctx.db
            .query("organizationInvitations")
            .withIndex("by_inviterMemberId_and_status", (q) =>
              q.eq("inviterMemberId", inviter._id).eq("status", status),
            )
            .collect(),
        ),
      )
    ).flat();
    const revokedInvitationIds: Id<"organizationInvitations">[] = [];
    for (const issuedInvitation of invitationsIssuedByFormerManager) {
      if (issuedInvitation._id === invitation._id || issuedInvitation.organizationId !== invitation.organizationId) {
        continue;
      }
      await ctx.db.patch(issuedInvitation._id, {
        status: "revoked",
        revokedAt: now,
        reservedSeat: false,
        version: issuedInvitation.version + 1,
        updatedAt: now,
      });
      revokedInvitationIds.push(issuedInvitation._id);
    }
    await cancelOrganizationRecipientBusinessNotifications(ctx, {
      organizationId: invitation.organizationId,
      userId: inviter.userId,
      invitationIds: revokedInvitationIds,
      includeBillingUserNotifications: true,
      preserveStaffNotificationsForUser: true,
    });
    const formerManagerStaff = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("organizationPersonId", inviter.personId),
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .first();
    await recordOrganizationAuditEvent(ctx, {
      organizationId: invitation.organizationId,
      actorUserId: userId,
      actorPersonId: personId,
      action: "organization.manager_role_removed",
      targetKind: "person",
      targetId: inviter.personId,
      fromState: "activeManager",
      toState: formerManagerStaff ? "staffOnly" : "personOnly",
      correlationId: `${invitation._id}:manager-role-removed:${invitation.version}`,
      occurredAt: now,
    });
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

  await ctx.db.patch(invitation._id, {
    status: "linked",
    linkedAt: now,
    linkedByPersonId: personId,
    reservedSeat: false,
    version: invitation.version + 1,
    updatedAt: now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: invitation.organizationId,
    actorUserId: userId,
    actorPersonId: personId,
    action: "organization.manager_invitation_linked",
    targetKind: "invitation",
    targetId: invitation._id,
    fromState: "issued",
    toState: "linked",
    correlationId: `${invitation._id}:link:${invitation.version}`,
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
    ? { status: "linked" as const, organizationId: invitation.organizationId, shopId: firstReadableShop._id }
    : { status: "linked" as const, organizationId: invitation.organizationId };
}

export const linkAccount = authenticatedMutation({
  args: { token: v.string() },
  returns: linkAccountResultValidator,
  handler: async (ctx, args) => await linkAccountWithToken(ctx, args),
});

// TODO[narrow]: 全deploymentでm023完走・旧client配布終了後、accepted DTOを返すlegacy入口ごと削除する。
export const accept = authenticatedMutation({
  args: { token: v.string() },
  returns: acceptInvitationResultValidator,
  handler: async (ctx, args) => {
    const result = await linkAccountWithToken(ctx, args, { linkedInvitationResult: "used" });
    return result.status === "linked" ? { ...result, status: "accepted" as const } : result;
  },
});
