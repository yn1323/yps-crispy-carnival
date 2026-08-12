import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { cancelOrganizationRecipientBusinessNotifications } from "../notificationOutbox/mutations";
import { scheduleOrganizationBillingStateDeadline } from "../organizationBilling/deadline";
import { getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import {
  requireOrganizationBusinessWrite,
  requireOrganizationCapacity,
  requireOrganizationPaidFeature,
  requireRestrictedRecoveryCapability,
} from "../organizationBilling/service";
import {
  collectIssuedInvitationsByInviter,
  collectIssuedInvitationsByOrganization,
} from "../organizationInvitation/lifecycle";
import { ensureDefaultPosition } from "../position/service";
import { recalculateOpenRecruitmentStatsForShops } from "../recruitment/stats";
import { updateShopSettingsSchema } from "../shop/schemas";
import { editStaffSchema } from "../staff/schemas";
import { type OrganizationActor, requireOrganizationActorForShop } from "./access";
import { type OrganizationAuditAction, recordOrganizationAuditEvent } from "./audit";
import { isOrganizationBillingContact } from "./billingContact";
import { getOrganizationDeletionEligibility } from "./deletion";
import { updateOrganizationPersonProfile } from "./personProfile";
import {
  collectPersonRemovalPreview,
  deletePersonRemovalAssignments,
  expectedPersonRemovalPreviewValidator,
  type PersonRemovalPreview,
  revokeStaffAccessForRemoval,
  STALE_PERSON_REMOVAL_PREVIEW_ERROR,
} from "./personRemoval";
import { organizationNameSchema } from "./schemas";
import {
  getValidActiveOrganizationManagerPersonIds,
  isValidOrganizationRecoveryManager,
  requireOrganizationBillingState,
} from "./service";
import { organizationShopOperatingStatusValidator } from "./validators";

const shopMutationResultValidator = v.object({
  shopId: v.id("shops"),
  shopStatus: organizationShopOperatingStatusValidator,
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

function shopStatus(shop: Doc<"shops">) {
  // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後にfallbackを削除する。
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
  const [activeMembers, readOnlyMembers] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .collect(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "readOnly"))
      .collect(),
  ]);
  const userIds = new Set<Id<"users">>();
  for (const member of [...activeMembers, ...readOnlyMembers]) {
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

export const updateOrganizationName = authenticatedMutation({
  args: { shopId: v.id("shops"), name: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
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
  },
});

export const updatePersonProfile = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    personId: v.id("organizationPeople"),
    name: v.string(),
    email: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    if (!ctx.user) throw new ConvexError("Not found");
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
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

export const addShop = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    shopName: v.string(),
    // TODO[narrow]: m039の完走と旧frontend互換期間の終了後にrequired化する。
    regularClosedDays: v.optional(
      v.array(
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
    ),
    submissionPattern: submissionPatternValidator,
    requestId: v.string(),
  },
  returns: shopMutationResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    const parsed = updateShopSettingsSchema.safeParse({
      shopName: args.shopName,
      // TODO[narrow]: m039の完走と旧frontend互換期間の終了後にargsをrequired化し、fallbackを削除する。
      regularClosedDays: args.regularClosedDays ?? [],
      submissionPattern: args.submissionPattern,
    });
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
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
    await validateCanonicalManagersForShopAddition(ctx, organization._id);

    const now = Date.now();
    const shopId = await ctx.db.insert("shops", {
      organizationId: organization._id,
      operatingStatus: "active",
      name: parsed.data.shopName,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => parsed.data.regularClosedDays.includes(day)),
      submissionPattern: normalizeSubmissionPattern(parsed.data.submissionPattern),
      isDeleted: false,
    });
    await ensureDefaultPosition(ctx, shopId);
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
      analyticsEvent: {
        eventType: "shop.changed",
        shopId,
        payload: {
          kind: "shop",
          change: "created",
          displayName: parsed.data.shopName,
          registeredAt: now,
        },
      },
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
    confirmShopId: v.id("shops"),
    requestId: v.string(),
  },
  returns: deleteShopResultValidator,
  handler: async (ctx, args) => {
    if (args.confirmShopId !== args.shopId) throw new ConvexError("Not found");

    const requestId = await toAuditRequestKey(args.requestId);
    const requestedShop = await ctx.db.get(args.shopId);
    if (requestedShop?.isDeleted && requestedShop.organizationId && ctx.user && !ctx.user.isDeleted) {
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
    const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
    if (getEffectiveRestrictedBillingState(billingState.state)) {
      await requireRestrictedRecoveryCapability(ctx, {
        organizationId: actor.organization._id,
        personId: actor.person._id,
        capability: "archiveShop",
      });
    } else {
      await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    }
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
      fromState: shopStatus(actor.shop),
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
export const deleteOrganization = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
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

    const actor = await requireOrganizationActorForShop(ctx, { user: ctx.user, shopId: args.shopId });
    if (actor.organization._id !== args.organizationId) throw new ConvexError("Not found");
    if (actor.organization.updatedAt !== args.expectedOrganizationUpdatedAt) {
      throw new ConvexError("組織の状態が変わりました。\n画面を更新してから、もう一度お試しください。");
    }

    const billingState = await requireOrganizationBillingState(ctx, actor.organization._id);
    const eligibility = await getOrganizationDeletionEligibility(ctx, {
      organizationId: actor.organization._id,
      actorMemberId: actor.member._id,
      billingState,
    });
    if (!eligibility.canDelete) throw new ConvexError(eligibility.reason);

    const now = Date.now();
    await ctx.db.patch(actor.organization._id, {
      isDeleted: true,
      updatedAt: now,
    });
    await ctx.db.patch(billingState._id, {
      businessNotificationCutoffAt: now,
      businessNotificationCutoffVersion: billingState.version + 1,
      version: billingState.version + 1,
      updatedAt: now,
    });

    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.deleted",
      targetKind: "organization",
      targetId: actor.organization._id,
      fromState: "active",
      toState: "deleted",
      correlationId,
      occurredAt: now,
    });
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "organization",
      organizationId: actor.organization._id,
      requestId,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return { organizationId: actor.organization._id, changed: true, accepted: true };
  },
});

const personRemovalResultValidator = v.object({ changed: v.boolean() });
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
  const addressedToPerson = (await collectIssuedInvitationsByOrganization(ctx, args.organizationId)).filter(
    (invitation) =>
      invitation.targetPersonId === args.person._id || invitation.emailNormalized === args.person.emailNormalized,
  );
  for (const invitation of addressedToPerson) invitations.set(invitation._id, invitation);
  return [...invitations.values()];
}

async function findPendingInvitationsIssuedByManager(
  ctx: MutationCtx,
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
  const validPersonIds = await getValidActiveOrganizationManagerPersonIds(ctx, organizationId);
  return validPersonIds.some((personId) => personId !== excludedPersonId);
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
    if (await isValidOrganizationRecoveryManager(ctx, billingState.organizationId, personId)) nextIds.push(personId);
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

  await scheduleOrganizationBillingStateDeadline(ctx, {
    organizationId: args.billingState.organizationId,
    state: nextState,
    version: nextVersion,
  });
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
  if (isOrganizationBillingContact(args.actor.organization, args.person)) {
    throw new ConvexError("削除するには、先に請求先メールアドレスを変更してください。");
  }
  const billingReferenceUpdate = await planBillingReferenceUpdate(ctx, args.billingState, args.person._id);
  if (args.member?.status === "active") {
    const hasOtherManager = await hasOtherValidActiveManager(ctx, args.actor.organization._id, args.person._id);
    if (!hasOtherManager) throw new ConvexError("管理者は削除できません。");
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.actor.organization._id).eq("organizationPersonId", args.person._id),
    )
    .collect();
  const staffIds = staffs.map((staff) => staff._id);
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
    if (staff.isDeleted) continue;
    await ctx.db.patch(staff._id, { isDeleted: true });
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
      shopId: staff.shopId,
      staffId: staff._id,
    });
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
    analyticsEvent: {
      eventType: "person.changed",
      subjectId: args.plan.person._id,
      payload: {
        kind: "person",
        status: "removed",
        firstObservedAt: args.plan.person.createdAt,
      },
    },
  });
  if (args.billingState.state.kind === "restricted") {
    const billingVersionAfterRemoval =
      args.plan.billingReferenceUpdate.recoveryManagersChanged || args.plan.billingReferenceUpdate.clearFreeManager
        ? args.billingState.version + 1
        : args.billingState.version;
    await ctx.scheduler.runAfter(0, internal.organizationBilling.mutations.reconcileRestrictedPlanEligibility, {
      billingStateId: args.billingState._id,
      expectedVersion: billingVersionAfterRemoval,
    });
  }
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
      analyticsEvent: {
        eventType: "staffMembership.changed",
        shopId: actor.shop._id,
        subjectId: staff._id,
        payload: {
          kind: "staffMembership",
          staffId: staff._id,
          ...(staff.organizationPersonId ? { organizationPersonId: staff.organizationPersonId } : {}),
          status: "removed",
          isShiftTarget: !staff.excludedFromShift,
          validFrom: now,
          validTo: now,
          lineLinked: false,
          lineFollowing: false,
        },
      },
    });
    return { changed: true };
  },
});

/** 対象人物の事業者内アクセスをすべて終了し、履歴レコードは保持する。 */
export const removePersonFromOrganization = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
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

/** 管理者権限だけを明示的に終了し、人物とシフト履歴は保持する。 */
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
      throw new ConvexError("最後の有効管理者の管理者権限は外せません。");
    }

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", actor.organization._id).eq("organizationPersonId", person._id),
      )
      .collect();
    const hasActiveStaffRole = staffs.some((staff) => !staff.isDeleted);
    if (!hasActiveStaffRole && isOrganizationBillingContact(actor.organization, person)) {
      throw new ConvexError("管理者権限を外すには、先に請求先メールアドレスを変更してください。");
    }
    const now = Date.now();
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
      toState: hasActiveStaffRole ? "staffOnly" : "personOnly",
      correlationId,
      occurredAt: now,
    });
    return { changed: true };
  },
});
