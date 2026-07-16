import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { cancelOrganizationRecipientBusinessNotifications } from "../notificationOutbox/mutations";
import { getEffectiveRestrictedBillingState, getOrganizationBillingStateDeadline } from "../organizationBilling/policy";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationCapacity,
  requireOrganizationPaidFeature,
  requireRestrictedRecoveryCapability,
} from "../organizationBilling/service";
import { ensureDefaultPosition } from "../position/service";
import { createShopSchema } from "../setup/schemas";
import { type OrganizationActor, requireOrganizationActorForShop } from "./access";
import { type OrganizationAuditAction, recordOrganizationAuditEvent } from "./audit";
import { organizationNameSchema } from "./schemas";
import { requireOrganizationBillingState } from "./service";
import { organizationShopOperatingStatusValidator } from "./validators";

const shopMutationResultValidator = v.object({
  shopId: v.id("shops"),
  shopStatus: organizationShopOperatingStatusValidator,
  changed: v.boolean(),
});

function shopStatus(shop: Doc<"shops">) {
  return shop.operatingStatus ?? ("active" as const);
}

function shopMutationResult(
  shopId: Id<"shops">,
  shopStatus: "active" | "archived" | "planSuspended",
  changed: boolean,
) {
  return { shopId, shopStatus, changed };
}

async function getPriorShopOperation(
  ctx: MutationCtx,
  args: {
    correlationId: string;
    organizationId: Id<"organizations">;
    expectedShopId?: Id<"shops">;
  },
) {
  const audit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .first();
  if (!audit) return null;
  const shopId = audit.targetId ? ctx.db.normalizeId("shops", audit.targetId) : null;
  if (!shopId || (args.expectedShopId && shopId !== args.expectedShopId)) {
    throw new ConvexError("以前の操作結果を確認できません");
  }
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.organizationId !== args.organizationId) throw new ConvexError("以前の操作結果を確認できません");
  return shop;
}

async function materializeLegacyManagerMemberships(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; shopId: Id<"shops"> },
) {
  const [activeMembers, readOnlyMembers] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .collect(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "readOnly"),
      )
      .collect(),
  ]);
  const userIds = new Set<Id<"users">>();
  for (const member of [...activeMembers, ...readOnlyMembers]) {
    if (userIds.has(member.userId)) throw new ConvexError("管理者所属を一意に確認できません");
    const [person, user] = await Promise.all([ctx.db.get(member.personId), ctx.db.get(member.userId)]);
    if (
      !person ||
      person.organizationId !== args.organizationId ||
      person.userId !== member.userId ||
      person.status !== "active" ||
      !user ||
      user.isDeleted
    ) {
      throw new ConvexError("管理者所属を確認できません");
    }
    userIds.add(member.userId);

    const legacyMemberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId", (q) => q.eq("userId", member.userId).eq("shopId", args.shopId))
      .take(2);
    if (legacyMemberships.length > 1) throw new ConvexError("店舗所属を一意に確認できません");
    if (legacyMemberships[0]) {
      if (legacyMemberships[0].isDeleted) {
        await ctx.db.patch(legacyMemberships[0]._id, { role: "manager", isDeleted: false });
      }
    } else {
      await ctx.db.insert("shopMembers", {
        userId: member.userId,
        shopId: args.shopId,
        role: "manager",
        isDeleted: false,
      });
    }
  }
}

export const updateOrganizationName = authenticatedMutation({
  args: { shopId: v.id("shops"), name: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = organizationNameSchema.safeParse(args.name);
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `${actor.organization._id}:organization:name:${requestKey}`;
    const prior = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    if (prior) {
      if (
        prior.action !== "organization.name_changed" ||
        prior.organizationId !== actor.organization._id ||
        prior.actorUserId !== actor.member.userId
      ) {
        throw new ConvexError("以前の操作結果を確認できません");
      }
      return { changed: false };
    }
    if (actor.organization.name === parsed.data) return { changed: false };

    const now = Date.now();
    await ctx.db.patch(actor.organization._id, { name: parsed.data, updatedAt: now });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.name_changed",
      targetKind: "organization",
      targetId: actor.organization._id,
      fromState: actor.organization.name,
      toState: parsed.data,
      correlationId,
      occurredAt: now,
    });
    return { changed: true };
  },
});

export const addShop = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    shopName: v.string(),
    submissionPattern: submissionPatternValidator,
    requestId: v.string(),
  },
  returns: shopMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = createShopSchema.safeParse({
      shopName: args.shopName,
      submissionPattern: args.submissionPattern,
    });
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    const requestId = await toAuditRequestKey(args.requestId);
    const organization = actor.organization;
    const correlationId = `${organization._id}:shop:add:${requestId}`;
    const priorShop = await getPriorShopOperation(ctx, { correlationId, organizationId: organization._id });
    if (priorShop) return shopMutationResult(priorShop._id, "active", false);

    // 店舗追加は複数店舗機能なので、Freeでは空きがあっても許可しない。
    await requireOrganizationPaidFeature(ctx, organization._id);
    await requireOrganizationCapacity(ctx, {
      organizationId: organization._id,
      additionalActiveShops: 1,
    });

    const now = Date.now();
    const shopId = await ctx.db.insert("shops", {
      organizationId: organization._id,
      operatingStatus: "active",
      name: parsed.data.shopName,
      regularClosedDays: [],
      submissionPattern: normalizeSubmissionPattern(parsed.data.submissionPattern),
      isDeleted: false,
    });
    await ensureDefaultPosition(ctx, shopId);
    await materializeLegacyManagerMemberships(ctx, { organizationId: organization._id, shopId });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.shop_added",
      targetKind: "shop",
      targetId: shopId,
      toState: "active",
      correlationId,
      occurredAt: now,
    });
    return shopMutationResult(shopId, "active", true);
  },
});

async function authorizeShopStateChange(
  ctx: MutationCtx,
  args: {
    user: Doc<"users"> | null;
    shopId: Id<"shops">;
    operation: "archive" | "reactivate";
  },
) {
  const actor = await requireOrganizationActorForShop(ctx, {
    user: args.user,
    shopId: args.shopId,
    allowReadOnly: true,
  });
  const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
  if (getEffectiveRestrictedBillingState(billingState.state)) {
    if (args.operation === "reactivate") throw new ConvexError("契約制限中は店舗を再稼働できません");
    await requireRestrictedRecoveryCapability(ctx, {
      organizationId: actor.organization._id,
      personId: actor.person._id,
      capability: "archiveShop",
    });
  } else {
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
  }
  return { actor, billingState };
}

async function recordShopStateChange(
  ctx: MutationCtx,
  args: {
    actorUserId: Id<"users">;
    actorPersonId: Id<"organizationPeople">;
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    action: OrganizationAuditAction;
    fromState: "active" | "archived" | "planSuspended";
    toState: "active" | "archived";
    correlationId: string;
    occurredAt: number;
  },
) {
  await recordOrganizationAuditEvent(ctx, {
    organizationId: args.organizationId,
    actorUserId: args.actorUserId,
    actorPersonId: args.actorPersonId,
    action: args.action,
    targetKind: "shop",
    targetId: args.shopId,
    fromState: args.fromState,
    toState: args.toState,
    correlationId: args.correlationId,
    occurredAt: args.occurredAt,
  });
}

export const archiveShop = authenticatedMutation({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: shopMutationResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    const { actor } = await authorizeShopStateChange(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      operation: "archive",
    });
    const correlationId = `${actor.organization._id}:shop:archive:${actor.shop._id}:${requestId}`;
    const priorShop = await getPriorShopOperation(ctx, {
      correlationId,
      organizationId: actor.organization._id,
      expectedShopId: actor.shop._id,
    });
    if (priorShop) return shopMutationResult(priorShop._id, "archived", false);

    const fromState = shopStatus(actor.shop);
    if (fromState === "archived") return shopMutationResult(actor.shop._id, "archived", false);
    const now = Date.now();
    await ctx.db.patch(actor.shop._id, { operatingStatus: "archived" });
    await recordShopStateChange(ctx, {
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      organizationId: actor.organization._id,
      shopId: actor.shop._id,
      action: "organization.shop_archived",
      fromState,
      toState: "archived",
      correlationId,
      occurredAt: now,
    });
    return shopMutationResult(actor.shop._id, "archived", true);
  },
});

export const reactivateShop = authenticatedMutation({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: shopMutationResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    const { actor } = await authorizeShopStateChange(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      operation: "reactivate",
    });
    const correlationId = `${actor.organization._id}:shop:reactivate:${actor.shop._id}:${requestId}`;
    const priorShop = await getPriorShopOperation(ctx, {
      correlationId,
      organizationId: actor.organization._id,
      expectedShopId: actor.shop._id,
    });
    if (priorShop) return shopMutationResult(priorShop._id, "active", false);

    const fromState = shopStatus(actor.shop);
    if (fromState === "active") return shopMutationResult(actor.shop._id, "active", false);
    await requireOrganizationCapacity(ctx, {
      organizationId: actor.organization._id,
      additionalActiveShops: 1,
    });
    const now = Date.now();
    await ctx.db.patch(actor.shop._id, { operatingStatus: "active" });
    await recordShopStateChange(ctx, {
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      organizationId: actor.organization._id,
      shopId: actor.shop._id,
      action: "organization.shop_reactivated",
      fromState,
      toState: "active",
      correlationId,
      occurredAt: now,
    });
    return shopMutationResult(actor.shop._id, "active", true);
  },
});

const personRemovalResultValidator = v.object({ changed: v.boolean() });
const FUTURE_ASSIGNMENT_ERROR = "将来のシフト割当を解除してから削除してください";

type PersonRemovalCtx = MutationCtx & { user: Doc<"users"> | null };

function personRemovalCorrelationId(
  organizationId: Id<"organizations">,
  operation: "shop" | "organization" | "managerRole",
  targetId: string,
  requestId: string,
) {
  return `${organizationId}:person-removal:${operation}:${targetId}:${requestId}`;
}

async function findPersonRemovalAudit(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    operation: "shop" | "organization" | "managerRole";
    targetId: string;
    requestId: string;
  },
) {
  const correlationId = personRemovalCorrelationId(args.organizationId, args.operation, args.targetId, args.requestId);
  const audit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .first();
  return { audit, correlationId };
}

/**
 * 自分自身を削除したrequestの再送でも実行済み結果だけは返せるようにする。
 * 現在の所属を迂回しないよう、同じactorUserIdで記録された監査だけを事前判定に使う。
 */
async function isCompletedPersonRemovalActorRetry(
  ctx: PersonRemovalCtx,
  args: {
    shopId: Id<"shops">;
    operation: "shop" | "organization" | "managerRole";
    targetId: string;
    requestId: string;
  },
) {
  if (!ctx.user) return false;
  const shop = await ctx.db.get(args.shopId);
  if (!shop?.organizationId) return false;
  const { audit } = await findPersonRemovalAudit(ctx, {
    organizationId: shop.organizationId,
    operation: args.operation,
    targetId: args.targetId,
    requestId: args.requestId,
  });
  return audit?.actorUserId === ctx.user._id;
}

async function authorizeOrganizationPersonRemoval(ctx: MutationCtx, actor: OrganizationActor) {
  const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
  if (getEffectiveRestrictedBillingState(billingState.state)) {
    await requireRestrictedRecoveryCapability(ctx, {
      organizationId: actor.organization._id,
      personId: actor.person._id,
      capability: "removeOrganizationPerson",
    });
  } else {
    if (actor.member.status !== "active") throw new ConvexError("この操作を行う権限がありません");
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
  }
  return billingState;
}

async function hasFutureAssignment(ctx: MutationCtx, staffIds: readonly Id<"staffs">[]) {
  const today = todayJST();
  for (const staffId of staffIds) {
    const assignments = ctx.db
      .query("shiftAssignments")
      .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staffId).gte("date", today));
    for await (const assignment of assignments) {
      const recruitment = await ctx.db.get(assignment.recruitmentId);
      if (recruitment && !recruitment.isDeleted) return true;
    }
  }
  return false;
}

async function revokeStaffAccessForRemoval(ctx: MutationCtx, staffIds: readonly Id<"staffs">[], now: number) {
  for (const staffId of staffIds) {
    const [sessions, magicLinks, lineLinkTokens, lineAccounts] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("magicLinks")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("lineLinkTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
    ]);
    await Promise.all([
      ...sessions
        .filter((session) => !session.revokedAt)
        .map((session) => ctx.db.patch(session._id, { revokedAt: now })),
      ...magicLinks.filter((link) => !link.revokedAt).map((link) => ctx.db.patch(link._id, { revokedAt: now })),
      ...lineLinkTokens.filter((token) => !token.revokedAt).map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineAccounts
        .filter((account) => !account.isDeleted || account.following)
        .map((account) => ctx.db.patch(account._id, { isDeleted: true, following: false })),
    ]);
  }
}

async function findPendingInvitationsForRemovedPerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    person: Doc<"organizationPeople">;
    member: Doc<"organizationMembers"> | null;
  },
) {
  const invitations = new Map<Id<"organizationInvitations">, Doc<"organizationInvitations">>();
  if (args.member) {
    const issued = await findPendingInvitationsIssuedByManager(ctx, args.organizationId, args.member._id);
    for (const invitation of issued) invitations.set(invitation._id, invitation);
  }
  const addressedToPerson = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("emailNormalized", args.person.emailNormalized)
        .eq("status", "pending"),
    )
    .collect();
  for (const invitation of addressedToPerson) invitations.set(invitation._id, invitation);
  return [...invitations.values()];
}

async function findPendingInvitationsIssuedByManager(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberId: Id<"organizationMembers">,
) {
  const invitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_inviterMemberId_and_status", (q) => q.eq("inviterMemberId", memberId).eq("status", "pending"))
    .collect();
  return invitations.filter((invitation) => invitation.organizationId === organizationId);
}

async function revokePendingInvitations(
  ctx: MutationCtx,
  invitations: readonly Doc<"organizationInvitations">[],
  now: number,
) {
  for (const invitation of invitations) {
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      reservedSeat: false,
      version: invitation.version + 1,
      revokedAt: now,
      updatedAt: now,
    });
  }
}

async function deactivateLegacyPersonMemberships(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
) {
  const memberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .collect();
  for (const membership of memberships) {
    const shop = await ctx.db.get(membership.shopId);
    if (shop?.organizationId === organizationId) await ctx.db.patch(membership._id, { isDeleted: true });
  }
}

async function hasOtherValidActiveManager(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  excludedPersonId: Id<"organizationPeople">,
) {
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .collect();
  const candidatePersonIds = new Set(
    activeMembers.filter((member) => member.personId !== excludedPersonId).map((member) => member.personId),
  );
  for (const personId of candidatePersonIds) {
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", organizationId).eq("personId", personId),
      )
      .take(2);
    if (members.length !== 1 || members[0].status !== "active") continue;
    const member = members[0];
    const [person, user, userMemberships] = await Promise.all([
      ctx.db.get(member.personId),
      ctx.db.get(member.userId),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", member.userId).eq("organizationId", organizationId),
        )
        .take(2),
    ]);
    if (
      userMemberships.length === 1 &&
      userMemberships[0]._id === member._id &&
      person?.organizationId === organizationId &&
      person.status === "active" &&
      person.userId === member.userId &&
      user &&
      !user.isDeleted
    ) {
      return true;
    }
  }
  return false;
}

async function isValidRecoveryManager(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  const person = await ctx.db.get(personId);
  if (!person || person.organizationId !== organizationId || person.status !== "active" || !person.userId) return false;
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) => q.eq("organizationId", organizationId).eq("personId", personId))
    .take(2);
  if (members.length !== 1) return false;
  const member = members[0];
  if (member.userId !== person.userId || (member.status !== "active" && member.status !== "readOnly")) return false;
  const [user, userMemberships] = await Promise.all([
    ctx.db.get(member.userId),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", member.userId).eq("organizationId", organizationId),
      )
      .take(2),
  ]);
  return Boolean(user && !user.isDeleted && userMemberships.length === 1 && userMemberships[0]._id === member._id);
}

type BillingReferenceUpdate = {
  recoveryManagerPersonIds: Id<"organizationPeople">[] | null;
  recoveryManagersChanged: boolean;
  clearFreeManager: boolean;
};

async function planBillingReferenceUpdate(
  ctx: MutationCtx,
  billingState: Doc<"organizationBillingStates">,
  removedPersonId: Id<"organizationPeople">,
): Promise<BillingReferenceUpdate> {
  const clearFreeManager = billingState.freeManagerPersonId === removedPersonId;
  const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
  if (!restrictedState) {
    return { recoveryManagerPersonIds: null, recoveryManagersChanged: false, clearFreeManager };
  }

  const currentIds = restrictedState.recoveryManagerPersonIds;
  const targetWasRecoveryManager = currentIds.includes(removedPersonId);
  const nextIds: Id<"organizationPeople">[] = [];
  const seen = new Set<Id<"organizationPeople">>();
  for (const personId of currentIds) {
    if (personId === removedPersonId || seen.has(personId)) continue;
    seen.add(personId);
    if (await isValidRecoveryManager(ctx, billingState.organizationId, personId)) nextIds.push(personId);
  }
  if (targetWasRecoveryManager && nextIds.length === 0) {
    throw new ConvexError("最後の復旧担当者は削除できません");
  }

  const recoveryManagersChanged =
    currentIds.length !== nextIds.length || currentIds.some((personId, index) => personId !== nextIds[index]);
  return { recoveryManagerPersonIds: nextIds, recoveryManagersChanged, clearFreeManager };
}

async function applyBillingReferenceUpdate(
  ctx: MutationCtx,
  args: {
    actor: OrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    update: BillingReferenceUpdate;
    correlationId: string;
    now: number;
  },
) {
  if (!args.update.recoveryManagersChanged && !args.update.clearFreeManager) return;
  const restrictedState = getEffectiveRestrictedBillingState(args.billingState.state);
  const nextState =
    restrictedState && args.update.recoveryManagerPersonIds
      ? args.billingState.state.kind === "pendingActivation"
        ? {
            ...args.billingState.state,
            restrictedFallbackState: {
              ...restrictedState,
              recoveryManagerPersonIds: args.update.recoveryManagerPersonIds,
            },
          }
        : { ...restrictedState, recoveryManagerPersonIds: args.update.recoveryManagerPersonIds }
      : args.billingState.state;
  const nextVersion = args.billingState.version + 1;
  await ctx.db.patch(args.billingState._id, {
    state: nextState,
    ...(args.update.clearFreeManager ? { freeManagerPersonId: undefined } : {}),
    version: nextVersion,
    updatedAt: args.now,
  });

  if (args.update.recoveryManagersChanged && args.update.recoveryManagerPersonIds) {
    const previousCount = restrictedState?.recoveryManagerPersonIds.length ?? 0;
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.actor.organization._id,
      actorUserId: args.actor.member.userId,
      actorPersonId: args.actor.person._id,
      action: "organization.recovery_managers_changed",
      targetKind: "billing",
      targetId: args.billingState._id,
      fromState: `recoveryManagers:${previousCount}`,
      toState: `recoveryManagers:${args.update.recoveryManagerPersonIds.length}`,
      correlationId: `${args.correlationId}:recovery-managers`,
      occurredAt: args.now,
    });
  }
  if (args.update.clearFreeManager) {
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.actor.organization._id,
      actorUserId: args.actor.member.userId,
      actorPersonId: args.actor.person._id,
      action: "organization.free_selection_changed",
      targetKind: "billing",
      targetId: args.billingState._id,
      fromState: "managerSelected",
      toState: "managerUnselected",
      correlationId: `${args.correlationId}:free-selection`,
      occurredAt: args.now,
    });
  }

  const deadlineAt = getOrganizationBillingStateDeadline(nextState);
  if (deadlineAt !== null) {
    await ctx.scheduler.runAt(deadlineAt, internal.organizationBilling.mutations.processDeadline, {
      organizationId: args.billingState.organizationId,
      expectedVersion: nextVersion,
      expectedDeadlineAt: deadlineAt,
    });
  }
}

type FullOrganizationPersonRemovalPlan = {
  person: Doc<"organizationPeople">;
  member: Doc<"organizationMembers"> | null;
  staffs: Doc<"staffs">[];
  staffIds: Id<"staffs">[];
  invitations: Doc<"organizationInvitations">[];
  targetUserId: Id<"users"> | undefined;
  billingReferenceUpdate: BillingReferenceUpdate;
};

async function prepareFullOrganizationPersonRemoval(
  ctx: MutationCtx,
  args: {
    actor: OrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    person: Doc<"organizationPeople">;
    member: Doc<"organizationMembers"> | null;
  },
): Promise<FullOrganizationPersonRemovalPlan> {
  const billingEmail = (args.actor.organization.billingEmailNormalized ?? args.actor.organization.billingEmail ?? "")
    .trim()
    .toLowerCase();
  if (billingEmail && billingEmail === args.person.emailNormalized.trim().toLowerCase()) {
    throw new ConvexError("請求先メールアドレスを変更してから削除してください");
  }
  const billingReferenceUpdate = await planBillingReferenceUpdate(ctx, args.billingState, args.person._id);
  if (args.member?.status === "active") {
    const hasOtherManager = await hasOtherValidActiveManager(ctx, args.actor.organization._id, args.person._id);
    if (!hasOtherManager) throw new ConvexError("最後の有効管理者は削除できません");
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.actor.organization._id).eq("organizationPersonId", args.person._id),
    )
    .collect();
  const staffIds = staffs.map((staff) => staff._id);
  if (await hasFutureAssignment(ctx, staffIds)) throw new ConvexError(FUTURE_ASSIGNMENT_ERROR);
  const invitations = await findPendingInvitationsForRemovedPerson(ctx, {
    organizationId: args.actor.organization._id,
    person: args.person,
    member: args.member,
  });
  return {
    person: args.person,
    member: args.member,
    staffs,
    staffIds,
    invitations,
    targetUserId: args.person.userId ?? args.member?.userId,
    billingReferenceUpdate,
  };
}

async function applyFullOrganizationPersonRemoval(
  ctx: MutationCtx,
  args: {
    actor: OrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    plan: FullOrganizationPersonRemovalPlan;
    auditAction: OrganizationAuditAction;
    auditToState: string;
    correlationId: string;
    now: number;
  },
) {
  await ctx.db.patch(args.plan.person._id, { status: "removed", updatedAt: args.now });
  if (args.plan.member && args.plan.member.status !== "removed") {
    await ctx.db.patch(args.plan.member._id, { status: "removed", updatedAt: args.now });
  }
  for (const staff of args.plan.staffs) {
    if (!staff.isDeleted) await ctx.db.patch(staff._id, { isDeleted: true });
  }
  await revokePendingInvitations(ctx, args.plan.invitations, args.now);
  if (args.plan.targetUserId) {
    await deactivateLegacyPersonMemberships(ctx, args.actor.organization._id, args.plan.targetUserId);
  }
  await revokeStaffAccessForRemoval(ctx, args.plan.staffIds, args.now);
  await cancelOrganizationRecipientBusinessNotifications(ctx, {
    organizationId: args.actor.organization._id,
    staffIds: args.plan.staffIds,
    userId: args.plan.targetUserId,
    invitationIds: args.plan.invitations.map((invitation) => invitation._id),
    includeBillingUserNotifications: true,
  });
  await applyBillingReferenceUpdate(ctx, {
    actor: args.actor,
    billingState: args.billingState,
    update: args.plan.billingReferenceUpdate,
    correlationId: args.correlationId,
    now: args.now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: args.actor.organization._id,
    actorUserId: args.actor.member.userId,
    actorPersonId: args.actor.person._id,
    action: args.auditAction,
    targetKind: "person",
    targetId: args.plan.person._id,
    fromState: "active",
    toState: args.auditToState,
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
}

/** 対象店舗のスタッフ所属だけを終了し、事業者人物・管理者権限は維持する。 */
export const removePersonFromShop = authenticatedMutation({
  args: { shopId: v.id("shops"), staffId: v.id("staffs"), requestId: v.string() },
  returns: personRemovalResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    if (
      await isCompletedPersonRemovalActorRetry(ctx, {
        shopId: args.shopId,
        operation: "shop",
        targetId: args.staffId,
        requestId,
      })
    ) {
      return { changed: false };
    }

    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    if (shopStatus(actor.shop) !== "active") {
      throw new ConvexError("稼働中の店舗だけ所属を変更できます");
    }
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const { audit, correlationId } = await findPersonRemovalAudit(ctx, {
      organizationId: actor.organization._id,
      operation: "shop",
      targetId: args.staffId,
      requestId,
    });
    if (audit) return { changed: false };

    const staff = await ctx.db.get(args.staffId);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== actor.shop._id ||
      staff.organizationId !== actor.organization._id ||
      !staff.organizationPersonId
    ) {
      throw new ConvexError("Not found");
    }
    const person = await ctx.db.get(staff.organizationPersonId);
    if (!person || person.organizationId !== actor.organization._id || person.status !== "active") {
      throw new ConvexError("Not found");
    }
    if (await hasFutureAssignment(ctx, [staff._id])) throw new ConvexError(FUTURE_ASSIGNMENT_ERROR);

    const now = Date.now();
    await ctx.db.patch(staff._id, { isDeleted: true });
    await revokeStaffAccessForRemoval(ctx, [staff._id], now);
    await cancelOrganizationRecipientBusinessNotifications(ctx, {
      organizationId: actor.organization._id,
      staffIds: [staff._id],
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.person_removed_from_shop",
      targetKind: "person",
      targetId: person._id,
      fromState: `active:${actor.shop._id}`,
      toState: `removed:${actor.shop._id}`,
      correlationId,
      occurredAt: now,
    });
    return { changed: true };
  },
});

/** 対象人物の事業者内アクセスをすべて終了し、履歴レコードは保持する。 */
export const removePersonFromOrganization = authenticatedMutation({
  args: { shopId: v.id("shops"), personId: v.id("organizationPeople"), requestId: v.string() },
  returns: personRemovalResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    if (
      await isCompletedPersonRemovalActorRetry(ctx, {
        shopId: args.shopId,
        operation: "organization",
        targetId: args.personId,
        requestId,
      })
    ) {
      return { changed: false };
    }

    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      allowReadOnly: true,
    });
    const billingState = await authorizeOrganizationPersonRemoval(ctx, actor);
    const { audit, correlationId } = await findPersonRemovalAudit(ctx, {
      organizationId: actor.organization._id,
      operation: "organization",
      targetId: args.personId,
      requestId,
    });
    if (audit) return { changed: false };

    const person = await ctx.db.get(args.personId);
    if (!person || person.organizationId !== actor.organization._id || person.status !== "active") {
      throw new ConvexError("Not found");
    }
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", actor.organization._id).eq("personId", person._id),
      )
      .take(2);
    if (members.length > 1) throw new ConvexError("Not found");
    const member = members[0] ?? null;
    if (member && person.userId !== member.userId) throw new ConvexError("Not found");
    const plan = await prepareFullOrganizationPersonRemoval(ctx, { actor, billingState, person, member });
    const now = Date.now();
    await applyFullOrganizationPersonRemoval(ctx, {
      actor,
      billingState,
      plan,
      auditAction: "organization.person_removed",
      auditToState: "removed",
      correlationId,
      now,
    });
    return { changed: true };
  },
});

/** 管理者権限だけを明示的に終了し、スタッフ所属がなければ事業者アクセスも終了する。 */
export const removeManagerRole = authenticatedMutation({
  args: { shopId: v.id("shops"), personId: v.id("organizationPeople"), requestId: v.string() },
  returns: personRemovalResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    if (
      await isCompletedPersonRemovalActorRetry(ctx, {
        shopId: args.shopId,
        operation: "managerRole",
        targetId: args.personId,
        requestId,
      })
    ) {
      return { changed: false };
    }

    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      allowReadOnly: true,
    });
    const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
    const { audit, correlationId } = await findPersonRemovalAudit(ctx, {
      organizationId: actor.organization._id,
      operation: "managerRole",
      targetId: args.personId,
      requestId,
    });
    if (audit) return { changed: false };

    const person = await ctx.db.get(args.personId);
    if (!person || person.organizationId !== actor.organization._id || person.status !== "active" || !person.userId) {
      throw new ConvexError("Not found");
    }
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", actor.organization._id).eq("personId", person._id),
      )
      .take(2);
    if (members.length !== 1 || members[0].status !== "active" || members[0].userId !== person.userId) {
      throw new ConvexError("Not found");
    }
    const member = members[0];

    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
    if (restrictedState) {
      if (restrictedState.recoveryManagerPersonIds.includes(person._id)) {
        await planBillingReferenceUpdate(ctx, billingState, person._id);
      }
      throw new ConvexError("契約制限中は管理権限を外せません");
    }
    if (actor.member.status !== "active") throw new ConvexError("この操作を行う権限がありません");
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    await requireOrganizationPaidFeature(ctx, actor.organization._id);
    if (!(await hasOtherValidActiveManager(ctx, actor.organization._id, person._id))) {
      throw new ConvexError("最後の有効管理者は削除できません");
    }

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", actor.organization._id).eq("organizationPersonId", person._id),
      )
      .collect();
    const hasActiveStaffRole = staffs.some((staff) => !staff.isDeleted);
    const now = Date.now();
    if (!hasActiveStaffRole) {
      const plan = await prepareFullOrganizationPersonRemoval(ctx, {
        actor,
        billingState,
        person,
        member,
      });
      await applyFullOrganizationPersonRemoval(ctx, {
        actor,
        billingState,
        plan,
        auditAction: "organization.manager_role_removed",
        auditToState: "personRemoved",
        correlationId,
        now,
      });
      return { changed: true };
    }

    const billingReferenceUpdate = await planBillingReferenceUpdate(ctx, billingState, person._id);
    const invitations = await findPendingInvitationsIssuedByManager(ctx, actor.organization._id, member._id);
    await ctx.db.patch(member._id, { status: "removed", updatedAt: now });
    await deactivateLegacyPersonMemberships(ctx, actor.organization._id, member.userId);
    await revokePendingInvitations(ctx, invitations, now);
    await cancelOrganizationRecipientBusinessNotifications(ctx, {
      organizationId: actor.organization._id,
      userId: member.userId,
      invitationIds: invitations.map((invitation) => invitation._id),
      includeBillingUserNotifications: true,
      preserveStaffNotificationsForUser: true,
    });
    await applyBillingReferenceUpdate(ctx, {
      actor,
      billingState,
      update: billingReferenceUpdate,
      correlationId,
      now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.manager_role_removed",
      targetKind: "person",
      targetId: person._id,
      fromState: "activeManager",
      toState: "staffOnly",
      correlationId,
      occurredAt: now,
    });
    return { changed: true };
  },
});
