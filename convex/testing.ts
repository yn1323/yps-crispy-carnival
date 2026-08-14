import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getOrganizationInvitationSigningSecret } from "./_lib/config";
import { getReminderScheduledAt, getSubmitLinkCutoff } from "./_lib/dateFormat";
import { isDryRunManagerEmail, isNotificationDeliverySuppressed } from "./_lib/notificationDelivery";
import { resetRateLimit } from "./_lib/rateLimits";
import { loadShopManagerContacts } from "./_lib/shopManagerRecipients";
import { normalizeSubmissionPattern } from "./_lib/submissionPattern";
import { generateUUID } from "./_lib/uuid";
import { MAGIC_LINK_DEFAULT_TTL_MS, ORGANIZATION_NAME_SUFFIX } from "./constants";
import { getLegalConsentVersions, type LegalAudience } from "./legal/documents";
import { upsertStaffLineAccount } from "./line/service";
import { isOrganizationInvitationIssued } from "./organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "./organizationInvitation/purpose";
import { deriveInvitationToken, digestInvitationToken, invitationRateLimitKey } from "./organizationInvitation/token";
import schema from "./schema";

const TABLE_NAMES = Object.keys(schema.tables) as (keyof typeof schema.tables)[];
const CLEAR_TABLE_BATCH_SIZE = 1000;
const magicLinkPurposeValidator = v.union(v.literal("submit"), v.literal("view"));
const staffEmailScopeArgs = {
  shopId: v.optional(v.id("shops")),
  staffEmail: v.string(),
};
const magicLinkLookupArgs = {
  recruitmentId: v.optional(v.id("recruitments")),
  ...staffEmailScopeArgs,
  purpose: magicLinkPurposeValidator,
};
const scenarioDatesValidator = v.object({
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  dates: v.array(v.string()),
});
const legalConsentStateValidator = v.union(
  v.literal("current"),
  v.literal("missing"),
  v.literal("oldRequired"),
  v.literal("oldDocumentOnly"),
);
const lineDeliveryStateValidator = v.union(v.literal("following"), v.literal("unfollowed"));

const DEFAULT_MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};
const E2E_SIMULATED_NOTIFICATION_FAILURE = "E2E simulated notification failure";

type MagicLinkPurpose = "submit" | "view";
type TestCtx = QueryCtx | MutationCtx;
type ScenarioDates = {
  periodStart: string;
  periodEnd: string;
  deadline: string;
  dates: string[];
};
type LegalConsentState = "current" | "missing" | "oldRequired" | "oldDocumentOnly";
type NotificationOutboxStatus = Doc<"notificationOutbox">["status"];
type NotificationFailureInboxStatus = Doc<"notificationFailureInbox">["status"];
type OrganizationInvitationStatus = Doc<"organizationInvitations">["status"];
type OrganizationMemberStatus = Doc<"organizationMembers">["status"];
type OrganizationPersonStatus = Doc<"organizationPeople">["status"];
type DeletionCleanupJobStatus = Doc<"deletionCleanupJobs">["status"];

const ORGANIZATION_INVITATION_STATUSES: OrganizationInvitationStatus[] = [
  "pending",
  "accepted",
  "issued",
  "linked",
  "revoked",
  "expired",
];
const ORGANIZATION_MEMBER_STATUSES: OrganizationMemberStatus[] = ["active", "readOnly", "removed"];
const ORGANIZATION_PERSON_STATUSES: OrganizationPersonStatus[] = ["active", "removed"];
const ALL_NOTIFICATION_OUTBOX_STATUSES: NotificationOutboxStatus[] = [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
];
const DELETION_CLEANUP_JOB_STATUSES: DeletionCleanupJobStatus[] = [
  "queued",
  "processing",
  "retrying",
  "actionRequired",
  "completed",
];
const E2E_GRAPH_CLEANUP_JOB_LIMIT_PER_STATUS = 100;

function normalizeDeploymentUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function assertE2EHelpersEnabled() {
  const currentDeploymentUrl = normalizeDeploymentUrl(process.env.CONVEX_CLOUD_URL);
  const allowedDeploymentUrl = normalizeDeploymentUrl(process.env.E2E_TESTING_DEPLOYMENT_URL);
  if (
    process.env.E2E_TESTING_ENABLED !== "true" ||
    !currentDeploymentUrl ||
    !allowedDeploymentUrl ||
    currentDeploymentUrl !== allowedDeploymentUrl
  ) {
    throw new Error("E2E testing helpers are disabled for this deployment.");
  }
}

async function findActiveStaffByEmail(ctx: TestCtx, staffEmail: string, shopId?: Id<"shops">) {
  if (shopId) {
    return await ctx.db
      .query("staffs")
      .withIndex("by_shopId_email_isDeleted", (q) =>
        q.eq("shopId", shopId).eq("email", staffEmail).eq("isDeleted", false),
      )
      .first();
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_email", (q) => q.eq("email", staffEmail))
    .order("desc")
    .take(10);
  return staffs.find((staff) => !staff.isDeleted) ?? null;
}

function matchesPurpose(status: "open" | "confirmed", purpose: MagicLinkPurpose) {
  return purpose === "submit" ? status === "open" : status === "confirmed";
}

function legalConsentPayload(audience: LegalAudience, state: LegalConsentState = "current") {
  const versions = getLegalConsentVersions(audience);
  const consentVersions =
    state === "oldRequired"
      ? {
          termsConsentVersion: `${versions.termsConsentVersion}-old`,
          privacyConsentVersion: `${versions.privacyConsentVersion}-old`,
        }
      : {
          termsConsentVersion: versions.termsConsentVersion,
          privacyConsentVersion: versions.privacyConsentVersion,
        };
  const documentVersions =
    state === "oldDocumentOnly"
      ? {
          termsDocumentVersion: `${versions.termsDocumentVersion}-old`,
          privacyDocumentVersion: `${versions.privacyDocumentVersion}-old`,
        }
      : {
          termsDocumentVersion: versions.termsDocumentVersion,
          privacyDocumentVersion: versions.privacyDocumentVersion,
        };

  return {
    ...consentVersions,
    ...documentVersions,
    consentedAt: Date.now() - 1000,
    method: audience === "manager" ? "manager_setup" : "staff_email_link",
  };
}

async function seedLegalConsentState(
  ctx: MutationCtx,
  args: {
    audience: LegalAudience;
    state?: LegalConsentState;
    shopId: Id<"shops">;
    userId?: Id<"users">;
    staffId?: Id<"staffs">;
  },
) {
  if ((args.state ?? "current") === "missing") return;
  const payload = legalConsentPayload(args.audience, args.state);
  await ctx.db.insert("legalConsentStates", {
    subjectType: args.audience === "manager" ? "user" : "staff",
    userId: args.userId,
    staffId: args.staffId,
    shopId: args.shopId,
    ...payload,
  });
}

async function deleteRecruitmentGraph(ctx: MutationCtx, recruitmentId: Id<"recruitments">) {
  const [slots, dates, submissions, assignments, snapshots, stats] = await Promise.all([
    ctx.db
      .query("shiftSubmissionSlots")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftSubmissionDates")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftConfirmationSnapshots")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("recruitmentStats")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
  ]);

  for (const doc of [...slots, ...dates, ...submissions, ...assignments, ...snapshots, ...stats]) {
    await ctx.db.delete(doc._id);
  }
}

async function deleteStaffAuthGraph(ctx: MutationCtx, staffId: Id<"staffs">) {
  const [magicLinks, lineLinkTokens, sessions, legalConsentTokens, lineAccounts, legalConsentStates] =
    await Promise.all([
      ctx.db
        .query("magicLinks")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("lineLinkTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("sessions")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("legalConsentTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
    ]);

  for (const doc of [
    ...magicLinks,
    ...lineLinkTokens,
    ...sessions,
    ...legalConsentTokens,
    ...lineAccounts,
    ...legalConsentStates,
  ]) {
    await ctx.db.delete(doc._id);
  }
}

async function deleteShopNotificationGraph(ctx: MutationCtx, shopId: Id<"shops">) {
  const failureStatuses: NotificationFailureInboxStatus[] = ["open", "retrying", "resolved"];
  const [outboxByStatus, failuresByStatus, deliveryEvents, usage] = await Promise.all([
    Promise.all(
      ALL_NOTIFICATION_OUTBOX_STATUSES.map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", status))
          .collect(),
      ),
    ),
    Promise.all(
      failureStatuses.map((status) =>
        ctx.db
          .query("notificationFailureInbox")
          .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", status))
          .collect(),
      ),
    ),
    ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_shopId_createdAt", (q) => q.eq("shopId", shopId))
      .collect(),
    ctx.db
      .query("notificationUsage")
      .withIndex("by_shopId_month", (q) => q.eq("shopId", shopId))
      .collect(),
  ]);

  for (const doc of [...failuresByStatus.flat(), ...deliveryEvents, ...outboxByStatus.flat(), ...usage]) {
    await ctx.db.delete(doc._id);
  }
}

async function deleteShopCleanupJobs(ctx: MutationCtx, shopId: Id<"shops">) {
  for (const status of DELETION_CLEANUP_JOB_STATUSES) {
    const jobs = await ctx.db
      .query("deletionCleanupJobs")
      .withIndex("by_shopId_and_status", (q) => q.eq("shopId", shopId).eq("status", status))
      .take(E2E_GRAPH_CLEANUP_JOB_LIMIT_PER_STATUS + 1);
    if (jobs.length > E2E_GRAPH_CLEANUP_JOB_LIMIT_PER_STATUS) {
      throw new Error(`E2E shop cleanup job reset limit exceeded: shopId=${shopId}, status=${status}`);
    }
    for (const job of jobs) await ctx.db.delete(job._id);
  }
}

async function deleteOrganizationCleanupJobs(ctx: MutationCtx, organizationId: Id<"organizations">) {
  for (const status of DELETION_CLEANUP_JOB_STATUSES) {
    const jobs = await ctx.db
      .query("deletionCleanupJobs")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
      .take(E2E_GRAPH_CLEANUP_JOB_LIMIT_PER_STATUS + 1);
    if (jobs.length > E2E_GRAPH_CLEANUP_JOB_LIMIT_PER_STATUS) {
      throw new Error(
        `E2E organization cleanup job reset limit exceeded: organizationId=${organizationId}, status=${status}`,
      );
    }
    for (const job of jobs) await ctx.db.delete(job._id);
  }
}

async function assertShopNotificationAuditBeforeReset(ctx: MutationCtx, shopId: Id<"shops">) {
  const [unresolvedByStatus, activeOutboxByStatus] = await Promise.all([
    Promise.all(
      (["open", "retrying"] as const).map((status) =>
        ctx.db
          .query("notificationFailureInbox")
          .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", status))
          .collect(),
      ),
    ),
    Promise.all(
      (["pending", "processing"] as const).map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", status))
          .collect(),
      ),
    ),
  ]);
  const unexpectedFailureCount = unresolvedByStatus
    .flat()
    .filter((failure) => failure.lastError !== E2E_SIMULATED_NOTIFICATION_FAILURE).length;
  const activeDedupeCounts = new Map<string, number>();
  for (const job of activeOutboxByStatus.flat()) {
    activeDedupeCounts.set(job.dedupeKey, (activeDedupeCounts.get(job.dedupeKey) ?? 0) + 1);
  }
  const duplicateActiveDedupeKeyCount = [...activeDedupeCounts.values()].filter((count) => count > 1).length;

  if (unexpectedFailureCount > 0 || duplicateActiveDedupeKeyCount > 0) {
    throw new Error(
      `E2E notification audit failed before reset: unexpectedFailures=${unexpectedFailureCount}, duplicateActiveDedupeKeys=${duplicateActiveDedupeKeyCount}`,
    );
  }
}

async function deleteShopGraph(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  { auditBeforeReset = true }: { auditBeforeReset?: boolean } = {},
) {
  // 同一run内では、店舗を最終auditの対象外にする前に前シナリオの異常を検出する。
  if (auditBeforeReset) await assertShopNotificationAuditBeforeReset(ctx, shopId);
  // 監査済みの通知状態は、次シナリオへ混入しないよう店舗graphと一緒に破棄する。
  await deleteShopNotificationGraph(ctx, shopId);
  await deleteShopCleanupJobs(ctx, shopId);

  const [
    featureRequests,
    registrationLinks,
    registrationRequestPages,
    legalConsentStates,
    legalConsentEvents,
    billingStates,
  ] = await Promise.all([
    ctx.db
      .query("featureRequests")
      .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
      .collect(),
    ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
      .collect(),
    Promise.all(
      (["pending", "approved", "rejected"] as const).map((status) =>
        ctx.db
          .query("staffRegistrationRequests")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", status))
          .collect(),
      ),
    ),
    ctx.db
      .query("legalConsentStates")
      .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
      .collect(),
    ctx.db
      .query("legalConsentEvents")
      .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
      .collect(),
    ctx.db
      .query("shopBillingStates")
      .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
      .collect(),
  ]);
  for (const doc of [
    ...featureRequests,
    ...registrationLinks,
    ...registrationRequestPages.flat(),
    ...legalConsentStates,
    ...legalConsentEvents,
    ...billingStates,
  ]) {
    await ctx.db.delete(doc._id);
  }

  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const recruitment of recruitments) {
    await deleteRecruitmentGraph(ctx, recruitment._id);
    await ctx.db.delete(recruitment._id);
  }
  const orphanRecruitmentStats = await ctx.db
    .query("recruitmentStats")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const stats of orphanRecruitmentStats) {
    await ctx.db.delete(stats._id);
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const staff of staffs) {
    await deleteStaffAuthGraph(ctx, staff._id);
    await ctx.db.delete(staff._id);
  }

  const memberPages = await Promise.all(
    ([false, true] as const).map((isDeleted) =>
      ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", isDeleted))
        .collect(),
    ),
  );
  for (const member of memberPages.flat()) {
    await ctx.db.delete(member._id);
  }

  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const position of positions) {
    await ctx.db.delete(position._id);
  }

  await ctx.db.delete(shopId);
}

async function assertOrganizationNotificationAuditBeforeReset(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const activeOutboxPages = await Promise.all(
    (["pending", "processing"] as const).map((status) =>
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
        .collect(),
    ),
  );
  const activeDedupeCounts = new Map<string, number>();
  for (const job of activeOutboxPages.flat()) {
    activeDedupeCounts.set(job.dedupeKey, (activeDedupeCounts.get(job.dedupeKey) ?? 0) + 1);
  }
  const duplicateActiveDedupeKeyCount = [...activeDedupeCounts.values()].filter((count) => count > 1).length;
  if (duplicateActiveDedupeKeyCount > 0) {
    throw new Error(
      `E2E organization notification audit failed before reset: duplicateActiveDedupeKeys=${duplicateActiveDedupeKeyCount}`,
    );
  }
}

async function deleteOrganizationNotificationGraph(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const [outboxPages, deliveryEvents] = await Promise.all([
    Promise.all(
      ALL_NOTIFICATION_OUTBOX_STATUSES.map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
          .collect(),
      ),
    ),
    ctx.db
      .query("notificationDeliveryEvents")
      .withIndex("by_organizationId_createdAt", (q) => q.eq("organizationId", organizationId))
      .collect(),
  ]);

  for (const event of deliveryEvents) await ctx.db.delete(event._id);
  for (const job of outboxPages.flat()) await ctx.db.delete(job._id);
}

async function deleteOrganizationGraph(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  { auditBeforeReset = true }: { auditBeforeReset?: boolean } = {},
) {
  if (auditBeforeReset) await assertOrganizationNotificationAuditBeforeReset(ctx, organizationId);
  await deleteOrganizationNotificationGraph(ctx, organizationId);
  await deleteOrganizationCleanupJobs(ctx, organizationId);

  const organizationFeatureRequests = await ctx.db
    .query("featureRequests")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .collect();
  for (const request of organizationFeatureRequests) await ctx.db.delete(request._id);

  const shops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .collect();
  for (const shop of shops) {
    await deleteShopGraph(ctx, shop._id, { auditBeforeReset });
  }

  const [invitationPages, billingStates, auditEvents, migrationConflicts, memberPages, personPages] = await Promise.all(
    [
      Promise.all(
        ORGANIZATION_INVITATION_STATUSES.map((status) =>
          ctx.db
            .query("organizationInvitations")
            .withIndex("by_organizationId_and_status", (q) =>
              q.eq("organizationId", organizationId).eq("status", status),
            )
            .collect(),
        ),
      ),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .collect(),
      ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
        .collect(),
      ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_organizationId_and_resolvedAt", (q) => q.eq("organizationId", organizationId))
        .collect(),
      Promise.all(
        ORGANIZATION_MEMBER_STATUSES.map((status) =>
          ctx.db
            .query("organizationMembers")
            .withIndex("by_organizationId_and_status", (q) =>
              q.eq("organizationId", organizationId).eq("status", status),
            )
            .collect(),
        ),
      ),
      Promise.all(
        ORGANIZATION_PERSON_STATUSES.map((status) =>
          ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId_and_status", (q) =>
              q.eq("organizationId", organizationId).eq("status", status),
            )
            .collect(),
        ),
      ),
    ],
  );

  for (const invitation of invitationPages.flat()) await ctx.db.delete(invitation._id);
  for (const billingState of billingStates) await ctx.db.delete(billingState._id);
  for (const auditEvent of auditEvents) await ctx.db.delete(auditEvent._id);
  for (const conflict of migrationConflicts) await ctx.db.delete(conflict._id);
  for (const member of memberPages.flat()) await ctx.db.delete(member._id);
  for (const person of personPages.flat()) await ctx.db.delete(person._id);
  await ctx.db.delete(organizationId);
}

async function deleteUserIfScenarioOrphaned(ctx: MutationCtx, userId: Id<"users">) {
  const [memberPages, personPages, legacyMemberPages, staff] = await Promise.all([
    Promise.all(
      ORGANIZATION_MEMBER_STATUSES.map((status) =>
        ctx.db
          .query("organizationMembers")
          .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
          .first(),
      ),
    ),
    Promise.all(
      ORGANIZATION_PERSON_STATUSES.map((status) =>
        ctx.db
          .query("organizationPeople")
          .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
          .first(),
      ),
    ),
    Promise.all(
      ([false, true] as const).map((isDeleted) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", isDeleted))
          .first(),
      ),
    ),
    ctx.db
      .query("staffs")
      .withIndex("by_userId_and_shopId", (q) => q.eq("userId", userId))
      .first(),
  ]);
  if ([...memberPages, ...personPages, ...legacyMemberPages, staff].some(Boolean)) return;

  const legalConsentStates = await ctx.db
    .query("legalConsentStates")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const state of legalConsentStates) await ctx.db.delete(state._id);
  const legalConsentEvents = await ctx.db
    .query("legalConsentEvents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const event of legalConsentEvents) await ctx.db.delete(event._id);
  await ctx.db.delete(userId);
}

async function deleteScenarioUsersByAuthTokenIdentifiers(ctx: MutationCtx, authTokenIdentifiers: string[]) {
  for (const authTokenIdentifier of new Set(authTokenIdentifiers)) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", authTokenIdentifier))
      .collect();
    for (const user of users) await deleteUserIfScenarioOrphaned(ctx, user._id);
  }
}

async function resetManagerScenarioDataForAuth(
  ctx: MutationCtx,
  managerAuthTokenIdentifier: string,
  options?: { auditBeforeReset?: boolean },
) {
  // multi-actor burn-inでも、同じClerk actorの招待受諾budgetを前の反復から引き継がない。
  await resetRateLimit(ctx, {
    name: "organizationManagerInviteAcceptActor",
    key: invitationRateLimitKey(await digestInvitationToken(`actor:${managerAuthTokenIdentifier}`)),
  });
  const users = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", managerAuthTokenIdentifier))
    .collect();
  for (const user of users) {
    const organizations = await ctx.db
      .query("organizations")
      .withIndex("by_createdByUserId", (q) => q.eq("createdByUserId", user._id))
      .collect();
    for (const organization of organizations) {
      await deleteOrganizationGraph(ctx, organization._id, options);
    }

    const legacyMembershipPages = await Promise.all(
      ([false, true] as const).map((isDeleted) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", isDeleted))
          .collect(),
      ),
    );
    const legacyShopIds = new Set<Id<"shops">>();
    for (const membership of legacyMembershipPages.flat()) {
      const shop = await ctx.db.get(membership.shopId);
      if (shop && !shop.organizationId) legacyShopIds.add(shop._id);
    }
    for (const shopId of legacyShopIds) await deleteShopGraph(ctx, shopId, options);

    await deleteUserIfScenarioOrphaned(ctx, user._id);
  }
}

export const resetManagerScenarioData = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    if (!args.managerAuthTokenIdentifier) throw new Error("managerAuthTokenIdentifier is required");
    await resetManagerScenarioDataForAuth(ctx, args.managerAuthTokenIdentifier);
    return { reset: true };
  },
});

/** 前回runの失敗状態だけをPlaywright setupで回収する。同一run内のseedはstrict resetを使う。 */
export const forceResetManagerScenarioData = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    if (!args.managerAuthTokenIdentifier) throw new Error("managerAuthTokenIdentifier is required");
    await resetManagerScenarioDataForAuth(ctx, args.managerAuthTokenIdentifier, { auditBeforeReset: false });
    return { reset: true };
  },
});

async function createManagerScenario(
  ctx: MutationCtx,
  args: {
    managerAuthTokenIdentifier: string;
    managerEmail?: string;
    organizationName?: string;
    shopName: string;
    managerLegalConsentState?: LegalConsentState;
    managerStaffLegalConsentState?: LegalConsentState;
  },
) {
  assertE2EHelpersEnabled();
  if (!args.managerAuthTokenIdentifier) throw new Error("managerAuthTokenIdentifier is required");
  await resetManagerScenarioDataForAuth(ctx, args.managerAuthTokenIdentifier);

  const managerEmail = (args.managerEmail ?? DEFAULT_MANAGER.email).trim().toLowerCase();
  const fixture = await createCanonicalOrganizationFixture(ctx, {
    ownerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
    ownerName: DEFAULT_MANAGER.name,
    ownerEmail: managerEmail,
    organizationName: args.organizationName ?? `${args.shopName}${ORGANIZATION_NAME_SUFFIX}`,
    shopName: args.shopName,
  });
  const { organizationId, ownerMemberId, ownerPersonId, shopId, userId } = fixture;
  await seedLegalConsentState(ctx, {
    audience: "manager",
    state: args.managerLegalConsentState,
    shopId,
    userId,
  });
  const managerStaff = await createScenarioStaff(ctx, {
    organizationId,
    shopId,
    personId: ownerPersonId,
    userId,
    name: DEFAULT_MANAGER.name,
    email: managerEmail,
  });
  await seedLegalConsentState(ctx, {
    audience: "staff",
    state: args.managerStaffLegalConsentState,
    shopId,
    staffId: managerStaff.staffId,
  });

  return {
    organizationId,
    ownerMemberId,
    ownerPersonId,
    shopId,
    userId,
    managerStaffId: managerStaff.staffId,
  };
}

function normalizeScenarioEmail(email: string) {
  return email.trim().toLowerCase();
}

async function createScenarioUser(
  ctx: MutationCtx,
  args: { authTokenIdentifier: string; name: string; email: string },
) {
  if (!args.authTokenIdentifier) throw new Error("authTokenIdentifier is required");
  const emailNormalized = normalizeScenarioEmail(args.email);
  const current = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", args.authTokenIdentifier))
    .filter((q) => q.eq(q.field("isDeleted"), false))
    .first();
  if (current) {
    if (normalizeScenarioEmail(current.emailNormalized ?? current.email) !== emailNormalized) {
      throw new Error("E2E actor email does not match the existing authenticated user");
    }
    return current._id;
  }
  return await ctx.db.insert("users", {
    authTokenIdentifier: args.authTokenIdentifier,
    name: args.name,
    email: emailNormalized,
    emailNormalized,
    role: "manager",
    isDeleted: false,
  });
}

async function createScenarioOrganization(
  ctx: MutationCtx,
  args: { createdByUserId: Id<"users">; name: string; billingEmail: string },
) {
  const now = Date.now();
  const billingEmailNormalized = normalizeScenarioEmail(args.billingEmail);
  return await ctx.db.insert("organizations", {
    createdByUserId: args.createdByUserId,
    name: args.name,
    billingEmail: billingEmailNormalized,
    billingEmailNormalized,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function createScenarioPerson(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; name: string; email: string; userId?: Id<"users"> },
) {
  const now = Date.now();
  const emailNormalized = normalizeScenarioEmail(args.email);
  return await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    userId: args.userId,
    name: args.name,
    email: emailNormalized,
    emailNormalized,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function createScenarioMember(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    userId: Id<"users">;
    invitedByMemberId?: Id<"organizationMembers">;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("organizationMembers", {
    ...args,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function createScenarioShop(ctx: MutationCtx, args: { organizationId: Id<"organizations">; name: string }) {
  const shopId = await ctx.db.insert("shops", {
    organizationId: args.organizationId,
    operatingStatus: "active",
    name: args.name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
  return shopId;
}

async function createComplimentaryBusinessEntitlement(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const now = Date.now();
  return await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: { kind: "complimentary", plan: "business" },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

async function createActiveFreeEntitlement(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    managerPersonId: Id<"organizationPeople">;
    shopId: Id<"shops">;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("organizationBillingStates", {
    organizationId: args.organizationId,
    state: { kind: "active", plan: "free" },
    freeManagerPersonId: args.managerPersonId,
    freeShopId: args.shopId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

async function createScenarioStaff(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    name: string;
    email: string;
    personId?: Id<"organizationPeople">;
    userId?: Id<"users">;
  },
) {
  const personId =
    args.personId ??
    (await createScenarioPerson(ctx, {
      organizationId: args.organizationId,
      name: args.name,
      email: args.email,
    }));
  const staffId = await ctx.db.insert("staffs", {
    organizationId: args.organizationId,
    organizationPersonId: personId,
    shopId: args.shopId,
    name: args.name,
    email: normalizeScenarioEmail(args.email),
    emailNormalized: normalizeScenarioEmail(args.email),
    userId: args.userId,
    excludedFromShift: false,
    isDeleted: false,
  });
  return { personId, staffId };
}

async function createCanonicalOrganizationFixture(
  ctx: MutationCtx,
  args: {
    ownerAuthTokenIdentifier: string;
    ownerName: string;
    ownerEmail: string;
    organizationName: string;
    shopName: string;
  },
) {
  const userId = await createScenarioUser(ctx, {
    authTokenIdentifier: args.ownerAuthTokenIdentifier,
    name: args.ownerName,
    email: args.ownerEmail,
  });
  const organizationId = await createScenarioOrganization(ctx, {
    createdByUserId: userId,
    name: args.organizationName,
    billingEmail: args.ownerEmail,
  });
  const ownerPersonId = await createScenarioPerson(ctx, {
    organizationId,
    userId,
    name: args.ownerName,
    email: args.ownerEmail,
  });
  const ownerMemberId = await createScenarioMember(ctx, {
    organizationId,
    personId: ownerPersonId,
    userId,
  });
  const shopId = await createScenarioShop(ctx, {
    organizationId,
    name: args.shopName,
  });
  await createComplimentaryBusinessEntitlement(ctx, organizationId);
  return { organizationId, ownerMemberId, ownerPersonId, shopId, userId };
}

/** 認証境界E2Eで使う、actor所有の管理者と1店舗だけの前提を作る。 */
export const seedAuthenticatedManagerScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
  },
  returns: v.object({ organizationId: v.id("organizations"), shopId: v.id("shops") }),
  handler: async (ctx, args) => {
    const { organizationId, shopId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "認証境界テスト店舗",
    });
    return { organizationId, shopId };
  },
});

/** 店舗追加・削除E2Eで使う、actor所有のBusiness組織と1店舗を作る。 */
export const seedShopLifecycleScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    shopName: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    shopName: v.string(),
    managerName: v.string(),
  }),
  handler: async (ctx, args) => {
    const shopName = args.shopName ?? "店舗ライフサイクルテスト店舗";
    const { organizationId, shopId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName: args.organizationName,
      shopName,
    });
    return { organizationId, shopId, shopName, managerName: DEFAULT_MANAGER.name };
  },
});

/** スタッフ追加・変更・削除E2Eで使う、actor所有のBusiness組織と1店舗を作る。 */
export const seedStaffLifecycleScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    shopName: v.string(),
    organizationName: v.string(),
    staffName: v.string(),
    staffEmail: v.string(),
  }),
  handler: async (ctx, args) => {
    const organizationName = "スタッフライフサイクルテストグループ";
    const staffName = "E2E 新規スタッフ";
    const staffEmail = "staff-lifecycle@example.test";
    const shopName = "スタッフライフサイクルテスト店舗";
    const { organizationId, shopId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName,
      shopName,
    });
    return { organizationId, shopId, shopName, organizationName, staffName, staffEmail };
  },
});

/** 店舗詳細から所属スタッフを一括変更するE2Eの、actor単位で回収可能な前提を作る。 */
export const seedShopStaffMembershipScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    contextShopId: v.id("shops"),
    targetShopId: v.id("shops"),
    targetShopName: v.string(),
    additionCandidateName: v.string(),
    existingTargetName: v.string(),
  }),
  handler: async (ctx, args) => {
    const contextShopName = "所属変更コンテキスト店舗";
    const targetShopName = "所属変更対象店舗";
    const additionCandidateName = "追加候補スタッフ";
    const existingTargetName = "既存所属スタッフ";
    const fixture = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName: "所属変更テストグループ",
      shopName: contextShopName,
    });
    const targetShopId = await createScenarioShop(ctx, {
      organizationId: fixture.organizationId,
      name: targetShopName,
    });
    await createScenarioStaff(ctx, {
      organizationId: fixture.organizationId,
      shopId: fixture.shopId,
      name: additionCandidateName,
      email: "membership-addition-candidate@example.com",
    });
    await createScenarioStaff(ctx, {
      organizationId: fixture.organizationId,
      shopId: targetShopId,
      name: existingTargetName,
      email: "membership-existing-target@example.com",
    });

    return {
      organizationId: fixture.organizationId,
      contextShopId: fixture.shopId,
      targetShopId,
      targetShopName,
      additionCandidateName,
      existingTargetName,
    };
  },
});

/** 管理者設定E2Eで使う、既存スタッフへの発行・取消をactor単位で回収できる前提。 */
export const seedManagerSettingsScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    organizationName: v.string(),
    currentManagerName: v.string(),
    candidateName: v.string(),
    candidateEmail: v.string(),
  }),
  handler: async (ctx, args) => {
    const organizationName = "管理者設定テストグループ";
    const currentManagerName = DEFAULT_MANAGER.name;
    const candidateName = "管理者候補スタッフ";
    // E2E artifactへ実在し得る宛先を残さない予約済みtest domain。
    const candidateEmail = "manager-candidate@example.test";
    const fixture = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName,
      shopName: "管理者設定テスト店舗",
    });
    await createScenarioStaff(ctx, {
      organizationId: fixture.organizationId,
      shopId: fixture.shopId,
      name: candidateName,
      email: candidateEmail,
    });
    return {
      organizationId: fixture.organizationId,
      shopId: fixture.shopId,
      organizationName,
      currentManagerName,
      candidateName,
      candidateEmail,
    };
  },
});

/** 実Clerk actor同士で管理者招待の受諾と権限解除を通すE2E前提を作る。 */
export const seedManagerLifecycleScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    inviteeAuthTokenIdentifier: v.string(),
    inviteeEmail: v.string(),
  },
  returns: v.object({
    shopId: v.id("shops"),
    organizationId: v.id("organizations"),
    organizationName: v.string(),
    shopName: v.string(),
    candidatePersonId: v.id("organizationPeople"),
    candidateName: v.string(),
    candidateEmail: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    if (!args.inviteeAuthTokenIdentifier) throw new Error("inviteeAuthTokenIdentifier is required");
    if (args.inviteeAuthTokenIdentifier === args.managerAuthTokenIdentifier) {
      throw new Error("Manager lifecycle E2E requires distinct actors");
    }
    if (
      normalizeScenarioEmail(args.inviteeEmail) === normalizeScenarioEmail(args.managerEmail ?? DEFAULT_MANAGER.email)
    ) {
      throw new Error("Manager lifecycle E2E requires distinct actor emails");
    }

    // Bが過去runで作成したE2Eデータだけを先に回収し、Aの新しい組織へ未接続の人物として追加する。
    await resetManagerScenarioDataForAuth(ctx, args.inviteeAuthTokenIdentifier);
    const organizationName = "管理者受諾テストグループ";
    const shopName = "管理者受諾テスト店舗";
    const candidateName = "管理者受諾スタッフ";
    const candidateEmail = normalizeScenarioEmail(args.inviteeEmail);
    const fixture = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName,
      shopName,
    });
    const candidate = await createScenarioStaff(ctx, {
      organizationId: fixture.organizationId,
      shopId: fixture.shopId,
      name: candidateName,
      email: candidateEmail,
    });

    return {
      shopId: fixture.shopId,
      organizationId: fixture.organizationId,
      organizationName,
      shopName,
      candidatePersonId: candidate.personId,
      candidateName,
      candidateEmail,
    };
  },
});

/** Free管理者交代と複数組織切替で共有する、actor単位で回収可能なE2E前提を作る。 */
export const seedFreeManagerMultiOrganizationScenario = internalMutation({
  args: {
    actorAManagerAuthTokenIdentifier: v.string(),
    actorAManagerEmail: v.string(),
    actorBManagerAuthTokenIdentifier: v.string(),
    actorBManagerEmail: v.string(),
    actorCManagerAuthTokenIdentifier: v.string(),
    targetOrganizationName: v.optional(v.string()),
    targetShopName: v.optional(v.string()),
    actorBName: v.optional(v.string()),
    alternateOrganizationName: v.optional(v.string()),
    alternateShopName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const authIdentifiers = [
      args.actorAManagerAuthTokenIdentifier,
      args.actorBManagerAuthTokenIdentifier,
      args.actorCManagerAuthTokenIdentifier,
    ];
    if (authIdentifiers.some((identifier) => !identifier) || new Set(authIdentifiers).size !== 3) {
      throw new Error("Free manager multi-organization E2E seed requires three distinct auth token identifiers");
    }
    if (normalizeScenarioEmail(args.actorAManagerEmail) === normalizeScenarioEmail(args.actorBManagerEmail)) {
      throw new Error("Free manager multi-organization E2E seed requires distinct actor emails");
    }

    // 両組織をAのcreatedByUserId配下へ置くことで、既存のactor単位resetだけで安全に回収する。
    await resetManagerScenarioDataForAuth(ctx, args.actorAManagerAuthTokenIdentifier);
    await deleteScenarioUsersByAuthTokenIdentifiers(ctx, [
      args.actorBManagerAuthTokenIdentifier,
      args.actorCManagerAuthTokenIdentifier,
    ]);

    const actorAUserId = await createScenarioUser(ctx, {
      authTokenIdentifier: args.actorAManagerAuthTokenIdentifier,
      name: DEFAULT_MANAGER.name,
      email: args.actorAManagerEmail,
    });
    const actorBName = args.actorBName ?? "交代先スタッフB";
    const targetOrganizationName = args.targetOrganizationName ?? "E2E Free交代対象グループ";
    const targetShopName = args.targetShopName ?? "E2E Free交代対象店舗";
    const targetOrganizationId = await createScenarioOrganization(ctx, {
      createdByUserId: actorAUserId,
      name: targetOrganizationName,
      billingEmail: args.actorAManagerEmail,
    });
    const actorATargetPersonId = await createScenarioPerson(ctx, {
      organizationId: targetOrganizationId,
      userId: actorAUserId,
      name: DEFAULT_MANAGER.name,
      email: args.actorAManagerEmail,
    });
    const actorATargetMemberId = await createScenarioMember(ctx, {
      organizationId: targetOrganizationId,
      personId: actorATargetPersonId,
      userId: actorAUserId,
    });
    const targetShopId = await createScenarioShop(ctx, {
      organizationId: targetOrganizationId,
      name: targetShopName,
    });
    await createActiveFreeEntitlement(ctx, {
      organizationId: targetOrganizationId,
      managerPersonId: actorATargetPersonId,
      shopId: targetShopId,
    });
    const actorATargetStaff = await createScenarioStaff(ctx, {
      organizationId: targetOrganizationId,
      shopId: targetShopId,
      personId: actorATargetPersonId,
      userId: actorAUserId,
      name: DEFAULT_MANAGER.name,
      email: args.actorAManagerEmail,
    });
    const actorBTargetPersonId = await createScenarioPerson(ctx, {
      organizationId: targetOrganizationId,
      name: actorBName,
      email: args.actorBManagerEmail,
    });
    const actorBTargetStaff = await createScenarioStaff(ctx, {
      organizationId: targetOrganizationId,
      shopId: targetShopId,
      personId: actorBTargetPersonId,
      name: actorBName,
      email: args.actorBManagerEmail,
    });

    const alternateOrganizationName = args.alternateOrganizationName ?? "E2E A継続管理グループ";
    const alternateShopName = args.alternateShopName ?? "E2E A継続管理店舗";
    const alternateOrganizationId = await createScenarioOrganization(ctx, {
      createdByUserId: actorAUserId,
      name: alternateOrganizationName,
      billingEmail: args.actorAManagerEmail,
    });
    const actorAAlternatePersonId = await createScenarioPerson(ctx, {
      organizationId: alternateOrganizationId,
      userId: actorAUserId,
      name: DEFAULT_MANAGER.name,
      email: args.actorAManagerEmail,
    });
    const actorAAlternateMemberId = await createScenarioMember(ctx, {
      organizationId: alternateOrganizationId,
      personId: actorAAlternatePersonId,
      userId: actorAUserId,
    });
    const alternateShopId = await createScenarioShop(ctx, {
      organizationId: alternateOrganizationId,
      name: alternateShopName,
    });
    await createActiveFreeEntitlement(ctx, {
      organizationId: alternateOrganizationId,
      managerPersonId: actorAAlternatePersonId,
      shopId: alternateShopId,
    });
    const actorAAlternateStaff = await createScenarioStaff(ctx, {
      organizationId: alternateOrganizationId,
      shopId: alternateShopId,
      personId: actorAAlternatePersonId,
      userId: actorAUserId,
      name: DEFAULT_MANAGER.name,
      email: args.actorAManagerEmail,
    });

    return {
      actorAUserId,
      actorAName: DEFAULT_MANAGER.name,
      targetOrganizationId,
      targetOrganizationName,
      targetShopId,
      targetShopName,
      actorATargetPersonId,
      actorATargetMemberId,
      actorATargetStaffId: actorATargetStaff.staffId,
      actorBTargetPersonId,
      actorBTargetStaffId: actorBTargetStaff.staffId,
      actorBName,
      alternateOrganizationId,
      alternateOrganizationName,
      alternateShopId,
      alternateShopName,
      actorAAlternatePersonId,
      actorAAlternateMemberId,
      actorAAlternateStaffId: actorAAlternateStaff.staffId,
    };
  },
});

async function setStaffLineDeliveryState(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    state?: "following" | "unfollowed";
  },
) {
  if (!args.state) return;
  await upsertStaffLineAccount(ctx, {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: `U_e2e_${args.staffId}`,
    following: args.state === "following",
  });
}

async function createRecruitment(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    dates: ScenarioDates;
    status: "open" | "confirmed";
    shopClosedDates?: string[];
    submissionPattern?: Parameters<typeof normalizeSubmissionPattern>[0];
    reminderScheduledAt?: number;
  },
) {
  const submissionPattern = normalizeSubmissionPattern(args.submissionPattern);
  return await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: args.dates.periodStart,
    periodEnd: args.dates.periodEnd,
    deadline: args.dates.deadline,
    shopClosedDates: args.shopClosedDates ?? [],
    status: args.status,
    confirmedAt: args.status === "confirmed" ? Date.now() : undefined,
    isDeleted: false,
    submissionPattern,
    ...(args.reminderScheduledAt ? { reminderScheduledAt: args.reminderScheduledAt } : {}),
  });
}

async function findRecruitmentForPurpose(
  ctx: TestCtx,
  staff: { shopId: Id<"shops"> },
  purpose: MagicLinkPurpose,
  recruitmentId?: Id<"recruitments">,
) {
  if (recruitmentId) {
    const recruitment = await ctx.db.get(recruitmentId);
    if (
      recruitment &&
      !recruitment.isDeleted &&
      recruitment.shopId === staff.shopId &&
      matchesPurpose(recruitment.status, purpose)
    ) {
      return recruitment;
    }
    return null;
  }

  const status = purpose === "submit" ? "open" : "confirmed";
  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", staff.shopId).eq("status", status))
    .order("desc")
    .take(10);
  return recruitments.find((recruitment) => !recruitment.isDeleted) ?? null;
}

/**
 * E2Eテスト用：全テーブルのデータをクリア
 * GitHub Actionsでseed import前に実行
 */
export const clearAllTables = internalMutation({
  args: { tableName: v.optional(v.string()) },
  returns: v.object({
    cleared: v.array(v.string()),
    deleted: v.number(),
    nextTable: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async ({ db }, args) => {
    assertE2EHelpersEnabled();

    const tableName = args.tableName ?? TABLE_NAMES[0];
    if (!tableName || !TABLE_NAMES.includes(tableName as (typeof TABLE_NAMES)[number])) {
      throw new Error(`Unknown table name: ${args.tableName ?? "<first>"}`);
    }

    const tableIndex = TABLE_NAMES.indexOf(tableName as (typeof TABLE_NAMES)[number]);
    const docs = await db.query(tableName as (typeof TABLE_NAMES)[number]).take(CLEAR_TABLE_BATCH_SIZE);
    for (const doc of docs) {
      await db.delete(doc._id);
    }

    const hasMore = docs.length === CLEAR_TABLE_BATCH_SIZE;
    const nextTable = hasMore ? tableName : (TABLE_NAMES[tableIndex + 1] ?? null);

    return {
      cleared: hasMore ? [] : [tableName],
      deleted: docs.length,
      nextTable,
      done: nextTable === null,
    };
  },
});

export const seedNotificationSubmitScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
    managerLineState: v.optional(lineDeliveryStateValidator),
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "通知募集テスト店舗",
    });
    await setStaffLineDeliveryState(ctx, {
      staffId: managerStaffId,
      shopId,
      state: args.managerLineState,
    });

    // 募集作成・通知action・token発行はブラウザ操作から通す。
    // seedは認証済み管理者と店舗という前提状態だけを作る。
    return { shopId, staffId: managerStaffId };
  },
});

export const seedOpenRecruitmentNotificationScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
    managerLineState: v.optional(lineDeliveryStateValidator),
    managerLegalConsentState: v.optional(legalConsentStateValidator),
    managerStaffLegalConsentState: v.optional(legalConsentStateValidator),
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "追加通知テスト店舗",
      managerLegalConsentState: args.managerLegalConsentState,
      managerStaffLegalConsentState: args.managerStaffLegalConsentState,
    });
    const recruitmentId = await createRecruitment(ctx, {
      shopId,
      dates: args.dates,
      status: "open",
      reminderScheduledAt: getReminderScheduledAt(args.dates.deadline),
    });
    await setStaffLineDeliveryState(ctx, {
      staffId: managerStaffId,
      shopId,
      state: args.managerLineState,
    });

    return { shopId, recruitmentId, staffId: managerStaffId };
  },
});

/** LINE通知の下位層テストで使う、管理者と店舗だけの最小fixture。 */
export const seedLineLinkScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "LINE連携テスト店舗",
    });

    return { shopId, staffId: managerStaffId };
  },
});

export const getLatestMagicLinkToken = internalQuery({
  args: magicLinkLookupArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId);
    if (!staff) return { token: null };

    const links = await ctx.db
      .query("magicLinks")
      .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
      .order("desc")
      .take(50);

    for (const link of links) {
      if (args.recruitmentId && link.recruitmentId !== args.recruitmentId) continue;
      const recruitment = await ctx.db.get(link.recruitmentId);
      if (!recruitment || recruitment.isDeleted || !matchesPurpose(recruitment.status, args.purpose)) continue;
      return {
        token: link.token,
        staffId: staff._id,
        recruitmentId: link.recruitmentId,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt ?? null,
      };
    }

    return { token: null };
  },
});

/**
 * E2E専用：画面から発行済みの管理者招待を、受諾browserへ渡すためだけに再導出する。
 * 招待本文、宛先、DB documentは返さず、digest不一致も安全な分類だけで失敗させる。
 */
export const getManagerInvitationCapability = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    targetPersonId: v.id("organizationPeople"),
  },
  returns: v.object({ token: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const issued = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_targetPersonId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("targetPersonId", args.targetPersonId).eq("status", "issued"),
      )
      .order("desc")
      .take(2);
    const invitations = issued.filter(
      (invitation) =>
        isOrganizationInvitationIssued(invitation) &&
        getOrganizationInvitationPurpose(invitation) === "managerAddition",
    );
    if (invitations.length === 0) return { token: null };
    if (invitations.length !== 1) {
      throw new Error("E2E capability lookup failed: ambiguous-manager-invitation");
    }

    const invitation = invitations[0];
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: getOrganizationInvitationSigningSecret(),
    });
    if ((await digestInvitationToken(token)) !== invitation.tokenDigest) {
      throw new Error("E2E capability lookup failed: manager-invitation-digest-mismatch");
    }
    return { token };
  },
});

export const getE2ERecipientSafetyState = internalQuery({
  args: { email: v.string() },
  handler: async (_ctx, { email }) => {
    assertE2EHelpersEnabled();
    return {
      notificationDeliverySuppressed: isNotificationDeliverySuppressed() || isDryRunManagerEmail(email),
    };
  },
});

export const getE2EShopSafetyState = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    assertE2EHelpersEnabled();
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return { notificationDeliverySuppressed: false };

    const managers = await loadShopManagerContacts(ctx, shopId, 10);
    const allManagersAreDryRun =
      !managers.candidateLimitExceeded &&
      managers.contacts.length > 0 &&
      managers.contacts.every((manager) =>
        isDryRunManagerEmail(manager.kind === "canonical" ? manager.person.email : manager.user.email),
      );

    return {
      notificationDeliverySuppressed: isNotificationDeliverySuppressed() || allManagersAreDryRun,
    };
  },
});

export const createMagicLinkTokenForLatestRecruitment = internalMutation({
  args: magicLinkLookupArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId);
    if (!staff) throw new Error("E2E capability seed failed: staff-not-found");

    const recruitment = await findRecruitmentForPurpose(ctx, staff, args.purpose, args.recruitmentId);
    if (!recruitment) throw new Error(`E2E capability seed failed: recruitment-not-found-${args.purpose}`);

    const token = generateUUID();
    await ctx.db.insert("magicLinks", {
      token,
      staffId: staff._id,
      shopId: staff.shopId,
      recruitmentId: recruitment._id,
      accessKind: args.purpose,
      expiresAt:
        args.purpose === "submit"
          ? getSubmitLinkCutoff(recruitment.periodStart)
          : Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
    });

    return { token, staffId: staff._id, recruitmentId: recruitment._id };
  },
});
