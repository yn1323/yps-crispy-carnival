import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { getOrganizationInvitationSigningSecret } from "../_lib/config";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { authenticatedMutation, organizationMutation } from "../_lib/functions";
import { resolveOrganizationPersonEmailForManagerAddition } from "../_lib/personIdentity";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail, requiredEmailSchema } from "../_lib/validation";
import { ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT } from "../constants";
import { requireOrganizationReadActor } from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { getOrganizationBillingState, organizationPersonCountsTowardPeopleLimit } from "../organization/service";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { syncActivatedOrganizationStaffOrder } from "../organization/staffOrder";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationBusinessWriteOrLimitRecoveryCapability,
  requireOrganizationCapacity,
} from "../organizationBilling/service";
import { getOrganizationInvitationExpiresAt } from "./constants";
import {
  getOrganizationInvitationLinkedByPersonId,
  isOrganizationInvitationIssued,
  isOrganizationInvitationLinked,
} from "./lifecycle";
import { createExternalOrganizationManagerInvitationSchema, organizationInvitationRequestSchema } from "./schemas";
import { resolveOrganizationInvitationEligibility } from "./service";
import { deriveInvitationToken, digestInvitationToken, invitationRateLimitKey } from "./token";

const invitationMutationResultValidator = v.object({
  status: v.union(v.literal("created"), v.literal("alreadyPending"), v.literal("revoked")),
  invitationId: v.id("organizationInvitations"),
});

const strictInvitationIssueResultValidator = v.object({
  status: v.union(v.literal("issued"), v.literal("alreadyPending")),
  invitationId: v.id("organizationInvitations"),
});

const linkAccountResultValidator = v.union(
  v.object({ status: v.literal("linked"), organizationId: v.id("organizations"), shopId: v.optional(v.id("shops")) }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("conflict") }),
);

const prepareAcceptanceResultValidator = v.union(
  v.object({
    status: v.literal("ready"),
    invitationId: v.id("organizationInvitations"),
    expectedVersion: v.number(),
    tokenDigest: v.string(),
    emailNormalized: v.string(),
    requiresVerifiedEmail: v.boolean(),
  }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("conflict") }),
);

const acceptanceProofValidator = v.object({
  actorTokenIdentifier: v.string(),
  actorSubject: v.string(),
  invitationId: v.id("organizationInvitations"),
  expectedVersion: v.number(),
  tokenDigest: v.string(),
  verifiedEmailNormalized: v.optional(v.string()),
});

type OrganizationInvitationLinkCtx = MutationCtx & {
  identity: UserIdentity;
  user: Doc<"users"> | null;
};

type OrganizationInvitationAcceptanceProof = {
  actorTokenIdentifier: string;
  actorSubject: string;
  invitationId: Id<"organizationInvitations">;
  expectedVersion: number;
  tokenDigest: string;
  verifiedEmailNormalized?: string;
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

async function issueInvitation(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    inviterMember: Doc<"organizationMembers">;
    email: string;
    emailNormalized: string;
    invitedName: string;
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
    invitedName: args.invitedName,
    tokenDigest: `issuing:${generateUUID()}`,
    status: "issued",
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

async function createManagerInvitation(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    inviterMember: Doc<"organizationMembers">;
    email: string;
    invitedName?: string;
    requestId: string;
    targetPerson?: Doc<"organizationPeople">;
    auditIntentState?: string;
  },
) {
  // 発行入口が増えても、public handlerと同じ組織の書き込み権限を共通処理で再確認する。
  const { organization, inviterMember } = args;
  let targetPerson = args.targetPerson;
  await requireOrganizationBusinessWrite(ctx, organization._id);
  const emailNormalized = normalizeEmail(args.email);
  const personResolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
    organizationId: organization._id,
    emailNormalized,
  });
  if (personResolution.kind === "conflict") {
    throw new ConvexError("同じメールアドレスのユーザーが複数見つかりました。\n組織のユーザー情報を確認してください。");
  }
  const resolvedPerson = personResolution.kind === "new" ? undefined : personResolution.person;
  if (targetPerson && (!resolvedPerson || targetPerson._id !== resolvedPerson._id)) {
    throw new ConvexError("Not found");
  }
  targetPerson ??= resolvedPerson;

  const requestKey = await toAuditRequestKey(args.requestId);
  const correlationId = `${organization._id}:manager-invite:create:${requestKey}`;
  const priorAudit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .first();
  const priorInvitationId = priorAudit?.targetId
    ? ctx.db.normalizeId("organizationInvitations", priorAudit.targetId)
    : null;
  if (priorInvitationId) {
    const priorInvitation = await ctx.db.get(priorInvitationId);
    const isStrictExistingStaff = args.auditIntentState === "managerInviteStrict:v1:existingStaff";
    const isStrictExternal = args.auditIntentState === "managerInviteStrict:v1:external";
    const matchesIntent = Boolean(
      priorInvitation &&
        priorAudit?.organizationId === organization._id &&
        priorAudit.actorUserId === inviterMember.userId &&
        priorAudit.targetKind === "invitation" &&
        (priorAudit.action === "organization.manager_invited" ||
          priorAudit.action === "organization.manager_invitation_resent") &&
        priorInvitation.organizationId === organization._id &&
        (isStrictExistingStaff
          ? Boolean(targetPerson && priorInvitation.targetPersonId === targetPerson._id)
          : isStrictExternal
            ? priorInvitation.emailNormalized === emailNormalized &&
              priorInvitation.invitedName.trim() === args.invitedName?.trim()
            : priorInvitation.emailNormalized === emailNormalized &&
              (!targetPerson || priorInvitation.targetPersonId === targetPerson._id) &&
              (!args.invitedName || priorInvitation.invitedName.trim() === args.invitedName.trim())) &&
        (!args.auditIntentState || priorAudit.fromState === args.auditIntentState),
    );
    if (!matchesIntent) {
      throw new ConvexError("以前の管理者招待と内容が一致しません。\n画面を更新して、もう一度お試しください。");
    }
    return { status: "alreadyPending" as const, invitationId: priorInvitationId };
  }
  if (priorAudit) {
    throw new ConvexError("以前の管理者招待の結果を確認できません。\n画面を更新して、もう一度お試しください。");
  }

  const billingState = await getOrganizationBillingState(ctx, organization._id);
  const billingPolicy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
  if (!billingPolicy?.canManageManagers) {
    throw new ConvexError("現在の契約状態では、管理者を変更できません。");
  }
  const now = Date.now();
  const pendingByEmail = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
      q.eq("organizationId", organization._id).eq("emailNormalized", emailNormalized).eq("status", "issued"),
    )
    .collect();
  const pendingForTarget = targetPerson
    ? await ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_targetPersonId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("targetPersonId", targetPerson._id).eq("status", "issued"),
        )
        .collect()
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

  const recordStrictAlreadyPendingReceipt = async (invitationId: Id<"organizationInvitations">) => {
    if (!args.auditIntentState) return;
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: inviterMember.userId,
      actorPersonId: inviterMember.personId,
      action: "organization.manager_invited",
      targetKind: "invitation",
      targetId: invitationId,
      fromState: args.auditIntentState,
      toState: "alreadyPending",
      correlationId,
      occurredAt: now,
      suppressAnalyticsEvent: true,
    });
  };
  if (currentEmailInvitation) {
    if (
      targetPerson &&
      currentEmailInvitation.targetPersonId &&
      currentEmailInvitation.targetPersonId !== targetPerson._id
    ) {
      throw new ConvexError("この招待は現在の契約では利用できません");
    }
    const invitationForEligibility = targetPerson
      ? { ...currentEmailInvitation, targetPersonId: targetPerson._id }
      : currentEmailInvitation;
    if (!(await resolveOrganizationInvitationEligibility(ctx, invitationForEligibility))) {
      throw new ConvexError("この招待は現在の契約では利用できません");
    }
    await recordStrictAlreadyPendingReceipt(currentEmailInvitation._id);
    return { status: "alreadyPending" as const, invitationId: currentEmailInvitation._id };
  }

  // strict入口は、人物の連絡先が変わっていても同じtargetのURLを暗黙に失効しない。
  // 再送・取消は管理者設定の明示操作に限定する。
  if (staleTargetInvitation) {
    await recordStrictAlreadyPendingReceipt(staleTargetInvitation._id);
    return { status: "alreadyPending" as const, invitationId: staleTargetInvitation._id };
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

  const existingPerson = targetPerson;
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

  const reservedSeat = existingPerson
    ? !(await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, existingPerson._id))
    : true;
  await requireOrganizationCapacity(ctx, {
    organizationId: organization._id,
    additionalPeople: reservedSeat ? 1 : 0,
    additionalActiveManagers: 1,
  });

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
  const invitation = await issueInvitation(ctx, {
    organization,
    inviterMember,
    email: args.email,
    emailNormalized,
    invitedName: args.invitedName ?? targetPerson?.name ?? args.email.split("@", 1)[0],
    reservedSeat,
    ...(billingState ? { organizationBillingVersionAtOrigin: billingState.version } : {}),
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
    ...(args.auditIntentState ? { fromState: args.auditIntentState } : {}),
    toState: "issued",
    correlationId,
    occurredAt: now,
  });
  return { status: "created" as const, invitationId: invitation._id };
}

function strictIssueIntentState(
  recipient:
    | { kind: "existingStaff"; personId: Id<"organizationPeople"> }
    | { kind: "external"; invitedName: string; emailNormalized: string },
) {
  // auditは運用ログとして扱われるため、人物ID・氏名・メールを保存しない。
  // 実際のintent値は同じtransactionで結果のinvitation documentから照合する。
  return `managerInviteStrict:v1:${recipient.kind}`;
}

async function requirePersonIsEligibleManagerInviteTarget(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  person: Doc<"organizationPeople">,
  options: { requireActiveStaff: boolean; allowRemoved?: boolean },
) {
  const parsedEmail = requiredEmailSchema.safeParse(person.email);
  if (
    person.organizationId !== organizationId ||
    (person.status !== "active" && !(options.allowRemoved && person.status === "removed")) ||
    !parsedEmail.success ||
    normalizeEmail(parsedEmail.data) !== person.emailNormalized
  ) {
    throw new ConvexError("Not found");
  }
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) =>
      q.eq("organizationId", organizationId).eq("personId", person._id),
    )
    .take(2);
  if (members.length > 1) throw new ConvexError("管理者所属を一意に確認できません");
  if (members[0]?.status === "active") throw new ConvexError("この利用者はすでに管理者です");
  if (!options.requireActiveStaff) return;

  const staffRows = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", organizationId).eq("organizationPersonId", person._id),
    )
    .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
  if (staffRows.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) {
    throw new ConvexError("スタッフ所属を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  let hasActiveStaff = false;
  for (const staff of staffRows) {
    if (staff.isDeleted) continue;
    const shop = await ctx.db.get(staff.shopId);
    if (
      shop &&
      !shop.isDeleted &&
      shop.organizationId === organizationId &&
      organizationShopOperatingStatus(shop.operatingStatus) === "active"
    ) {
      hasActiveStaff = true;
      break;
    }
  }
  if (!hasActiveStaff) throw new ConvexError("管理者として招待できるスタッフ所属がありません");
}

type InvitationManagerActor = {
  organization: Doc<"organizations">;
  member: Doc<"organizationMembers">;
  person: Doc<"organizationPeople">;
};

type StrictInvitationRecipient =
  | { kind: "existingStaff"; personId: Id<"organizationPeople"> }
  | { kind: "external"; invitedName: string; email: string };

async function issueInvitationForActor(
  ctx: MutationCtx,
  args: { recipient: StrictInvitationRecipient; requestId: string },
  actor: InvitationManagerActor,
) {
  const request = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
  if (!request.success) throw new ConvexError("入力内容を確認してください。");

  if (args.recipient.kind === "existingStaff") {
    const person = await ctx.db.get(args.recipient.personId);
    if (!person) throw new ConvexError("Not found");
    await requirePersonIsEligibleManagerInviteTarget(ctx, actor.organization._id, person, {
      requireActiveStaff: true,
    });
    const result = await createManagerInvitation(ctx, {
      organization: actor.organization,
      inviterMember: actor.member,
      email: person.email,
      requestId: request.data.requestId,
      targetPerson: person,
      auditIntentState: strictIssueIntentState({ kind: "existingStaff", personId: person._id }),
    });
    return {
      status: result.status === "created" ? ("issued" as const) : ("alreadyPending" as const),
      invitationId: result.invitationId,
    };
  }

  const parsed = createExternalOrganizationManagerInvitationSchema.safeParse({
    name: args.recipient.invitedName,
    email: args.recipient.email,
    requestId: request.data.requestId,
  });
  if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const emailNormalized = normalizeEmail(parsed.data.email);
  const targetResolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
    organizationId: actor.organization._id,
    emailNormalized,
  });
  if (targetResolution.kind === "conflict") {
    throw new ConvexError("同じメールアドレスのユーザーが複数見つかりました。\n組織のユーザー情報を確認してください。");
  }
  const targetPerson = targetResolution.kind === "new" ? undefined : targetResolution.person;
  if (targetPerson) {
    await requirePersonIsEligibleManagerInviteTarget(ctx, actor.organization._id, targetPerson, {
      requireActiveStaff: false,
      allowRemoved: true,
    });
  }
  const result = await createManagerInvitation(ctx, {
    organization: actor.organization,
    inviterMember: actor.member,
    invitedName: parsed.data.name,
    email: parsed.data.email,
    requestId: request.data.requestId,
    ...(targetPerson ? { targetPerson } : {}),
    auditIntentState: strictIssueIntentState({
      kind: "external",
      invitedName: parsed.data.name,
      emailNormalized,
    }),
  });
  return {
    status: result.status === "created" ? ("issued" as const) : ("alreadyPending" as const),
    invitationId: result.invitationId,
  };
}

const strictInvitationRecipientValidator = v.union(
  v.object({ kind: v.literal("existingStaff"), personId: v.id("organizationPeople") }),
  v.object({ kind: v.literal("external"), invitedName: v.string(), email: v.string() }),
);

export const issueForOrganization = organizationMutation({
  args: {
    recipient: strictInvitationRecipientValidator,
    requestId: v.string(),
  },
  returns: strictInvitationIssueResultValidator,
  handler: async (ctx, args) =>
    await issueInvitationForActor(ctx, args, {
      organization: ctx.organization,
      member: ctx.organizationMember,
      person: ctx.organizationPerson,
    }),
});

async function revokeInvitationForActor(
  ctx: MutationCtx,
  args: { invitationId: Id<"organizationInvitations">; requestId: string },
  actor: InvitationManagerActor,
) {
  if (actor.member.status !== "active") throw new ConvexError("Not found");
  await requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
    organizationId: actor.organization._id,
    personId: actor.person._id,
    capability: "cancelManagerInvitation",
  });
  const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
  if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
  const requestKey = await toAuditRequestKey(parsed.data.requestId);
  const correlationId = `${actor.organization._id}:manager-invite:revoke:${requestKey}`;
  const priorAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .take(2);
  if (priorAudits.length > 1) {
    throw new ConvexError("以前の招待取消結果を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  const priorAudit = priorAudits[0];
  if (priorAudit) {
    if (
      priorAudit.organizationId !== actor.organization._id ||
      priorAudit.actorUserId !== actor.member.userId ||
      priorAudit.action !== "organization.manager_invitation_revoked" ||
      priorAudit.targetKind !== "invitation" ||
      priorAudit.targetId !== args.invitationId
    ) {
      throw new ConvexError("以前の招待取消と対象が一致しません。\n画面を更新して、もう一度お試しください。");
    }
    return { status: "revoked" as const, invitationId: args.invitationId };
  }
  const invitation = await ctx.db.get(args.invitationId);
  if (!invitation || invitation.organizationId !== actor.organization._id) throw new ConvexError("Not found");
  if (invitation.status === "revoked") {
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.manager_invitation_revoked",
      targetKind: "invitation",
      targetId: invitation._id,
      fromState: "revoked",
      toState: "revoked",
      correlationId,
      suppressAnalyticsEvent: true,
    });
    return { status: "revoked" as const, invitationId: invitation._id };
  }
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
    correlationId,
    occurredAt: now,
  });
  return { status: "revoked" as const, invitationId: invitation._id };
}

export const revokeForOrganization = authenticatedMutation({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.id("organizationInvitations"),
    requestId: v.string(),
  },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) => {
    if (!ctx.user || ctx.user.isDeleted) throw new ConvexError("Not found");
    const actor = await requireOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId: args.organizationId,
    });
    return await revokeInvitationForActor(ctx, args, actor);
  },
});

async function resendInvitationForActor(
  ctx: MutationCtx,
  args: { invitationId: Id<"organizationInvitations">; requestId: string },
  actor: InvitationManagerActor,
) {
  const organization = actor.organization;
  const organizationMember = actor.member;
  await requireOrganizationBusinessWrite(ctx, organization._id);
  const parsed = organizationInvitationRequestSchema.safeParse({ requestId: args.requestId });
  if (!parsed.success) throw new ConvexError("入力内容を確認してください。");
  const requestedInvitation = await ctx.db.get(args.invitationId);
  if (!requestedInvitation || requestedInvitation.organizationId !== organization._id) {
    throw new ConvexError("Not found");
  }
  const requestKey = await toAuditRequestKey(parsed.data.requestId);
  const correlationId = `${organization._id}:manager-invite:resend:${requestKey}`;
  const priorAudit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .take(2);
  if (priorAudit.length > 1) {
    throw new ConvexError("以前の招待再送結果を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  const priorAuditEvent = priorAudit[0];
  const priorInvitationId = priorAuditEvent?.targetId
    ? ctx.db.normalizeId("organizationInvitations", priorAuditEvent.targetId)
    : null;
  if (priorAuditEvent) {
    const priorInvitation = priorInvitationId ? await ctx.db.get(priorInvitationId) : null;
    if (priorAuditEvent.toState === "alreadyPending") {
      if (
        !priorInvitation ||
        priorAuditEvent.organizationId !== organization._id ||
        priorAuditEvent.actorUserId !== organizationMember.userId ||
        priorAuditEvent.action !== "organization.manager_invitation_resent" ||
        priorAuditEvent.targetKind !== "invitation" ||
        priorInvitation._id !== args.invitationId ||
        priorInvitation.organizationId !== organization._id
      ) {
        throw new ConvexError("以前の招待再送と対象が一致しません。\n画面を更新して、もう一度お試しください。");
      }
      const current = (
        await ctx.db
          .query("organizationInvitations")
          .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
            q
              .eq("organizationId", organization._id)
              .eq("emailNormalized", priorInvitation.emailNormalized)
              .eq("status", "issued"),
          )
          .take(2)
      ).filter((invitation) => invitation._id !== priorInvitation._id && invitation.expiresAt > Date.now());
      if (current.length !== 1) {
        throw new ConvexError("以前の招待再送結果を確認できません。\n画面を更新して、もう一度お試しください。");
      }
      return { status: "alreadyPending" as const, invitationId: current[0]._id };
    }
    if (
      !priorInvitation ||
      priorAuditEvent.organizationId !== organization._id ||
      priorAuditEvent.actorUserId !== organizationMember.userId ||
      priorAuditEvent.action !== "organization.manager_invitation_resent" ||
      priorAuditEvent.targetKind !== "invitation" ||
      priorInvitation.organizationId !== organization._id ||
      priorInvitation.predecessorInvitationId !== args.invitationId
    ) {
      throw new ConvexError("以前の招待再送と対象が一致しません。\n画面を更新して、もう一度お試しください。");
    }
    return { status: "alreadyPending" as const, invitationId: priorInvitation._id };
  }

  const oldInvitation = requestedInvitation;
  if (!isOrganizationInvitationIssued(oldInvitation) && oldInvitation.status !== "expired") {
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
        .eq("status", "issued"),
    )
    .take(2);
  if (sameEmailPending.length > 1) throw new ConvexError("招待の状態を確認できません");
  const otherPending = sameEmailPending.find((invitation) => invitation._id !== oldInvitation._id);
  if (otherPending && otherPending.expiresAt > now) {
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: organizationMember.userId,
      actorPersonId: organizationMember.personId,
      action: "organization.manager_invitation_resent",
      targetKind: "invitation",
      targetId: oldInvitation._id,
      fromState: "issued",
      toState: "alreadyPending",
      correlationId,
      occurredAt: now,
      suppressAnalyticsEvent: true,
    });
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
  const targetResolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
    organizationId: organization._id,
    emailNormalized: oldInvitation.emailNormalized,
  });
  if (targetResolution.kind === "conflict") {
    throw new ConvexError("招待先の利用者を一意に確認できません");
  }
  const targetPerson = targetResolution.kind === "new" ? undefined : targetResolution.person;
  if (oldInvitation.targetPersonId && targetPerson?._id !== oldInvitation.targetPersonId) {
    throw new ConvexError("招待先の利用者を一意に確認できません");
  }
  if (targetPerson) {
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", organization._id).eq("personId", targetPerson._id),
      )
      .take(2);
    if (members.length > 1) throw new ConvexError("管理者所属を一意に確認できません");
    if (members[0]?.status === "active") throw new ConvexError("この利用者はすでに管理者です");
  }
  const reservedSeat = targetPerson
    ? !(await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, targetPerson._id))
    : true;
  await requireOrganizationCapacity(ctx, {
    organizationId: organization._id,
    additionalPeople: reservedSeat ? 1 : 0,
    additionalActiveManagers: 1,
    excludedInvitationId: oldInvitation._id,
  });
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
    invitedName: oldInvitation.invitedName,
    reservedSeat,
    ...(currentBillingState ? { organizationBillingVersionAtOrigin: currentBillingState.version } : {}),
    predecessorInvitationId: oldInvitation._id,
    ...(targetPerson ? { targetPersonId: targetPerson._id } : {}),
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
    toState: "issued",
    correlationId,
    occurredAt: now,
  });
  return { status: "created" as const, invitationId: invitation._id };
}

export const resendForOrganization = organizationMutation({
  args: { invitationId: v.id("organizationInvitations"), requestId: v.string() },
  returns: invitationMutationResultValidator,
  handler: async (ctx, args) =>
    await resendInvitationForActor(ctx, args, {
      organization: ctx.organization,
      member: ctx.organizationMember,
      person: ctx.organizationPerson,
    }),
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

async function resolveInvitationActor(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const users = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", identity.tokenIdentifier))
    .take(2);
  if (users.length > 1) return null;
  return { identity, user: users[0] ?? null };
}

async function findInvitationTargetPeople(ctx: MutationCtx, invitation: Doc<"organizationInvitations">) {
  if (invitation.targetPersonId) {
    const targetPerson = await ctx.db.get(invitation.targetPersonId);
    return targetPerson && targetPerson.organizationId === invitation.organizationId ? [targetPerson] : [];
  }
  const resolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
    organizationId: invitation.organizationId,
    emailNormalized: invitation.emailNormalized,
  });
  return resolution.kind === "active" || resolution.kind === "removed" ? [resolution.person] : [];
}

export const prepareAcceptance = internalMutation({
  args: { token: v.string() },
  returns: prepareAcceptanceResultValidator,
  handler: async (ctx, { token }) => {
    if (token.length !== 43) return { status: "invalid" as const };

    const actor = await resolveInvitationActor(ctx);
    if (!actor) return { status: "unavailable" as const };
    if (actor.user && (actor.user.isDeleted || actor.user.accountDeletionRequestedAt !== undefined)) {
      return { status: "unavailable" as const };
    }

    const actorLimit = await rateLimit(ctx, {
      name: "organizationManagerInviteAcceptActor",
      key: await invitationAcceptActorRateKey(actor.identity),
    });
    if (!actorLimit.ok) return { status: "unavailable" as const };

    const tokenDigest = await digestInvitationToken(token);
    const tokenLimit = await rateLimit(ctx, {
      name: "organizationManagerInviteAccept",
      key: invitationRateLimitKey(tokenDigest),
    });
    if (!tokenLimit.ok) return { status: "unavailable" as const };

    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", tokenDigest))
      .take(2);
    if (invitations.length !== 1) return { status: "invalid" as const };
    const invitation = invitations[0];
    const organization = await ctx.db.get(invitation.organizationId);
    if (!organization || organization.isDeleted) return { status: "unavailable" as const };

    if (isOrganizationInvitationLinked(invitation)) {
      const linkedByPersonId = getOrganizationInvitationLinkedByPersonId(invitation);
      const linkedPerson = linkedByPersonId ? await ctx.db.get(linkedByPersonId) : null;
      if (!actor.user || !linkedPerson || linkedPerson.userId !== actor.user._id) {
        return { status: "used" as const };
      }
      return {
        status: "ready" as const,
        invitationId: invitation._id,
        expectedVersion: invitation.version,
        tokenDigest,
        emailNormalized: invitation.emailNormalized,
        requiresVerifiedEmail: false,
      };
    }
    if (invitation.status === "revoked") return { status: "revoked" as const };
    if (!isOrganizationInvitationIssued(invitation) || invitation.expiresAt <= Date.now()) {
      return { status: "expired" as const };
    }
    if (!(await resolveOrganizationInvitationEligibility(ctx, invitation))) {
      return { status: "unavailable" as const };
    }

    const people = await findInvitationTargetPeople(ctx, invitation);
    if (people.length > 1) return { status: "conflict" as const };
    if (people[0]?.userId && people[0].userId !== actor.user?._id) return { status: "conflict" as const };

    if (actor.user) {
      const actorUserId = actor.user._id;
      const peopleForActor = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", invitation.organizationId).eq("userId", actorUserId),
        )
        .take(2);
      if (peopleForActor.length > 1 || (peopleForActor[0] && peopleForActor[0]._id !== people[0]?._id)) {
        return { status: "conflict" as const };
      }
    }

    return {
      status: "ready" as const,
      invitationId: invitation._id,
      expectedVersion: invitation.version,
      tokenDigest,
      emailNormalized: invitation.emailNormalized,
      requiresVerifiedEmail: !(invitation.targetPersonId && people[0]?.userId),
    };
  },
});

async function linkAccountWithToken(
  ctx: OrganizationInvitationLinkCtx,
  args: { token: string },
  proof: OrganizationInvitationAcceptanceProof,
) {
  if (args.token.length !== 43) return { status: "invalid" as const };
  const tokenDigest = await digestInvitationToken(args.token);
  if (
    proof.actorTokenIdentifier !== ctx.identity.tokenIdentifier ||
    proof.actorSubject !== ctx.identity.subject ||
    proof.tokenDigest !== tokenDigest
  ) {
    return { status: "conflict" as const };
  }
  const invitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", tokenDigest))
    .take(2);
  if (invitations.length !== 1) return { status: "invalid" as const };
  const invitation = invitations[0];
  if (proof.invitationId !== invitation._id || proof.expectedVersion !== invitation.version) {
    return { status: "conflict" as const };
  }
  const organization = await ctx.db.get(invitation.organizationId);
  if (!organization || organization.isDeleted) return { status: "unavailable" as const };
  if (ctx.user && (ctx.user.isDeleted || ctx.user.accountDeletionRequestedAt !== undefined)) {
    return { status: "unavailable" as const };
  }
  if (isOrganizationInvitationLinked(invitation)) {
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

  const people = await findInvitationTargetPeople(ctx, invitation);
  if (people.length > 1) return { status: "conflict" as const };
  if (people[0]?.userId && people[0].userId !== ctx.user?._id) return { status: "conflict" as const };
  const linkedTargetMatchesActor = Boolean(invitation.targetPersonId && ctx.user && people[0]?.userId === ctx.user._id);
  const verifiedEmail = proof.verifiedEmailNormalized;
  if (!linkedTargetMatchesActor && verifiedEmail !== invitation.emailNormalized) {
    return { status: "conflict" as const };
  }
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
  if (existingMembers[0]?.status === "active") {
    return { status: "conflict" as const };
  }
  if (existingMembers[0]?.userId && existingMembers[0].userId !== ctx.user?._id) {
    return { status: "conflict" as const };
  }
  const existingPersonCounts = people[0]
    ? await organizationPersonCountsTowardPeopleLimit(ctx, invitation.organizationId, people[0]._id)
    : false;
  const capacity = await requireOrganizationCapacity(ctx, {
    organizationId: invitation.organizationId,
    additionalPeople: !people[0] || !existingPersonCounts ? 1 : 0,
    additionalActiveManagers: 1,
    excludedInvitationId: invitation._id,
  }).catch(() => null);
  if (!capacity) return { status: "unavailable" as const };

  const userId = ctx.user
    ? ctx.user._id
    : await ctx.db.insert("users", {
        authTokenIdentifier: ctx.identity.tokenIdentifier,
        name: ctx.identity.name ?? invitation.emailNormalized.split("@", 1)[0],
        email: invitation.email,
        emailNormalized: invitation.emailNormalized,
        role: "manager",
        isDeleted: false,
      });

  const now = Date.now();
  const reactivatesPerson = people[0]?.status === "removed";
  const nextPersonFirstObservedAt = people[0]?.createdAt ?? now;
  const personId = people[0]
    ? people[0]._id
    : await ctx.db.insert("organizationPeople", {
        organizationId: invitation.organizationId,
        userId,
        name:
          invitation.invitedName || ctx.user?.name || ctx.identity.name || invitation.emailNormalized.split("@", 1)[0],
        email: invitation.email,
        emailNormalized: invitation.emailNormalized,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
  if (people[0] && reactivatesPerson) {
    await ctx.db.patch(people[0]._id, {
      userId,
      status: "active",
      name:
        invitation.invitedName || ctx.user?.name || ctx.identity.name || invitation.emailNormalized.split("@", 1)[0],
      email: invitation.email,
      emailNormalized: invitation.emailNormalized,
      updatedAt: now,
    });
  } else if (people[0] && !people[0].userId) {
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

  if (!people[0] || reactivatesPerson) {
    await syncActivatedOrganizationStaffOrder(ctx, { organizationId: invitation.organizationId });
  }

  if (reactivatesPerson) {
    await recordOrganizationAuditEvent(ctx, {
      organizationId: invitation.organizationId,
      actorUserId: userId,
      actorPersonId: personId,
      action: "organization.person_reactivated",
      targetKind: "person",
      targetId: personId,
      fromState: "removed",
      toState: "active",
      correlationId: `${invitation._id}:person-reactivated:${invitation.version}`,
      occurredAt: now,
      suppressAnalyticsEvent: true,
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
    analyticsEvent: {
      eventType: "managerMembership.changed",
      subjectId: personId,
      payload: {
        kind: "managerMembership",
        personId,
        personFirstObservedAt: nextPersonFirstObservedAt,
        status: "active",
        validFrom: now,
      },
    },
  });
  await ctx.scheduler.runAfter(0, internal.organizationInvitation.actions.enqueueAcceptanceNotifications, {
    invitationId: invitation._id,
    expectedVersion: invitation.version + 1,
    organizationBillingVersionAtOrigin: capacity.billingState.version,
  });
  const firstActiveShop = shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "active");
  const firstReadableShop =
    firstActiveShop ?? shops.find((shop) => !shop.isDeleted && shop.operatingStatus === "archived");
  return firstReadableShop
    ? { status: "linked" as const, organizationId: invitation.organizationId, shopId: firstReadableShop._id }
    : { status: "linked" as const, organizationId: invitation.organizationId };
}

export const finalizeAcceptance = internalMutation({
  args: { token: v.string(), proof: acceptanceProofValidator },
  returns: linkAccountResultValidator,
  handler: async (ctx, { token, proof }) => {
    const actor = await resolveInvitationActor(ctx);
    if (!actor) return { status: "unavailable" as const };
    return await linkAccountWithToken({ ...ctx, ...actor }, { token }, proof);
  },
});
