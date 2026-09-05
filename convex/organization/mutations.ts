import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedMutation, organizationMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { disconnectOrganizationPersonLine } from "../line/service";
import {
  cancelOrganizationRecipientBusinessNotifications,
  prepareOrganizationRecipientBusinessNotificationsForCancellation,
} from "../notificationOutbox/mutations";
import { scheduleOrganizationBillingStateDeadline } from "../organizationBilling/deadline";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationBusinessWriteOrLimitRecoveryCapability,
  requireOrganizationCapacity,
  requireOrganizationPaidFeature,
} from "../organizationBilling/service";
import {
  collectIssuedInvitationsByInviter,
  collectIssuedInvitationsByOrganization,
} from "../organizationInvitation/lifecycle";
import { ensureDefaultPosition } from "../position/service";
import { recalculateOpenRecruitmentStatsForShops } from "../recruitment/stats";
import { updateShopSettingsSchema } from "../shop/schemas";
import { editStaffSchema } from "../staff/schemas";
import { type OrganizationActor, requireOrganizationActorForShop, requireOrganizationReadActor } from "./access";
import { type OrganizationAuditAction, recordOrganizationAuditEvent } from "./audit";
import { getOrganizationDeletionEligibility } from "./deletion";
import { updateOrganizationPersonProfile } from "./personProfile";
import {
  applyPreparedStaffAccessRemoval,
  collectPersonRemovalPreview,
  deletePersonRemovalAssignments,
  expectedPersonRemovalPreviewValidator,
  type PersonRemovalPreview,
  prepareStaffAccessForRemoval,
  revokeStaffAccessForRemoval,
  STALE_PERSON_REMOVAL_PREVIEW_ERROR,
  type StaffAccessRemovalRecords,
} from "./personRemoval";
import { organizationNameSchema } from "./schemas";
import {
  getValidActiveOrganizationManagerPersonIds,
  requireOrganizationBillingState,
  requireOrganizationPersonWithoutManagerRole,
} from "./service";
import { safelyDeactivateOrganizationStaffOrder, syncActivatedOrganizationStaffOrder } from "./staffOrder";

const shopMutationResultValidator = v.object({
  shopId: v.id("shops"),
  changed: v.boolean(),
});

const deleteShopResultValidator = v.object({
  shopId: v.id("shops"),
  changed: v.boolean(),
});

const deleteOrganizationResultValidator = v.object({
  organizationId: v.id("organizations"),
  changed: v.boolean(),
  accepted: v.boolean(),
});

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const ACCOUNT_DELETION_DEPARTURE_STAFF_RECORD_LIMIT = 50;
export const ACCOUNT_DELETION_DEPARTURE_INVITATION_RECORD_LIMIT = 50;
export const ACCOUNT_DELETION_DEPARTURE_ACCESS_RECORD_LIMIT = 200;
export const ACCOUNT_DELETION_DEPARTURE_NOTIFICATION_RECORD_LIMIT = 200;
export const ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR =
  "アカウントに紐づく所属情報が多いため、安全に削除できません。";
export const ACCOUNT_DELETION_ASSOCIATED_RECORD_OWNERSHIP_ERROR = "アカウントに紐づく所属情報の範囲を確認できません。";

export function classifyAccountDeletionOrganizationDepartureError(error: unknown) {
  if (!(error instanceof ConvexError)) return null;
  if (error.data === ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR) {
    return "tooManyAssociatedRecords" as const;
  }
  if (error.data === ACCOUNT_DELETION_ASSOCIATED_RECORD_OWNERSHIP_ERROR) {
    return "inconsistentAssociation" as const;
  }
  return null;
}

function shopMutationResult(shopId: Id<"shops">, changed: boolean) {
  return { shopId, changed };
}

async function getPriorAddedShop(
  ctx: MutationCtx,
  args: {
    correlationId: string;
    organizationId: Id<"organizations">;
  },
) {
  const audit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .first();
  if (!audit) return null;
  const shopId = audit.targetId ? ctx.db.normalizeId("shops", audit.targetId) : null;
  if (!shopId) throw new ConvexError("以前の操作結果を確認できません");
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.organizationId !== args.organizationId || shop.isDeleted) {
    throw new ConvexError("以前の操作結果を確認できません");
  }
  return shop;
}

function shopDeletionCorrelationId(organizationId: Id<"organizations">, shopId: Id<"shops">, requestId: string) {
  return `${organizationId}:shop:delete:${shopId}:${requestId}`;
}

async function findShopDeletionAudit(ctx: MutationCtx, correlationId: string) {
  return await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .first();
}

function isMatchingShopDeletionAudit(
  audit: Doc<"organizationAuditEvents">,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    actorUserId: Id<"users">;
  },
) {
  return (
    audit.organizationId === args.organizationId &&
    audit.action === "organization.shop_deleted" &&
    audit.targetKind === "shop" &&
    audit.targetId === args.shopId &&
    audit.actorUserId === args.actorUserId
  );
}

async function validateCanonicalManagersForShopAddition(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .collect();
  const userIds = new Set<Id<"users">>();
  for (const member of activeMembers) {
    if (userIds.has(member.userId)) throw new ConvexError("管理者所属を一意に確認できません");
    const [person, user] = await Promise.all([ctx.db.get(member.personId), ctx.db.get(member.userId)]);
    if (
      !person ||
      person.organizationId !== organizationId ||
      person.userId !== member.userId ||
      person.status !== "active" ||
      !user ||
      user.isDeleted ||
      user.accountDeletionRequestedAt !== undefined
    ) {
      throw new ConvexError("管理者所属を確認できません");
    }
    userIds.add(member.userId);
  }
}

async function updateOrganizationNameForActor(
  ctx: MutationCtx,
  args: { name: string; requestId: string },
  actor: Pick<OrganizationActor, "organization" | "member" | "person">,
) {
  await requireOrganizationBusinessWrite(ctx, actor.organization._id);
  const parsed = organizationNameSchema.safeParse(args.name);
  if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
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
}

export const updateOrganizationNameForOrganization = organizationMutation({
  args: { name: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) =>
    await updateOrganizationNameForActor(ctx, args, {
      organization: ctx.organization,
      member: ctx.organizationMember,
      person: ctx.organizationPerson,
    }),
});

export const updatePersonProfile = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
    personId: v.id("organizationPeople"),
    name: v.string(),
    email: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    if (!ctx.user) throw new ConvexError("Not found");
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    if (actor.organization._id !== args.expectedOrganizationId) {
      throw new ConvexError("Not found");
    }
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = editStaffSchema.safeParse({ name: args.name, email: args.email });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }

    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `${actor.organization._id}:person-profile:${args.personId}:${requestKey}`;
    const prior = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    if (prior) {
      if (
        prior.action !== "organization.person_profile_updated" ||
        prior.organizationId !== actor.organization._id ||
        prior.actorUserId !== actor.member.userId ||
        prior.targetKind !== "person" ||
        prior.targetId !== args.personId
      ) {
        throw new ConvexError("以前の操作結果を確認できません");
      }
      return { changed: false };
    }

    const result = await updateOrganizationPersonProfile(ctx, {
      organizationId: actor.organization._id,
      personId: args.personId,
      actorUser: ctx.user,
      notificationShopId: actor.shop._id,
      name: parsed.data.name,
      email: parsed.data.email,
    });
    if (!result.changed) return { changed: false };

    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.person_profile_updated",
      targetKind: "person",
      targetId: args.personId,
      correlationId,
    });
    return { changed: true };
  },
});

type AddShopArgs = {
  shopName: string;
  regularClosedDays: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
  submissionPattern: typeof submissionPatternValidator.type;
  requestId: string;
};

async function addShopForActor(
  ctx: MutationCtx,
  args: AddShopArgs,
  actor: Pick<OrganizationActor, "organization" | "member" | "person">,
) {
  await requireOrganizationBusinessWrite(ctx, actor.organization._id);
  const parsed = updateShopSettingsSchema.safeParse({
    shopName: args.shopName,
    regularClosedDays: args.regularClosedDays,
    submissionPattern: args.submissionPattern,
  });
  if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const requestId = await toAuditRequestKey(args.requestId);
  const organization = actor.organization;
  const correlationId = `${organization._id}:shop:add:${requestId}`;
  const priorShop = await getPriorAddedShop(ctx, { correlationId, organizationId: organization._id });
  if (priorShop) return shopMutationResult(priorShop._id, false);

  // 店舗追加は複数店舗機能なので、Freeでは空きがあっても許可しない。
  await requireOrganizationPaidFeature(ctx, organization._id);
  await requireOrganizationCapacity(ctx, {
    organizationId: organization._id,
    additionalShops: 1,
  });
  await validateCanonicalManagersForShopAddition(ctx, organization._id);

  const now = Date.now();
  const shopId = await ctx.db.insert("shops", {
    organizationId: organization._id,
    name: parsed.data.shopName,
    regularClosedDays: WEEKDAY_ORDER.filter((day) => parsed.data.regularClosedDays.includes(day)),
    submissionPattern: normalizeSubmissionPattern(parsed.data.submissionPattern),
    isDeleted: false,
  });
  await ensureDefaultPosition(ctx, shopId);
  await syncActivatedOrganizationStaffOrder(ctx, { organizationId: organization._id });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: organization._id,
    actorUserId: actor.member.userId,
    actorPersonId: actor.person._id,
    action: "organization.shop_added",
    targetKind: "shop",
    targetId: shopId,
    correlationId,
    occurredAt: now,
  });
  return shopMutationResult(shopId, true);
}

const addShopArgs = {
  shopName: v.string(),
  regularClosedDays: v.array(
    v.union(
      v.literal("sun"),
      v.literal("mon"),
      v.literal("tue"),
      v.literal("wed"),
      v.literal("thu"),
      v.literal("fri"),
      v.literal("sat"),
    ),
  ),
  submissionPattern: submissionPatternValidator,
  requestId: v.string(),
};

export const addShopForOrganization = organizationMutation({
  args: addShopArgs,
  returns: shopMutationResultValidator,
  handler: async (ctx, args) =>
    await addShopForActor(ctx, args, {
      organization: ctx.organization,
      member: ctx.organizationMember,
      person: ctx.organizationPerson,
    }),
});

/**
 * 組織店舗を論理削除する。
 *
 * 店舗の削除フラグを同一トランザクションで先に確定し、所属・session・token・通知の
 * 後片付けは既存の bounded cleanup へ委譲する。最後の店舗は組織設定へ到達するための
 * context を失うため削除しない。
 */
export const deleteShop = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
    confirmShopId: v.id("shops"),
    requestId: v.string(),
  },
  returns: deleteShopResultValidator,
  handler: async (ctx, args) => {
    if (args.confirmShopId !== args.shopId) throw new ConvexError("Not found");

    const requestId = await toAuditRequestKey(args.requestId);
    const requestedShop = await ctx.db.get(args.shopId);
    if (
      requestedShop?.isDeleted &&
      requestedShop.organizationId === args.expectedOrganizationId &&
      ctx.user &&
      !ctx.user.isDeleted
    ) {
      const correlationId = shopDeletionCorrelationId(requestedShop.organizationId, requestedShop._id, requestId);
      const priorAudit = await findShopDeletionAudit(ctx, correlationId);
      if (
        priorAudit &&
        isMatchingShopDeletionAudit(priorAudit, {
          organizationId: requestedShop.organizationId,
          shopId: requestedShop._id,
          actorUserId: ctx.user._id,
        })
      ) {
        return { shopId: requestedShop._id, changed: false };
      }
    }

    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    if (actor.organization._id !== args.expectedOrganizationId) {
      throw new ConvexError("Not found");
    }
    const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
    await requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
      organizationId: actor.organization._id,
      personId: actor.person._id,
      capability: "deleteShop",
    });
    const correlationId = shopDeletionCorrelationId(actor.organization._id, actor.shop._id, requestId);
    const priorAudit = await findShopDeletionAudit(ctx, correlationId);
    if (priorAudit) {
      if (
        isMatchingShopDeletionAudit(priorAudit, {
          organizationId: actor.organization._id,
          shopId: actor.shop._id,
          actorUserId: actor.member.userId,
        })
      ) {
        return { shopId: actor.shop._id, changed: false };
      }
      throw new ConvexError("以前の操作結果を確認できません");
    }

    const nonDeletedShops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_isDeleted", (q) =>
        q.eq("organizationId", actor.organization._id).eq("isDeleted", false),
      )
      .take(2);
    if (nonDeletedShops.length <= 1) {
      throw new ConvexError("最後の店舗は削除できません");
    }

    const now = Date.now();
    await ctx.db.patch(actor.shop._id, { isDeleted: true });
    await syncActivatedOrganizationStaffOrder(ctx, { organizationId: actor.organization._id });
    if (billingState.freeShopId === actor.shop._id) {
      const updatedBillingState = {
        ...billingState,
        freeShopId: undefined,
        version: billingState.version + 1,
        updatedAt: now,
      };
      await ctx.db.patch(billingState._id, {
        freeShopId: updatedBillingState.freeShopId,
        version: updatedBillingState.version,
        updatedAt: updatedBillingState.updatedAt,
      });
      await scheduleOrganizationBillingStateDeadline(ctx, updatedBillingState);
    }
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.shop_deleted",
      targetKind: "shop",
      targetId: actor.shop._id,
      toState: "deleted",
      correlationId,
      occurredAt: now,
    });
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId: actor.shop._id,
      organizationId: actor.organization._id,
      requestId,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return { shopId: actor.shop._id, changed: true };
  },
});

function organizationDeletionCorrelationId(organizationId: Id<"organizations">, requestId: string) {
  return `${organizationId}:organization:delete:${requestId}`;
}

/**
 * 組織を論理削除し、権限・連絡手段の失効cleanupを一つの受付transactionで開始する。
 * clientの組織ID・確認ID・更新時刻はすべて、Clerk identityから解決したactive所属と照合する。
 */
/** app用。店舗を認可anchorにせず、URLのcanonical組織を再検証して削除を受け付ける。 */
export const deleteOrganizationForOrganization = authenticatedMutation({
  args: {
    organizationId: v.id("organizations"),
    confirmOrganizationId: v.id("organizations"),
    expectedOrganizationUpdatedAt: v.number(),
    requestId: v.string(),
  },
  returns: deleteOrganizationResultValidator,
  handler: async (ctx, args) => {
    if (args.confirmOrganizationId !== args.organizationId) throw new ConvexError("Not found");
    const requestId = await toAuditRequestKey(args.requestId);
    const correlationId = organizationDeletionCorrelationId(args.organizationId, requestId);
    const priorAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    if (priorAudit) {
      if (
        ctx.user &&
        priorAudit.organizationId === args.organizationId &&
        priorAudit.action === "organization.deleted" &&
        priorAudit.targetKind === "organization" &&
        priorAudit.targetId === args.organizationId &&
        priorAudit.actorUserId === ctx.user._id
      ) {
        return { organizationId: args.organizationId, changed: false, accepted: true };
      }
      throw new ConvexError("以前の操作結果を確認できません");
    }

    const actor = await requireOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId: args.organizationId,
    });
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    if (actor.organization.updatedAt !== args.expectedOrganizationUpdatedAt) {
      throw new ConvexError("組織の状態が変わりました。\n画面を更新してから、もう一度お試しください。");
    }
    const result = await beginOrganizationDeletion(ctx, {
      actor,
      requestKey: requestId,
      correlationId,
      now: Date.now(),
    });
    return { organizationId: result.organizationId, changed: result.changed, accepted: true };
  },
});

const personRemovalResultValidator = v.object({ changed: v.boolean() });
type PersonRemovalCtx = MutationCtx & { user: Doc<"users"> | null };
type OrganizationReadCtx = Pick<QueryCtx | MutationCtx, "db">;
export type AccountDeletionOrganizationActor = Pick<OrganizationActor, "organization" | "person" | "member">;

async function requireCanonicalAccountDeletionOrganizationActor(
  ctx: OrganizationReadCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    accountUserId: Id<"users">;
    allowFormerManager?: boolean;
  },
) {
  const { actor } = args;
  const hasAllowedMemberStatus =
    actor.member.status === "active" || (args.allowFormerManager === true && actor.member.status === "removed");
  if (
    actor.organization.isDeleted ||
    actor.person.organizationId !== actor.organization._id ||
    actor.person.status !== "active" ||
    actor.person.userId !== args.accountUserId ||
    actor.member.organizationId !== actor.organization._id ||
    actor.member.personId !== actor.person._id ||
    actor.member.userId !== args.accountUserId ||
    !hasAllowedMemberStatus
  ) {
    throw new ConvexError("管理者所属を確認できません");
  }

  const [membersForUser, membersForPerson] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", args.accountUserId).eq("organizationId", actor.organization._id),
      )
      .take(2),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", actor.organization._id).eq("personId", actor.person._id),
      )
      .take(2),
  ]);
  if (
    membersForUser.length !== 1 ||
    membersForUser[0]._id !== actor.member._id ||
    membersForPerson.length !== 1 ||
    membersForPerson[0]._id !== actor.member._id
  ) {
    throw new ConvexError("管理者所属を一意に確認できません");
  }
}

async function beginOrganizationDeletion(
  ctx: MutationCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    requestKey: string;
    correlationId: string;
    now: number;
  },
) {
  const billingState = await requireOrganizationBillingState(ctx, args.actor.organization._id);
  const eligibility = await getOrganizationDeletionEligibility(ctx, {
    organizationId: args.actor.organization._id,
    actorMemberId: args.actor.member._id,
    billingState,
  });
  if (!eligibility.canDelete) throw new ConvexError(eligibility.reason);

  await ctx.db.patch(args.actor.organization._id, {
    isDeleted: true,
    updatedAt: args.now,
  });
  await safelyDeactivateOrganizationStaffOrder(ctx, { organizationId: args.actor.organization._id });
  await ctx.db.patch(billingState._id, {
    businessNotificationCutoffAt: args.now,
    businessNotificationCutoffVersion: billingState.version + 1,
    version: billingState.version + 1,
    updatedAt: args.now,
  });

  await recordOrganizationAuditEvent(ctx, {
    organizationId: args.actor.organization._id,
    actorUserId: args.actor.member.userId,
    actorPersonId: args.actor.person._id,
    action: "organization.deleted",
    targetKind: "organization",
    targetId: args.actor.organization._id,
    fromState: "active",
    toState: "deleted",
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
  const cleanupJob = await ensureDeletionCleanupJob(ctx, {
    scope: "organization",
    organizationId: args.actor.organization._id,
    requestId: args.requestKey,
  });
  await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
  return {
    organizationId: args.actor.organization._id,
    cleanupJobId: cleanupJob._id,
    changed: true,
  };
}

/** strict再認証済みのアカウント削除受付から、sole-admin組織のcleanupを開始する。 */
export async function beginAccountDeletionOrganizationDeletion(
  ctx: MutationCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    accountUserId: Id<"users">;
    requestId: string;
    now: number;
  },
) {
  const requestKey = await toAuditRequestKey(args.requestId);
  const correlationId = organizationDeletionCorrelationId(args.actor.organization._id, requestKey);
  const priorAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .take(2);
  if (priorAudits.length > 1) throw new ConvexError("以前の操作結果を確認できません");
  const priorAudit = priorAudits[0];
  if (priorAudit) {
    if (
      priorAudit.organizationId !== args.actor.organization._id ||
      priorAudit.action !== "organization.deleted" ||
      priorAudit.targetKind !== "organization" ||
      priorAudit.targetId !== args.actor.organization._id ||
      priorAudit.actorUserId !== args.accountUserId
    ) {
      throw new ConvexError("以前の操作結果を確認できません");
    }
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "organization",
      organizationId: args.actor.organization._id,
      requestId: requestKey,
    });
    return {
      organizationId: args.actor.organization._id,
      cleanupJobId: cleanupJob._id,
      changed: false,
    };
  }

  await requireCanonicalAccountDeletionOrganizationActor(ctx, args);
  return await beginOrganizationDeletion(ctx, {
    actor: args.actor,
    requestKey,
    correlationId,
    now: args.now,
  });
}

function personRemovalCorrelationId(
  organizationId: Id<"organizations">,
  operation: "shop" | "organization" | "managerRole",
  targetId: string,
  requestId: string,
) {
  return operation === "managerRole"
    ? `${organizationId}:person-removal:${operation}:${requestId}`
    : `${organizationId}:person-removal:${operation}:${targetId}:${requestId}`;
}

function legacyManagerRoleRemovalCorrelationId(
  organizationId: Id<"organizations">,
  targetId: string,
  requestId: string,
) {
  return `${organizationId}:person-removal:managerRole:${targetId}:${requestId}`;
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
  const audits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .take(2);
  if (audits.length > 1) {
    throw new ConvexError("以前の操作結果を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  const audit = audits[0];
  if (
    audit &&
    args.operation === "managerRole" &&
    (audit.organizationId !== args.organizationId ||
      audit.action !== "organization.manager_role_removed" ||
      audit.targetKind !== "person" ||
      audit.targetId !== args.targetId)
  ) {
    throw new ConvexError("以前の管理者権限変更と対象が一致しません。\n画面を更新して、もう一度お試しください。");
  }
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
    expectedOrganizationId?: Id<"organizations">;
  },
) {
  if (!ctx.user) return false;
  const shop = await ctx.db.get(args.shopId);
  if (!shop) return false;
  const organizationId = shop.organizationId;
  if (args.expectedOrganizationId && organizationId !== args.expectedOrganizationId) return false;
  const { audit } = await findPersonRemovalAudit(ctx, {
    organizationId,
    operation: args.operation,
    targetId: args.targetId,
    requestId: args.requestId,
  });
  if (audit) {
    if (audit.actorUserId !== ctx.user._id) {
      throw new ConvexError("以前の操作結果を確認できません。\n画面を更新して、もう一度お試しください。");
    }
    return true;
  }
  if (args.operation !== "managerRole") return false;

  // rolling中に旧correlation形式で完了した自己解除retryも回収する。
  const legacyAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) =>
      q.eq("correlationId", legacyManagerRoleRemovalCorrelationId(organizationId, args.targetId, args.requestId)),
    )
    .take(2);
  if (legacyAudits.length !== 1) return false;
  const legacyAudit = legacyAudits[0];
  return Boolean(
    legacyAudit.actorUserId === ctx.user._id &&
      legacyAudit.action === "organization.manager_role_removed" &&
      legacyAudit.targetKind === "person" &&
      legacyAudit.targetId === args.targetId,
  );
}

async function isCompletedOrganizationManagerRoleRetry(
  ctx: PersonRemovalCtx,
  args: {
    organizationId: Id<"organizations">;
    targetId: string;
    requestId: string;
  },
) {
  if (!ctx.user) return false;
  const { audit } = await findPersonRemovalAudit(ctx, {
    organizationId: args.organizationId,
    operation: "managerRole",
    targetId: args.targetId,
    requestId: args.requestId,
  });
  if (audit) {
    if (audit.actorUserId !== ctx.user._id) {
      throw new ConvexError("以前の操作結果を確認できません。\n画面を更新して、もう一度お試しください。");
    }
    return true;
  }
  const legacyAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) =>
      q.eq("correlationId", legacyManagerRoleRemovalCorrelationId(args.organizationId, args.targetId, args.requestId)),
    )
    .take(2);
  if (legacyAudits.length !== 1) return false;
  const legacyAudit = legacyAudits[0];
  return Boolean(
    legacyAudit.actorUserId === ctx.user._id &&
      legacyAudit.action === "organization.manager_role_removed" &&
      legacyAudit.targetKind === "person" &&
      legacyAudit.targetId === args.targetId,
  );
}

async function authorizeOrganizationPersonRemoval(ctx: MutationCtx, actor: OrganizationActor) {
  const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
  await requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
    organizationId: actor.organization._id,
    personId: actor.person._id,
    capability: "removeOrganizationPerson",
  });
  return billingState;
}

function assertPersonRemovalPreview(
  preview: PersonRemovalPreview,
  expected: { assignmentCount: number; fingerprint: string } | undefined,
) {
  if (preview.kind === "tooMany") {
    throw new ConvexError(
      `今日以降のシフトの割り当てが${preview.limit}件を超えています。
先にシフトを整理してから、削除してください。`,
    );
  }
  // 旧クライアントは0件だけ互換許容する。割当がある削除は必ず明示確認を要求する。
  if (!expected) {
    if (preview.assignmentCount > 0) throw new ConvexError(STALE_PERSON_REMOVAL_PREVIEW_ERROR);
    return preview.assignmentIds;
  }
  if (expected.assignmentCount !== preview.assignmentCount || expected.fingerprint !== preview.fingerprint) {
    throw new ConvexError(STALE_PERSON_REMOVAL_PREVIEW_ERROR);
  }
  return preview.assignmentIds;
}

async function findPendingInvitationsForRemovedPerson(
  ctx: OrganizationReadCtx,
  args: {
    organizationId: Id<"organizations">;
    person: Doc<"organizationPeople">;
    member: Doc<"organizationMembers"> | null;
    recordLimit?: number;
    limitExceededError?: string;
  },
) {
  if (args.recordLimit !== undefined) {
    return await findPendingInvitationsForRemovedPersonBounded(ctx, {
      ...args,
      recordLimit: args.recordLimit,
    });
  }
  const invitations = new Map<Id<"organizationInvitations">, Doc<"organizationInvitations">>();
  if (args.member) {
    const issued = await findPendingInvitationsIssuedByManager(ctx, args.organizationId, args.member._id);
    for (const invitation of issued) invitations.set(invitation._id, invitation);
  }
  const addressedToPerson = (await collectIssuedInvitationsByOrganization(ctx, args.organizationId)).filter(
    (invitation) =>
      invitation.targetPersonId === args.person._id || invitation.emailNormalized === args.person.emailNormalized,
  );
  for (const invitation of addressedToPerson) invitations.set(invitation._id, invitation);
  return [...invitations.values()];
}

async function findPendingInvitationsForRemovedPersonBounded(
  ctx: OrganizationReadCtx,
  args: {
    organizationId: Id<"organizations">;
    person: Doc<"organizationPeople">;
    member: Doc<"organizationMembers"> | null;
    recordLimit: number;
    limitExceededError?: string;
  },
) {
  if (!Number.isSafeInteger(args.recordLimit) || args.recordLimit < 1) {
    throw new Error("Invitation removal record limit must be a positive integer");
  }
  const invitations = new Map<Id<"organizationInvitations">, Doc<"organizationInvitations">>();
  const add = (rows: readonly Doc<"organizationInvitations">[]) => {
    if (rows.length > args.recordLimit) {
      throw new ConvexError(args.limitExceededError ?? ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR);
    }
    for (const invitation of rows) {
      if (invitation.organizationId === args.organizationId) invitations.set(invitation._id, invitation);
    }
    if (invitations.size > args.recordLimit) {
      throw new ConvexError(args.limitExceededError ?? ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR);
    }
  };

  const inviterMemberId = args.member?._id;
  if (inviterMemberId) {
    add(
      await ctx.db
        .query("organizationInvitations")
        .withIndex("by_inviterMemberId_and_status", (q) =>
          q.eq("inviterMemberId", inviterMemberId).eq("status", "issued"),
        )
        .take(args.recordLimit + 1),
    );
  }
  add(
    await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_targetPersonId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("targetPersonId", args.person._id).eq("status", "issued"),
      )
      .take(args.recordLimit + 1),
  );
  add(
    await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("emailNormalized", args.person.emailNormalized)
          .eq("status", "issued"),
      )
      .take(args.recordLimit + 1),
  );
  return [...invitations.values()];
}

async function findPendingInvitationsIssuedByManager(
  ctx: OrganizationReadCtx,
  organizationId: Id<"organizations">,
  memberId: Id<"organizationMembers">,
) {
  const invitations = await collectIssuedInvitationsByInviter(ctx, memberId);
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

async function hasOtherValidActiveManager(
  ctx: OrganizationReadCtx,
  organizationId: Id<"organizations">,
  excludedPersonId: Id<"organizationPeople">,
) {
  const validPersonIds = await getValidActiveOrganizationManagerPersonIds(ctx, organizationId);
  return validPersonIds.some((personId) => personId !== excludedPersonId);
}

type BillingReferenceUpdate = {
  clearFreeManager: boolean;
};

function planBillingReferenceUpdate(
  billingState: Doc<"organizationBillingStates">,
  removedPersonId: Id<"organizationPeople">,
): BillingReferenceUpdate {
  return { clearFreeManager: billingState.freeManagerPersonId === removedPersonId };
}

async function applyBillingReferenceUpdate(
  ctx: MutationCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    update: BillingReferenceUpdate;
    correlationId: string;
    now: number;
  },
) {
  if (!args.update.clearFreeManager) return;
  const nextVersion = args.billingState.version + 1;
  await ctx.db.patch(args.billingState._id, {
    freeManagerPersonId: undefined,
    version: nextVersion,
    updatedAt: args.now,
  });

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

  await scheduleOrganizationBillingStateDeadline(ctx, {
    organizationId: args.billingState.organizationId,
    state: args.billingState.state,
    version: nextVersion,
  });
}

export type FullOrganizationPersonRemovalPlan = {
  person: Doc<"organizationPeople">;
  member: Doc<"organizationMembers"> | null;
  staffs: Doc<"staffs">[];
  staffIds: Id<"staffs">[];
  invitations: Doc<"organizationInvitations">[];
  targetUserId: Id<"users"> | undefined;
  billingReferenceUpdate: BillingReferenceUpdate;
  preparedStaffAccessRecords?: StaffAccessRemovalRecords;
  notificationCandidateLimit?: number;
};

async function prepareFullOrganizationPersonRemoval(
  ctx: OrganizationReadCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    person: Doc<"organizationPeople">;
    member: Doc<"organizationMembers"> | null;
    accountDeletionRecordLimits?: {
      staff: number;
      invitation: number;
    };
  },
): Promise<FullOrganizationPersonRemovalPlan> {
  const billingReferenceUpdate = planBillingReferenceUpdate(args.billingState, args.person._id);
  if (args.member?.status === "active") {
    const hasOtherManager = await hasOtherValidActiveManager(ctx, args.actor.organization._id, args.person._id);
    if (!hasOtherManager) throw new ConvexError("管理権限を外してから削除してください。");
  }

  const staffQuery = ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.actor.organization._id).eq("organizationPersonId", args.person._id),
    );
  const staffs = args.accountDeletionRecordLimits
    ? await staffQuery.take(args.accountDeletionRecordLimits.staff + 1)
    : await staffQuery.collect();
  if (args.accountDeletionRecordLimits && staffs.length > args.accountDeletionRecordLimits.staff) {
    throw new ConvexError(ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR);
  }
  if (args.accountDeletionRecordLimits) {
    for (const staff of staffs) {
      const shop = await ctx.db.get(staff.shopId);
      if (
        !shop ||
        shop.organizationId !== args.actor.organization._id ||
        staff.organizationId !== args.actor.organization._id ||
        staff.organizationPersonId !== args.person._id ||
        (staff.userId !== undefined && staff.userId !== args.actor.member.userId)
      ) {
        throw new ConvexError(ACCOUNT_DELETION_ASSOCIATED_RECORD_OWNERSHIP_ERROR);
      }
    }
  }
  const staffIds = staffs.map((staff) => staff._id);
  const invitations = await findPendingInvitationsForRemovedPerson(ctx, {
    organizationId: args.actor.organization._id,
    person: args.person,
    member: args.member,
    ...(args.accountDeletionRecordLimits
      ? {
          recordLimit: args.accountDeletionRecordLimits.invitation,
          limitExceededError: ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR,
        }
      : {}),
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
    actor: AccountDeletionOrganizationActor;
    billingState: Doc<"organizationBillingStates">;
    plan: FullOrganizationPersonRemovalPlan;
    auditAction: OrganizationAuditAction;
    auditToState: string;
    correlationId: string;
    now: number;
  },
) {
  // 組織人物の寿命と同時にcanonical LINE linkを終了し、再有効化で復活させない。
  // helperはactive personだけを受け付けるため、status更新より先に実行する。
  await disconnectOrganizationPersonLine(ctx, {
    organizationId: args.actor.organization._id,
    organizationPersonId: args.plan.person._id,
    occurredAt: args.now,
  });
  await ctx.db.patch(args.plan.person._id, { status: "removed", updatedAt: args.now });
  if (args.plan.member && args.plan.member.status !== "removed") {
    await ctx.db.patch(args.plan.member._id, { status: "removed", updatedAt: args.now });
  }
  for (const staff of args.plan.staffs) {
    if (staff.isDeleted) continue;
    await ctx.db.patch(staff._id, { isDeleted: true });
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
      shopId: staff.shopId,
      staffId: staff._id,
    });
  }
  await syncActivatedOrganizationStaffOrder(ctx, { organizationId: args.actor.organization._id });
  await revokePendingInvitations(ctx, args.plan.invitations, args.now);
  if (args.plan.targetUserId) {
  }
  if (args.plan.preparedStaffAccessRecords) {
    await applyPreparedStaffAccessRemoval(ctx, args.plan.preparedStaffAccessRecords, args.now);
  } else {
    await revokeStaffAccessForRemoval(ctx, args.plan.staffIds, args.now);
  }
  await cancelOrganizationRecipientBusinessNotifications(ctx, {
    organizationId: args.actor.organization._id,
    staffIds: args.plan.staffIds,
    userId: args.plan.targetUserId,
    invitationIds: args.plan.invitations.map((invitation) => invitation._id),
    includeBillingUserNotifications: true,
    ...(args.plan.notificationCandidateLimit
      ? {
          candidateLimit: args.plan.notificationCandidateLimit,
          candidateLimitExceededError: ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR,
        }
      : {}),
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

export type AccountDeletionOrganizationDeparturePlan = {
  actor: AccountDeletionOrganizationActor;
  billingState: Doc<"organizationBillingStates">;
  removalPlan: FullOrganizationPersonRemovalPlan;
  removalPreview: PersonRemovalPreview;
};

/**
 * shared組織からアカウント削除対象者だけを外すためのread-only preflight。
 * accountUserIdは認証済みaccountDeletion coordinatorが解決した内部IDだけを渡す。
 */
export async function prepareAccountDeletionOrganizationDeparture(
  ctx: OrganizationReadCtx,
  args: {
    actor: AccountDeletionOrganizationActor;
    accountUserId: Id<"users">;
    asOfDate: string;
  },
): Promise<AccountDeletionOrganizationDeparturePlan> {
  await requireCanonicalAccountDeletionOrganizationActor(ctx, { ...args, allowFormerManager: true });
  const billingState = await requireOrganizationBillingState(ctx, args.actor.organization._id);
  const baseRemovalPlan = await prepareFullOrganizationPersonRemoval(ctx, {
    actor: args.actor,
    billingState,
    person: args.actor.person,
    member: args.actor.member,
    accountDeletionRecordLimits: {
      staff: ACCOUNT_DELETION_DEPARTURE_STAFF_RECORD_LIMIT,
      invitation: ACCOUNT_DELETION_DEPARTURE_INVITATION_RECORD_LIMIT,
    },
  });
  const preparedStaffAccessRecords = await prepareStaffAccessForRemoval(ctx, baseRemovalPlan.staffIds, {
    recordLimit: ACCOUNT_DELETION_DEPARTURE_ACCESS_RECORD_LIMIT,
    limitExceededError: ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR,
  });
  await prepareOrganizationRecipientBusinessNotificationsForCancellation(ctx, {
    organizationId: args.actor.organization._id,
    staffIds: baseRemovalPlan.staffIds,
    userId: baseRemovalPlan.targetUserId,
    invitationIds: baseRemovalPlan.invitations.map((invitation) => invitation._id),
    includeBillingUserNotifications: true,
    candidateLimit: ACCOUNT_DELETION_DEPARTURE_NOTIFICATION_RECORD_LIMIT,
    candidateLimitExceededError: ACCOUNT_DELETION_TOO_MANY_ASSOCIATED_RECORDS_ERROR,
  });
  const removalPlan: FullOrganizationPersonRemovalPlan = {
    ...baseRemovalPlan,
    preparedStaffAccessRecords,
    notificationCandidateLimit: ACCOUNT_DELETION_DEPARTURE_NOTIFICATION_RECORD_LIMIT,
  };
  const removalPreview = await collectPersonRemovalPreview(ctx, {
    scope: {
      kind: "organization",
      organizationId: args.actor.organization._id,
      personId: args.actor.person._id,
    },
    staffs: removalPlan.staffs,
    asOfDate: args.asOfDate,
  });
  return { actor: args.actor, billingState, removalPlan, removalPreview };
}

/** preflightと同じtransaction内で、本人の将来割当と組織内accessだけを終了する。 */
export async function applyAccountDeletionOrganizationDeparture(
  ctx: MutationCtx,
  args: {
    plan: AccountDeletionOrganizationDeparturePlan;
    correlationId: string;
    now: number;
  },
) {
  if (args.plan.removalPreview.kind === "tooMany") {
    throw new ConvexError(
      `今日以降のシフトの割り当てが${args.plan.removalPreview.limit}件を超えています。\n先にシフトを整理してから、削除してください。`,
    );
  }
  await deletePersonRemovalAssignments(ctx, args.plan.removalPreview.assignmentIds);
  await applyFullOrganizationPersonRemoval(ctx, {
    actor: args.plan.actor,
    billingState: args.plan.billingState,
    plan: args.plan.removalPlan,
    auditAction: "organization.person_removed",
    auditToState: "removed",
    correlationId: args.correlationId,
    now: args.now,
  });
  await recalculateOpenRecruitmentStatsForShops(
    ctx,
    args.plan.removalPlan.staffs.map((staff) => staff.shopId),
    args.now,
  );
  return { assignmentCount: args.plan.removalPreview.assignmentCount };
}

/** 対象店舗のスタッフ所属だけを終了し、事業者人物・管理者権限は維持する。 */
export const removePersonFromShop = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    requestId: v.string(),
    removalPreview: v.optional(expectedPersonRemovalPreviewValidator),
  },
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
      staff.organizationId !== actor.organization._id
    ) {
      throw new ConvexError("Not found");
    }
    const person = await ctx.db.get(staff.organizationPersonId);
    if (!person || person.organizationId !== actor.organization._id || person.status !== "active") {
      throw new ConvexError("Not found");
    }
    const removalPreview = await collectPersonRemovalPreview(ctx, {
      scope: {
        kind: "shop",
        organizationId: actor.organization._id,
        shopId: actor.shop._id,
        staffId: staff._id,
      },
      staffs: [staff],
      asOfDate: todayJST(),
    });
    const assignmentIds = assertPersonRemovalPreview(removalPreview, args.removalPreview);

    const now = Date.now();
    await deletePersonRemovalAssignments(ctx, assignmentIds);
    await ctx.db.patch(staff._id, { isDeleted: true });
    await syncActivatedOrganizationStaffOrder(ctx, { organizationId: actor.organization._id });
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
      shopId: staff.shopId,
      staffId: staff._id,
    });
    await revokeStaffAccessForRemoval(ctx, [staff._id], now);
    await cancelOrganizationRecipientBusinessNotifications(ctx, {
      organizationId: actor.organization._id,
      staffIds: [staff._id],
    });
    await recalculateOpenRecruitmentStatsForShops(ctx, [staff.shopId], now);
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
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
    personId: v.id("organizationPeople"),
    requestId: v.string(),
    removalPreview: v.optional(expectedPersonRemovalPreviewValidator),
  },
  returns: personRemovalResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    if (
      await isCompletedPersonRemovalActorRetry(ctx, {
        shopId: args.shopId,
        operation: "organization",
        targetId: args.personId,
        requestId,
        expectedOrganizationId: args.expectedOrganizationId,
      })
    ) {
      return { changed: false };
    }

    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    if (actor.organization._id !== args.expectedOrganizationId) {
      throw new ConvexError("Not found");
    }
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
    const member = await requireOrganizationPersonWithoutManagerRole(ctx, actor.organization._id, person._id);
    if (member && person.userId !== member.userId) throw new ConvexError("Not found");
    const plan = await prepareFullOrganizationPersonRemoval(ctx, { actor, billingState, person, member });
    const removalPreview = await collectPersonRemovalPreview(ctx, {
      scope: { kind: "organization", organizationId: actor.organization._id, personId: person._id },
      staffs: plan.staffs,
      asOfDate: todayJST(),
    });
    const assignmentIds = assertPersonRemovalPreview(removalPreview, args.removalPreview);
    const now = Date.now();
    await deletePersonRemovalAssignments(ctx, assignmentIds);
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

async function removeManagerRoleForActor(
  ctx: MutationCtx,
  args: { personId: Id<"organizationPeople">; requestId: string },
  actor: AccountDeletionOrganizationActor,
) {
  const requestId = args.requestId;
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

  const policy = await requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
    organizationId: actor.organization._id,
    personId: actor.person._id,
    capability: "removeManagerRole",
  });
  if (!policy?.canManageManagers) {
    throw new ConvexError("現在の契約状態では、管理者権限を変更できません。");
  }
  if (!(await hasOtherValidActiveManager(ctx, actor.organization._id, person._id))) {
    throw new ConvexError("最後の有効管理者の管理者権限は外せません。");
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", actor.organization._id).eq("organizationPersonId", person._id),
    )
    .collect();
  const hasActiveStaffRole = staffs.some((staff) => !staff.isDeleted);
  const now = Date.now();
  const billingReferenceUpdate = planBillingReferenceUpdate(billingState, person._id);
  const invitations = await findPendingInvitationsIssuedByManager(ctx, actor.organization._id, member._id);
  await ctx.db.patch(member._id, { status: "removed", updatedAt: now });
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
    toState: hasActiveStaffRole ? "staffOnly" : "personOnly",
    correlationId,
    occurredAt: now,
  });
  return { changed: true };
}

/** 管理者権限だけを明示的に終了し、人物とシフト履歴は保持する。 */
export const removeManagerRoleForOrganization = authenticatedMutation({
  args: {
    organizationId: v.id("organizations"),
    personId: v.id("organizationPeople"),
    requestId: v.string(),
  },
  returns: personRemovalResultValidator,
  handler: async (ctx, args) => {
    const requestId = await toAuditRequestKey(args.requestId);
    if (
      await isCompletedOrganizationManagerRoleRetry(ctx, {
        organizationId: args.organizationId,
        targetId: args.personId,
        requestId,
      })
    ) {
      return { changed: false };
    }
    const actor = await requireOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId: args.organizationId,
    });
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    return await removeManagerRoleForActor(ctx, { personId: args.personId, requestId }, actor);
  },
});
