import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS } from "../constants";
import { tombstoneLineProviderUserIfUnreferenced } from "../line/service";
import {
  cancelNotificationForInactiveOrganization,
  cancelNotificationForInactiveShop,
} from "../notificationOutbox/mutations";
import { safelyDeactivateOrganizationStaffOrder } from "../organization/staffOrder";
import { type DeletionCleanupTarget, getDeletionCleanupJobForTarget } from "./service";
import { deletedLineUserId } from "./tombstone";
import { deletionCleanupTargetValidator } from "./validators";

const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_JOB_LEASE_MS = 60_000;
const MAX_CLEANUP_ATTEMPTS = 8;
const RECOVERY_BATCH_SIZE = 25;
const RECOVERY_PER_STATUS_BATCH_SIZE = Math.floor(RECOVERY_BATCH_SIZE / 3);

const SHOP_PHASES = [
  "shopCore",
  "shopStaffOrderEntries",
  "shopOutboxPending",
  "shopOutboxProcessing",
  "shopNotificationHistory",
  "shopStaffs",
  "shopMembers",
  "shopLineAccounts",
  "shopSessions",
  "shopMagicLinks",
  "shopLineLinkTokens",
  "shopLegalConsentTokens",
  "shopRegistrationLinks",
  "shopVerification",
] as const;

const ORGANIZATION_SHOP_PHASES = [
  "organizationShopStaffOrderEntries",
  "organizationShopOutboxPending",
  "organizationShopOutboxProcessing",
  "organizationShopNotificationHistory",
  "organizationShopStaffs",
  "organizationShopMembers",
  "organizationShopMemberUsers",
  "organizationShopLineAccounts",
  "organizationShopSessions",
  "organizationShopMagicLinks",
  "organizationShopLineLinkTokens",
  "organizationShopLegalConsentTokens",
  "organizationShopRegistrationLinks",
] as const;

const ORGANIZATION_PHASES = [
  "organizationCore",
  "organizationStaffOrderState",
  "organizationStaffOrderEntries",
  "organizationStaffOrderShopEntries",
  "organizationOutboxPending",
  "organizationOutboxProcessing",
  "organizationShops",
  "organizationLineLinks",
  "organizationPeople",
  "organizationMembers",
  "organizationInvitationsIssued",
  "organizationInvitationsPending",
  "organizationCreatedByUser",
  "organizationVerification",
] as const;

const SHOP_VERIFICATION_RESOURCES = [
  "core",
  "staffOrderEntries",
  "outboxPending",
  "outboxProcessing",
  "notificationHistory",
  "staffs",
  "members",
  "lineAccounts",
  "sessions",
  "magicLinks",
  "lineLinkTokens",
  "legalConsentTokens",
  "registrationLinks",
] as const;

const ORGANIZATION_VERIFICATION_RESOURCES = [
  "organizationCore",
  "organizationStaffOrderState",
  "organizationStaffOrderEntries",
  "organizationStaffOrderShopEntries",
  "organizationOutboxPending",
  "organizationOutboxProcessing",
  "organizationShopsCore",
  "organizationShopStaffOrderEntries",
  "organizationShopOutboxPending",
  "organizationShopOutboxProcessing",
  "organizationShopNotificationHistory",
  "organizationShopStaffs",
  "organizationShopMembers",
  "organizationShopMemberUsers",
  "organizationShopLineAccounts",
  "organizationShopSessions",
  "organizationShopMagicLinks",
  "organizationShopLineLinkTokens",
  "organizationShopLegalConsentTokens",
  "organizationShopRegistrationLinks",
  "organizationLineLinks",
  "organizationPeople",
  "organizationMembers",
  "organizationInvitationsIssued",
  "organizationInvitationsPending",
  "organizationCreatedByUser",
] as const;

type ShopPhase = (typeof SHOP_PHASES)[number];
type OrganizationShopPhase = (typeof ORGANIZATION_SHOP_PHASES)[number];
type ShopVerificationResource = (typeof SHOP_VERIFICATION_RESOURCES)[number];
type OrganizationVerificationResource = (typeof ORGANIZATION_VERIFICATION_RESOURCES)[number];
type ShopResource =
  | "staffOrderEntries"
  | "outboxPending"
  | "outboxProcessing"
  | "notificationHistory"
  | "staffs"
  | "members"
  | "memberUsers"
  | "lineAccounts"
  | "sessions"
  | "magicLinks"
  | "lineLinkTokens"
  | "legalConsentTokens"
  | "registrationLinks";

type StepResult = {
  completed?: true;
  phase?: string;
  resource?: string;
  cursor?: string;
  shopCursor?: string;
  currentShopId?: Id<"shops">;
  delayMs?: number;
};

type CleanupInvariantErrorCode =
  | "invalid_shop_cleanup_target"
  | "invalid_shop_cleanup_phase"
  | "invalid_shop_cleanup_progress"
  | "invalid_organization_cleanup_target"
  | "invalid_organization_cleanup_phase"
  | "invalid_organization_cleanup_progress"
  | "invalid_organization_cleanup_shop_target"
  | "user_association_scan_limit";

type ResourceResult = {
  done: boolean;
  cursor?: string;
  delayMs?: number;
};

/** operator/coordinator retryを、対象とversionが一致するactionRequired jobだけへ限定する。 */
export async function retryActionRequiredDeletionCleanup(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  args: {
    jobId: Id<"deletionCleanupJobs">;
    target: DeletionCleanupTarget;
    expectedVersion: number;
  },
) {
  const job = await getDeletionCleanupJobForTarget(ctx, args);
  if (!job) {
    throw new ConvexError("削除処理を確認できません");
  }
  if (job.status !== "actionRequired" || job.version !== args.expectedVersion) {
    throw new ConvexError("削除処理の状態が更新されています");
  }

  const now = Date.now();
  const version = job.version + 1;
  await ctx.db.patch(job.jobId, {
    status: "retrying",
    version,
    attemptCount: 0,
    nextRunAt: now,
    leaseId: undefined,
    leaseExpiresAt: undefined,
    lastErrorCode: undefined,
    completedAt: undefined,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: job.jobId });
  return { status: "scheduled" as const, version };
}

export const retryActionRequired = internalMutation({
  args: {
    jobId: v.id("deletionCleanupJobs"),
    target: deletionCleanupTargetValidator,
    expectedVersion: v.number(),
  },
  returns: v.object({ status: v.literal("scheduled"), version: v.number() }),
  handler: async (ctx, args) => {
    return await retryActionRequiredDeletionCleanup(ctx, args);
  },
});

export const kick = internalMutation({
  args: { jobId: v.id("deletionCleanupJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status === "completed" || job.status === "actionRequired") return null;

    const now = Date.now();
    const leaseExpired = job.status === "processing" && (job.leaseExpiresAt ?? 0) <= now;
    if (job.status === "processing" && !leaseExpired) return null;
    if ((job.status === "queued" || job.status === "retrying") && job.nextRunAt > now) {
      await ctx.scheduler.runAfter(job.nextRunAt - now, internal.deletionCleanup.mutations.kick, { jobId });
      return null;
    }

    const recoveredAttemptCount = leaseExpired ? job.attemptCount + 1 : job.attemptCount;
    if (recoveredAttemptCount >= MAX_CLEANUP_ATTEMPTS) {
      await ctx.db.patch(jobId, {
        status: "actionRequired",
        attemptCount: recoveredAttemptCount,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: "cleanup_lease_expired",
        updatedAt: now,
      });
      return null;
    }

    const nextVersion = job.version + 1;
    const leaseId = `${jobId}:${nextVersion}:${now}`;
    await ctx.db.patch(jobId, {
      status: "processing",
      version: nextVersion,
      attemptCount: recoveredAttemptCount,
      leaseId,
      leaseExpiresAt: now + CLEANUP_JOB_LEASE_MS,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.process, {
      jobId,
      leaseId,
      expectedVersion: nextVersion,
    });
    return null;
  },
});

export const process = internalMutation({
  args: {
    jobId: v.id("deletionCleanupJobs"),
    leaseId: v.string(),
    expectedVersion: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== "processing" || job.leaseId !== args.leaseId || job.version !== args.expectedVersion) {
      return null;
    }

    const invariantErrorCode = await getCleanupInvariantError(ctx, job);
    if (invariantErrorCode) {
      await markCleanupActionRequired(ctx, job, invariantErrorCode);
      return null;
    }

    const step = await runCleanupStep(ctx, job);
    const now = Date.now();
    if (step.completed) {
      await ctx.db.patch(job._id, {
        status: "completed",
        version: job.version + 1,
        cursor: undefined,
        resource: undefined,
        shopCursor: undefined,
        currentShopId: undefined,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        nextRunAt: now,
        updatedAt: now,
        completedAt: now,
      });
      return null;
    }

    const delayMs = Math.max(0, step.delayMs ?? 0);
    await ctx.db.patch(job._id, {
      status: "queued",
      phase: step.phase ?? job.phase,
      resource: step.resource,
      cursor: step.cursor,
      shopCursor: step.shopCursor,
      currentShopId: step.currentShopId,
      version: job.version + 1,
      attemptCount: 0,
      nextRunAt: now + delayMs,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(delayMs, internal.deletionCleanup.mutations.kick, { jobId: job._id });
    return null;
  },
});

/** cronから、予約漏れ・期限切れleaseを安全な件数だけ再投入する。 */
export const recover = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const candidates = new Map<Id<"deletionCleanupJobs">, Doc<"deletionCleanupJobs">>();
    for (const status of ["queued", "retrying"] as const) {
      const jobs = await ctx.db
        .query("deletionCleanupJobs")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status).lte("nextRunAt", now))
        .take(RECOVERY_PER_STATUS_BATCH_SIZE);
      for (const job of jobs) candidates.set(job._id, job);
    }
    const expiredLeases = await ctx.db
      .query("deletionCleanupJobs")
      .withIndex("by_status_and_leaseExpiresAt", (q) => q.eq("status", "processing").lte("leaseExpiresAt", now))
      .take(RECOVERY_PER_STATUS_BATCH_SIZE);
    for (const job of expiredLeases) candidates.set(job._id, job);

    for (const job of [...candidates.values()].slice(0, RECOVERY_BATCH_SIZE)) {
      await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: job._id });
    }
    return { scheduled: Math.min(candidates.size, RECOVERY_BATCH_SIZE) };
  },
});

async function runCleanupStep(ctx: MutationCtx, job: Doc<"deletionCleanupJobs">): Promise<StepResult> {
  if (job.scope === "shop") {
    // processの先頭でtarget/phase不変条件を検証済み。organizationIdは旧店舗では未設定になり得る。
    if (!job.shopId) throw new Error("Validated shop cleanup target is missing");
    return await runStandaloneShopStep(ctx, job, job.shopId);
  }
  if (!job.organizationId || job.shopId) throw new Error("Validated organization cleanup target is missing");
  return await runOrganizationStep(ctx, job, job.organizationId);
}

async function runStandaloneShopStep(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  shopId: Id<"shops">,
): Promise<StepResult> {
  if (!isShopPhase(job.phase)) throw new Error("Invalid shop cleanup phase");
  if (job.phase === "shopCore") {
    const shop = await ctx.db.get(shopId);
    if (shop && !shop.isDeleted) await ctx.db.patch(shopId, { isDeleted: true });
    return { phase: "shopStaffOrderEntries" };
  }
  if (job.phase === "shopVerification") {
    return await verifyShopCleanup(ctx, job, shopId);
  }

  const resource = resourceForShopPhase(job.phase);
  const result = await runShopResource(ctx, shopId, resource, job.cursor ?? null);
  if (!result.done) {
    return { phase: job.phase, cursor: result.cursor, delayMs: result.delayMs };
  }
  const next = nextInSequence(SHOP_PHASES, job.phase);
  return next ? { phase: next } : { completed: true };
}

async function runOrganizationStep(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  organizationId: Id<"organizations">,
): Promise<StepResult> {
  switch (job.phase) {
    case "organizationCore": {
      const organization = await ctx.db.get(organizationId);
      if (organization) {
        if (!organization.isDeleted) {
          await ctx.db.patch(organization._id, { isDeleted: true, updatedAt: Date.now() });
        }
        const billingStates = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .take(2);
        if (billingStates.length === 1 && billingStates[0].businessNotificationCutoffAt === undefined) {
          const billingState = billingStates[0];
          const now = Date.now();
          await ctx.db.patch(billingState._id, {
            businessNotificationCutoffAt: now,
            businessNotificationCutoffVersion: billingState.version + 1,
            version: billingState.version + 1,
            updatedAt: now,
          });
        }
      }
      await safelyDeactivateOrganizationStaffOrder(ctx, { organizationId });
      return { phase: "organizationStaffOrderState" };
    }
    case "organizationStaffOrderState": {
      const states = await ctx.db
        .query("organizationStaffOrderStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(CLEANUP_BATCH_SIZE);
      for (const state of states) await ctx.db.delete(state._id);
      return states.length < CLEANUP_BATCH_SIZE ? { phase: "organizationStaffOrderEntries" } : { phase: job.phase };
    }
    case "organizationStaffOrderEntries": {
      const entries = await ctx.db
        .query("organizationStaffOrderEntries")
        .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organizationId))
        .take(CLEANUP_BATCH_SIZE);
      for (const entry of entries) await ctx.db.delete(entry._id);
      return entries.length < CLEANUP_BATCH_SIZE
        ? { phase: "organizationStaffOrderShopEntries" }
        : { phase: job.phase };
    }
    case "organizationStaffOrderShopEntries": {
      // shopIdがdanglingまたは別組織を指す不整合rowも、組織IDを正にして回収する。
      // 後続の店舗単位phaseは、逆向きの不整合（別organizationId + 当該shopId）を引き続き回収する。
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_organizationId_and_shopId", (q) => q.eq("organizationId", organizationId))
        .take(CLEANUP_BATCH_SIZE);
      for (const entry of entries) await ctx.db.delete(entry._id);
      return entries.length < CLEANUP_BATCH_SIZE ? { phase: "organizationOutboxPending" } : { phase: job.phase };
    }
    case "organizationOutboxPending": {
      const result = await cancelOrganizationOutbox(ctx, organizationId, "pending");
      return result.done ? { phase: "organizationOutboxProcessing" } : { phase: job.phase };
    }
    case "organizationOutboxProcessing": {
      const result = await cancelOrganizationOutbox(ctx, organizationId, "processing");
      return result.done ? { phase: "organizationShops" } : { phase: job.phase, delayMs: result.delayMs };
    }
    case "organizationShops": {
      const page = await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      for (const shop of page.page) {
        if (!shop.isDeleted) await ctx.db.patch(shop._id, { isDeleted: true });
      }
      return page.isDone ? { phase: ORGANIZATION_SHOP_PHASES[0] } : { phase: job.phase, cursor: page.continueCursor };
    }
    case "organizationLineLinks": {
      // isDeletedを更新するためcursorは持ち越さず、active先頭batchを0件まで繰り返す。
      const links = await ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organizationId).eq("isDeleted", false),
        )
        .take(CLEANUP_BATCH_SIZE);
      const now = Date.now();
      for (const link of links) {
        const person = await ctx.db.get(link.organizationPersonId);
        if (!person || person.organizationId !== organizationId) {
          throw new Error("organization_line_link_tenant_mismatch");
        }
        await ctx.db.patch(link._id, { isDeleted: true, unlinkedAt: now });
        await ctx.db.patch(person._id, {
          lineLinkGeneration: Math.max(person.lineLinkGeneration ?? 0, link.generation) + 1,
          updatedAt: now,
        });
        await tombstoneLineProviderUserIfUnreferenced(ctx, link.lineProviderUserId);
      }
      return links.length < CLEANUP_BATCH_SIZE ? { phase: "organizationPeople" } : { phase: job.phase };
    }
    case "organizationPeople": {
      // 旧deploymentでこのphaseまで進んだjobも、人物より先に組織共通LINE連携を終了する。
      const activeLineLink = await ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organizationId).eq("isDeleted", false),
        )
        .first();
      if (activeLineLink) return { phase: "organizationLineLinks" };

      const page = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      const now = Date.now();
      for (const person of page.page) {
        if (person.status !== "removed") await ctx.db.patch(person._id, { status: "removed", updatedAt: now });
      }
      return page.isDone ? { phase: "organizationMembers" } : { phase: job.phase, cursor: page.continueCursor };
    }
    case "organizationMembers": {
      const page = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      const now = Date.now();
      for (const member of page.page) {
        if (member.status !== "removed") await ctx.db.patch(member._id, { status: "removed", updatedAt: now });
      }
      return page.isDone
        ? { phase: "organizationInvitationsIssued" }
        : { phase: job.phase, cursor: page.continueCursor };
    }
    case "organizationInvitationsIssued": {
      const done = await revokeOrganizationInvitations(ctx, organizationId, "issued");
      return done ? { phase: "organizationInvitationsPending" } : { phase: job.phase };
    }
    case "organizationInvitationsPending": {
      const done = await revokeOrganizationInvitations(ctx, organizationId, "pending");
      if (!done) return { phase: job.phase };
      return { phase: "organizationCreatedByUser" };
    }
    case "organizationCreatedByUser": {
      // 旧jobとの互換性のためphaseは維持するが、global userは組織削除の対象外。
      return { phase: "organizationVerification" };
    }
    case "organizationVerification": {
      return await verifyOrganizationCleanup(ctx, job, organizationId);
    }
    default:
      if (isOrganizationShopPhase(job.phase)) {
        return await runOrganizationShopStep(ctx, job, organizationId, job.phase);
      }
      throw new Error("Invalid organization cleanup phase");
  }
}

async function runOrganizationShopStep(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  organizationId: Id<"organizations">,
  phase: OrganizationShopPhase,
): Promise<StepResult> {
  let shopId = job.currentShopId;
  let nextShopCursor = job.shopCursor;
  if (!shopId) {
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .paginate({ cursor: job.shopCursor ?? null, numItems: 1 });
    const shop = shops.page[0];
    if (!shop) {
      const next = nextInSequence(ORGANIZATION_SHOP_PHASES, phase);
      return next ? { phase: next } : { phase: "organizationLineLinks" };
    }
    shopId = shop._id;
    nextShopCursor = shops.isDone ? undefined : shops.continueCursor;
    // Convexでは1回のfunction実行につきpaginateは1回だけ許可される。
    // 店舗選択を永続化し、resource処理は次のscheduled mutationへ分ける。
    return { phase, shopCursor: nextShopCursor, currentShopId: shopId };
  }

  const result = await runShopResource(ctx, shopId, resourceForOrganizationShopPhase(phase), job.cursor ?? null);
  if (!result.done) {
    return {
      phase,
      cursor: result.cursor,
      shopCursor: nextShopCursor,
      currentShopId: shopId,
      delayMs: result.delayMs,
    };
  }
  if (nextShopCursor !== undefined) return { phase, shopCursor: nextShopCursor };
  const next = nextInSequence(ORGANIZATION_SHOP_PHASES, phase);
  return next ? { phase: next } : { phase: "organizationLineLinks" };
}

async function runShopResource(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  resource: ShopResource,
  cursor: string | null,
): Promise<ResourceResult> {
  switch (resource) {
    case "staffOrderEntries": {
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shopId))
        .take(CLEANUP_BATCH_SIZE);
      for (const entry of entries) await ctx.db.delete(entry._id);
      return { done: entries.length < CLEANUP_BATCH_SIZE };
    }
    case "outboxPending": {
      const jobs = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
        .take(CLEANUP_BATCH_SIZE);
      const now = Date.now();
      for (const job of jobs) await cancelNotificationForInactiveShop(ctx, job, now);
      return { done: jobs.length < CLEANUP_BATCH_SIZE };
    }
    case "outboxProcessing": {
      const jobs = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "processing"))
        .take(CLEANUP_BATCH_SIZE);
      return await cancelStaleProcessingOutbox(ctx, jobs, "shop");
    }
    case "notificationHistory": {
      const histories = await ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId))
        .take(CLEANUP_BATCH_SIZE);
      for (const history of histories) await ctx.db.delete(history._id);
      return { done: histories.length < CLEANUP_BATCH_SIZE };
    }
    case "staffs": {
      const page = await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
      for (const staff of page.page) {
        if (!staff.isDeleted) await ctx.db.patch(staff._id, { isDeleted: true });
      }
      return pageResult(page);
    }
    case "members": {
      const members = await ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(CLEANUP_BATCH_SIZE);
      for (const member of members) {
        await ctx.db.patch(member._id, { isDeleted: true });
      }
      return { done: members.length < CLEANUP_BATCH_SIZE };
    }
    case "memberUsers": {
      // 旧jobとの互換性のためresourceは維持するが、global userは組織削除の対象外。
      return { done: true };
    }
    case "lineAccounts": {
      const page = await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
      for (const account of page.page) {
        await ctx.db.patch(account._id, {
          lineUserId: deletedLineUserId(account._id),
          following: false,
          isDeleted: true,
        });
      }
      return pageResult(page);
    }
    case "sessions":
      return await revokeByShop(ctx, "sessions", shopId, cursor);
    case "magicLinks":
      return await revokeByShop(ctx, "magicLinks", shopId, cursor);
    case "lineLinkTokens":
      return await revokeByShop(ctx, "lineLinkTokens", shopId, cursor);
    case "legalConsentTokens":
      return await revokeByShop(ctx, "legalConsentTokens", shopId, cursor);
    case "registrationLinks":
      return await revokeByShop(ctx, "shopRegistrationLinks", shopId, cursor);
  }
}

async function cancelOrganizationOutbox(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  status: "pending" | "processing",
): Promise<ResourceResult> {
  const jobs = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
    .take(CLEANUP_BATCH_SIZE);
  if (status === "processing") return await cancelStaleProcessingOutbox(ctx, jobs, "organization");
  const now = Date.now();
  for (const job of jobs) await cancelNotificationForInactiveOrganization(ctx, job, now);
  return { done: jobs.length < CLEANUP_BATCH_SIZE };
}

async function cancelStaleProcessingOutbox(
  ctx: MutationCtx,
  jobs: Doc<"notificationOutbox">[],
  scope: "shop" | "organization",
): Promise<ResourceResult> {
  if (jobs.length === 0) return { done: true };
  const now = Date.now();
  const staleBefore = now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS;
  const pendingLeaseExpiries: number[] = [];
  for (const job of jobs) {
    if ((job.processingStartedAt ?? 0) <= staleBefore) {
      if (scope === "shop") await cancelNotificationForInactiveShop(ctx, job, now);
      else await cancelNotificationForInactiveOrganization(ctx, job, now);
    } else {
      pendingLeaseExpiries.push((job.processingStartedAt ?? now) + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS);
    }
  }
  return {
    done: false,
    ...(pendingLeaseExpiries.length > 0 ? { delayMs: Math.max(1, Math.min(...pendingLeaseExpiries) - now) } : {}),
  };
}

async function revokeByShop(
  ctx: MutationCtx,
  table: "sessions" | "magicLinks" | "lineLinkTokens" | "legalConsentTokens" | "shopRegistrationLinks",
  shopId: Id<"shops">,
  cursor: string | null,
): Promise<ResourceResult> {
  const page = await ctx.db
    .query(table)
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
  const now = Date.now();
  for (const token of page.page) {
    if (!token.revokedAt) await ctx.db.patch(token._id, { revokedAt: now });
  }
  return pageResult(page);
}

async function revokeOrganizationInvitations(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  status: "issued" | "pending",
) {
  const invitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
    .take(CLEANUP_BATCH_SIZE);
  const now = Date.now();
  for (const invitation of invitations) {
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      reservedSeat: false,
      version: invitation.version + 1,
      revokedAt: now,
      updatedAt: now,
    });
  }
  return invitations.length < CLEANUP_BATCH_SIZE;
}

/** cleanup完走後に、同じbounded cursorで利用停止状態と全失効resourceを再走査する。 */
async function verifyShopCleanup(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  shopId: Id<"shops">,
): Promise<StepResult> {
  const resource = (job.resource ?? SHOP_VERIFICATION_RESOURCES[0]) as ShopVerificationResource;
  const result = await verifyShopResource(ctx, shopId, resource, job.cursor ?? null);
  if (result.violated) return { phase: repairShopPhase(resource) };
  if (!result.done) {
    return { phase: "shopVerification", resource, cursor: result.cursor };
  }
  const next = nextInSequence(SHOP_VERIFICATION_RESOURCES, resource);
  return next ? { phase: "shopVerification", resource: next } : { completed: true };
}

async function verifyOrganizationCleanup(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  organizationId: Id<"organizations">,
): Promise<StepResult> {
  const resource = (job.resource ?? ORGANIZATION_VERIFICATION_RESOURCES[0]) as OrganizationVerificationResource;
  switch (resource) {
    case "organizationCore": {
      const organization = await ctx.db.get(organizationId);
      if (organization && !organization.isDeleted) return { phase: "organizationCore" };
      return nextOrganizationVerificationStep(resource);
    }
    case "organizationStaffOrderState": {
      const state = await ctx.db
        .query("organizationStaffOrderStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .first();
      return state ? { phase: "organizationStaffOrderState" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationStaffOrderEntries": {
      const entry = await ctx.db
        .query("organizationStaffOrderEntries")
        .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organizationId))
        .first();
      return entry ? { phase: "organizationStaffOrderEntries" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationStaffOrderShopEntries": {
      const entry = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_organizationId_and_shopId", (q) => q.eq("organizationId", organizationId))
        .first();
      return entry ? { phase: "organizationStaffOrderShopEntries" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationOutboxPending": {
      const active = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", "pending"))
        .first();
      return active ? { phase: "organizationOutboxPending" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationOutboxProcessing": {
      const active = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", "processing"))
        .first();
      return active ? { phase: "organizationOutboxProcessing" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationShopsCore": {
      const page = await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      if (page.page.some((shop) => !shop.isDeleted)) {
        return { phase: "organizationShops" };
      }
      return page.isDone
        ? nextOrganizationVerificationStep(resource)
        : { phase: "organizationVerification", resource, cursor: page.continueCursor };
    }
    case "organizationLineLinks": {
      const active = await ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organizationId).eq("isDeleted", false),
        )
        .first();
      return active ? { phase: "organizationLineLinks" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationPeople": {
      const page = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      for (const person of page.page) {
        if (person.status !== "removed") return { phase: "organizationPeople" };
      }
      return page.isDone
        ? nextOrganizationVerificationStep(resource)
        : { phase: "organizationVerification", resource, cursor: page.continueCursor };
    }
    case "organizationMembers": {
      const page = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .paginate({ cursor: job.cursor ?? null, numItems: CLEANUP_BATCH_SIZE });
      for (const member of page.page) {
        if (member.status !== "removed") return { phase: "organizationMembers" };
      }
      return page.isDone
        ? nextOrganizationVerificationStep(resource)
        : { phase: "organizationVerification", resource, cursor: page.continueCursor };
    }
    case "organizationInvitationsIssued": {
      const invitation = await ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "issued"))
        .first();
      return invitation ? { phase: "organizationInvitationsIssued" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationInvitationsPending": {
      const invitation = await ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", "pending"),
        )
        .first();
      return invitation ? { phase: "organizationInvitationsPending" } : nextOrganizationVerificationStep(resource);
    }
    case "organizationCreatedByUser": {
      // 旧verification resourceとの互換性のため残し、global userは検証対象にしない。
      return { completed: true };
    }
    default:
      return await verifyOrganizationShopResource(ctx, job, organizationId, resource);
  }
}

async function verifyOrganizationShopResource(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  organizationId: Id<"organizations">,
  resource: Extract<OrganizationVerificationResource, `organizationShop${string}`>,
): Promise<StepResult> {
  let shopId = job.currentShopId;
  let nextShopCursor = job.shopCursor;
  if (!shopId) {
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .paginate({ cursor: job.shopCursor ?? null, numItems: 1 });
    const shop = shops.page[0];
    if (!shop) return nextOrganizationVerificationStep(resource);
    shopId = shop._id;
    nextShopCursor = shops.isDone ? undefined : shops.continueCursor;
    // 店舗一覧と店舗resourceの両方を同じ実行でpaginateしない。
    // 検証位置をjobへ保存し、次のscheduled mutationから再開する。
    return {
      phase: "organizationVerification",
      resource,
      shopCursor: nextShopCursor,
      currentShopId: shopId,
    };
  }

  const shopResource = organizationVerificationShopResource(resource);
  const result = await verifyShopResource(ctx, shopId, shopResource, job.cursor ?? null);
  if (result.violated) return { phase: repairOrganizationShopPhase(shopResource) };
  if (!result.done) {
    return {
      phase: "organizationVerification",
      resource,
      cursor: result.cursor,
      shopCursor: nextShopCursor,
      currentShopId: shopId,
    };
  }
  return nextShopCursor !== undefined
    ? { phase: "organizationVerification", resource, shopCursor: nextShopCursor }
    : nextOrganizationVerificationStep(resource);
}

type VerificationResourceResult = { done: boolean; cursor?: string; violated?: true };

async function verifyShopResource(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  resource: ShopVerificationResource | ShopResource,
  cursor: string | null,
): Promise<VerificationResourceResult> {
  switch (resource) {
    case "core": {
      const shop = await ctx.db.get(shopId);
      return {
        done: true,
        ...(shop && !shop.isDeleted ? { violated: true } : {}),
      };
    }
    case "staffOrderEntries": {
      const entry = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shopId))
        .first();
      return { done: true, ...(entry ? { violated: true } : {}) };
    }
    case "outboxPending": {
      const active = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
        .first();
      return { done: true, ...(active ? { violated: true } : {}) };
    }
    case "outboxProcessing": {
      const active = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "processing"))
        .first();
      return { done: true, ...(active ? { violated: true } : {}) };
    }
    case "notificationHistory": {
      const history = await ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId))
        .first();
      return { done: true, ...(history ? { violated: true } : {}) };
    }
    case "staffs": {
      const page = await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
      for (const staff of page.page) {
        if (!staff.isDeleted) return { done: true, violated: true };
      }
      return page.isDone ? { done: true } : { done: false, cursor: page.continueCursor };
    }
    case "members": {
      const active = await ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .first();
      return { done: true, ...(active ? { violated: true } : {}) };
    }
    case "memberUsers": {
      // 旧verification resourceとの互換性のため残し、global userは検証対象にしない。
      return { done: true };
    }
    case "lineAccounts": {
      const page = await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
      return page.page.some((account) => !isLineAccountTombstoned(account))
        ? { done: true, violated: true }
        : page.isDone
          ? { done: true }
          : { done: false, cursor: page.continueCursor };
    }
    case "sessions":
      return await verifyRevokedByShop(ctx, "sessions", shopId, cursor);
    case "magicLinks":
      return await verifyRevokedByShop(ctx, "magicLinks", shopId, cursor);
    case "lineLinkTokens":
      return await verifyRevokedByShop(ctx, "lineLinkTokens", shopId, cursor);
    case "legalConsentTokens":
      return await verifyRevokedByShop(ctx, "legalConsentTokens", shopId, cursor);
    case "registrationLinks":
      return await verifyRevokedByShop(ctx, "shopRegistrationLinks", shopId, cursor);
  }
}

async function verifyRevokedByShop(
  ctx: MutationCtx,
  table: "sessions" | "magicLinks" | "lineLinkTokens" | "legalConsentTokens" | "shopRegistrationLinks",
  shopId: Id<"shops">,
  cursor: string | null,
): Promise<VerificationResourceResult> {
  const page = await ctx.db
    .query(table)
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: CLEANUP_BATCH_SIZE });
  if (page.page.some((token) => token.revokedAt === undefined)) return { done: true, violated: true };
  return page.isDone ? { done: true } : { done: false, cursor: page.continueCursor };
}

function nextOrganizationVerificationStep(resource: OrganizationVerificationResource): StepResult {
  const next = nextInSequence(ORGANIZATION_VERIFICATION_RESOURCES, resource);
  return next ? { phase: "organizationVerification", resource: next } : { completed: true };
}

function repairShopPhase(resource: ShopVerificationResource): ShopPhase {
  if (resource === "core") return "shopCore";
  return `shop${resource[0].toUpperCase()}${resource.slice(1)}` as ShopPhase;
}

function repairOrganizationShopPhase(resource: ShopResource): OrganizationShopPhase {
  return `organizationShop${resource[0].toUpperCase()}${resource.slice(1)}` as OrganizationShopPhase;
}

function organizationVerificationShopResource(
  resource: Extract<OrganizationVerificationResource, `organizationShop${string}`>,
): ShopResource {
  const suffix = resource.slice("organizationShop".length);
  return `${suffix[0].toLowerCase()}${suffix.slice(1)}` as ShopResource;
}

function isLineAccountTombstoned(account: Doc<"staffLineAccounts">) {
  return account.isDeleted && !account.following && account.lineUserId === deletedLineUserId(account._id);
}

async function getCleanupInvariantError(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
): Promise<CleanupInvariantErrorCode | null> {
  if (job.scope === "shop") {
    if (!job.shopId) return "invalid_shop_cleanup_target";
    if (!isShopPhase(job.phase)) return "invalid_shop_cleanup_phase";
    if (
      (job.phase === "shopVerification" && job.resource !== undefined && !isShopVerificationResource(job.resource)) ||
      (job.phase !== "shopVerification" && job.resource !== undefined)
    ) {
      return "invalid_shop_cleanup_progress";
    }
    if (job.currentShopId !== undefined || job.shopCursor !== undefined) {
      return "invalid_shop_cleanup_progress";
    }
    if (job.organizationId) {
      const shop = await ctx.db.get(job.shopId);
      if (shop && shop.organizationId !== job.organizationId) {
        return "invalid_shop_cleanup_target";
      }
    }
    return null;
  }

  if (!job.organizationId || job.shopId) return "invalid_organization_cleanup_target";
  if (!isOrganizationPhase(job.phase)) return "invalid_organization_cleanup_phase";
  if (
    (job.phase === "organizationVerification" &&
      job.resource !== undefined &&
      !isOrganizationVerificationResource(job.resource)) ||
    (job.phase !== "organizationVerification" && job.resource !== undefined)
  ) {
    return "invalid_organization_cleanup_progress";
  }
  const verificationUsesShopProgress =
    job.phase === "organizationVerification" &&
    job.resource !== undefined &&
    isOrganizationShopVerificationResource(job.resource);
  if (
    !isOrganizationShopPhase(job.phase) &&
    !verificationUsesShopProgress &&
    (job.currentShopId !== undefined || job.shopCursor !== undefined)
  ) {
    return "invalid_organization_cleanup_progress";
  }
  if (job.currentShopId) {
    const shop = await ctx.db.get(job.currentShopId);
    if (shop && shop.organizationId !== job.organizationId) {
      return "invalid_organization_cleanup_shop_target";
    }
  }
  return null;
}

async function markCleanupActionRequired(
  ctx: MutationCtx,
  job: Doc<"deletionCleanupJobs">,
  lastErrorCode: CleanupInvariantErrorCode,
) {
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: "actionRequired",
    version: job.version + 1,
    leaseId: undefined,
    leaseExpiresAt: undefined,
    lastErrorCode,
    nextRunAt: now,
    updatedAt: now,
    completedAt: undefined,
  });
}

function pageResult(page: { isDone: boolean; continueCursor: string }): ResourceResult {
  return page.isDone ? { done: true } : { done: false, cursor: page.continueCursor };
}

function nextInSequence<T extends readonly string[]>(sequence: T, current: T[number]): T[number] | undefined {
  return sequence[sequence.indexOf(current) + 1];
}

function isShopPhase(phase: string): phase is ShopPhase {
  return (SHOP_PHASES as readonly string[]).includes(phase);
}

function isOrganizationShopPhase(phase: string): phase is OrganizationShopPhase {
  return (ORGANIZATION_SHOP_PHASES as readonly string[]).includes(phase);
}

function isShopVerificationResource(resource: string): resource is ShopVerificationResource {
  return (SHOP_VERIFICATION_RESOURCES as readonly string[]).includes(resource);
}

function isOrganizationVerificationResource(resource: string): resource is OrganizationVerificationResource {
  return (ORGANIZATION_VERIFICATION_RESOURCES as readonly string[]).includes(resource);
}

function isOrganizationShopVerificationResource(
  resource: string,
): resource is Extract<OrganizationVerificationResource, `organizationShop${string}`> {
  return resource.startsWith("organizationShop") && resource !== "organizationShopsCore";
}

function isOrganizationPhase(phase: string) {
  return (ORGANIZATION_PHASES as readonly string[]).includes(phase) || isOrganizationShopPhase(phase);
}

function resourceForShopPhase(phase: Exclude<ShopPhase, "shopCore" | "shopVerification">): ShopResource {
  return phase.slice("shop".length).replace(/^./, (value) => value.toLowerCase()) as ShopResource;
}

function resourceForOrganizationShopPhase(phase: OrganizationShopPhase): ShopResource {
  return phase.slice("organizationShop".length).replace(/^./, (value) => value.toLowerCase()) as ShopResource;
}
