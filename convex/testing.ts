import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { APP_URL, getOrganizationInvitationSigningSecret } from "./_lib/config";
import { addDays, getReminderScheduledAt, getSubmitLinkCutoff } from "./_lib/dateFormat";
import { buildLineAuthorizeUrl } from "./_lib/lineClient";
import { isDryRunManagerEmail, isNotificationDeliverySuppressed } from "./_lib/notificationDelivery";
import { normalizeSubmissionPattern, submissionPatternValidator } from "./_lib/submissionPattern";
import { generateUUID } from "./_lib/uuid";
import { LEGAL_CONSENT_TOKEN_TTL_MS, MAGIC_LINK_DEFAULT_TTL_MS } from "./constants";
import { getLegalConsentVersions, type LegalAudience } from "./legal/documents";
import { getStaffLineAccount, upsertStaffLineAccount } from "./line/service";
import { deriveInvitationToken, digestInvitationToken } from "./organizationInvitation/token";
import { ensureDefaultPosition } from "./position/service";
import schema from "./schema";
import { sendReminderRef as sendShopActivationReminderRef } from "./shopActivationReminder/refs";

const TABLE_NAMES = Object.keys(schema.tables) as (keyof typeof schema.tables)[];
const magicLinkPurposeValidator = v.union(v.literal("submit"), v.literal("view"));
const staffEmailScopeArgs = {
  shopId: v.optional(v.id("shops")),
  staffEmail: v.string(),
};
const staffRegistrationReviewSeedEntryValidator = v.object({
  name: v.string(),
  email: v.string(),
});
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
const notificationChannelValidator = v.union(v.literal("email"), v.literal("line"));
const lineDeliveryStateValidator = v.union(v.literal("following"), v.literal("unfollowed"));
const notificationProbeArgs = {
  shopId: v.id("shops"),
  recruitmentId: v.optional(v.id("recruitments")),
  staffEmail: v.optional(v.string()),
  notificationContext: v.optional(v.string()),
  channel: v.optional(notificationChannelValidator),
};
const organizationNotificationProbeArgs = {
  organizationId: v.id("organizations"),
  organizationInvitationId: v.optional(v.id("organizationInvitations")),
  expectedShopId: v.optional(v.id("shops")),
  notificationContext: v.optional(v.string()),
  channel: v.optional(notificationChannelValidator),
};

const DEFAULT_MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};
const DEFAULT_PRIMARY_MARKER = {
  name: "A店識別スタッフ",
  email: "primary.marker@shiftori.invalid",
};
const DEFAULT_SECONDARY_MARKER = {
  name: "B店識別スタッフ",
  email: "secondary.marker@shiftori.invalid",
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

function notificationContextForProbe(job: Doc<"notificationOutbox">) {
  if (job.payload.kind !== "line") return job.payload.context;
  return job.payload.fallbackEmail?.payload.context ?? job.dedupeKey.split(":").slice(0, 2).join(":");
}

async function notificationCtaProbe(ctx: QueryCtx, job: Doc<"notificationOutbox">, expectedShopId?: Id<"shops">) {
  // LINEはfallback emailを除外し、実際のLINE本文/Flex messageにCTAがあることを確認する。
  const payloadForCta =
    job.payload.kind !== "line"
      ? job.payload
      : {
          kind: job.payload.kind,
          text: job.payload.text,
          message: job.payload.message,
        };
  const serializedPayload = JSON.stringify(payloadForCta);
  const ctaShopIds = [...serializedPayload.matchAll(/(?:\?|&|&amp;)shop=([^&"'<>\\\s]+)/g)].map(([, encodedShopId]) => {
    try {
      return decodeURIComponent(encodedShopId);
    } catch {
      return "";
    }
  });
  let ctaShopMatchesTarget: boolean | null = null;
  if (ctaShopIds.length > 0) {
    if (expectedShopId) {
      ctaShopMatchesTarget = ctaShopIds.every((shopId) => shopId === expectedShopId);
    } else if (job.shopId) {
      ctaShopMatchesTarget = ctaShopIds.every((shopId) => shopId === job.shopId);
    } else if (job.organizationId) {
      const targetShops = await Promise.all(
        ctaShopIds.map((shopId) => {
          const normalizedShopId = ctx.db.normalizeId("shops", shopId);
          return normalizedShopId ? ctx.db.get(normalizedShopId) : null;
        }),
      );
      ctaShopMatchesTarget = targetShops.every(
        (shop) => shop !== null && !shop.isDeleted && shop.organizationId === job.organizationId,
      );
    } else {
      ctaShopMatchesTarget = false;
    }
  }
  const hasRecognizedCta =
    job.payload.kind === "organizationManagerInvitationEmail" ||
    job.payload.kind === "organizationManagerInvitationLine" ||
    [
      "/shifts/submit?token=",
      "/shifts/view?token=",
      "/shifts/reissue?",
      "/legal/staff/consent?token=",
      "/staff/register?token=",
      "/dashboard",
      "/settings",
      "access.line.me/oauth2/v2.1/authorize",
    ].some((fragment) => serializedPayload.includes(fragment));

  const staffId = job.staffId;
  if (!staffId) return { hasRecognizedCta, ctaTokenMatchesTarget: null, ctaShopMatchesTarget };

  const [magicLinks, lineLinks, legalLinks] = await Promise.all([
    ctx.db
      .query("magicLinks")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .order("desc")
      .take(20),
    ctx.db
      .query("lineLinkTokens")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .order("desc")
      .take(20),
    ctx.db
      .query("legalConsentTokens")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .order("desc")
      .take(20),
  ]);
  const candidateTokens = [
    ...magicLinks.filter((link) => !job.recruitmentId || link.recruitmentId === job.recruitmentId),
    ...lineLinks,
    ...legalLinks,
  ].map((link) => link.token);
  const requiresTokenMatch = [
    "/shifts/submit?token=",
    "/shifts/view?token=",
    "/legal/staff/consent?token=",
    "access.line.me/oauth2/v2.1/authorize",
  ].some((fragment) => serializedPayload.includes(fragment));

  return {
    hasRecognizedCta,
    ctaShopMatchesTarget,
    ctaTokenMatchesTarget: !requiresTokenMatch
      ? null
      : candidateTokens.length > 0 && candidateTokens.some((token) => serializedPayload.includes(token)),
  };
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

async function findManagerShopByAuthTokenIdentifier(ctx: TestCtx, managerAuthTokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", managerAuthTokenIdentifier))
    .order("desc")
    .first();
  if (!user || user.isDeleted) return null;

  const memberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
    .order("desc")
    .take(10);

  for (const membership of memberships) {
    const shop = await ctx.db.get(membership.shopId);
    if (shop && !shop.isDeleted) return shop;
  }

  return null;
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

export const getManagerShopProbe = internalQuery({
  args: { managerAuthTokenIdentifier: v.string() },
  handler: async (ctx, { managerAuthTokenIdentifier }) => {
    assertE2EHelpersEnabled();
    const shop = await findManagerShopByAuthTokenIdentifier(ctx, managerAuthTokenIdentifier);
    return { shopId: shop?._id ?? null };
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
    organizationName: args.organizationName ?? `${args.shopName}グループ`,
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

async function createScenarioShop(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; name: string; managerUserId: Id<"users"> },
) {
  const shopId = await ctx.db.insert("shops", {
    organizationId: args.organizationId,
    operatingStatus: "active",
    name: args.name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
  await ctx.db.insert("shopMembers", {
    shopId,
    userId: args.managerUserId,
    role: "manager",
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
    managerUserId: userId,
  });
  await createComplimentaryBusinessEntitlement(ctx, organizationId);
  return { organizationId, ownerMemberId, ownerPersonId, shopId, userId };
}

export const seedMultiShopOrganizationScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.string(),
    organizationName: v.optional(v.string()),
    primaryShopName: v.optional(v.string()),
    secondaryShopName: v.optional(v.string()),
    primaryMarkerPersonName: v.optional(v.string()),
    primaryMarkerPersonEmail: v.optional(v.string()),
    secondaryMarkerPersonName: v.optional(v.string()),
    secondaryMarkerPersonEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const primaryShopName = args.primaryShopName ?? "E2E A店";
    const secondaryShopName = args.secondaryShopName ?? "E2E B店";
    const base = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      organizationName: args.organizationName ?? "E2E 複数店舗グループ",
      shopName: primaryShopName,
    });
    const secondaryShopId = await createScenarioShop(ctx, {
      organizationId: base.organizationId,
      name: secondaryShopName,
      managerUserId: base.userId,
    });
    const primaryMarker = await createScenarioStaff(ctx, {
      organizationId: base.organizationId,
      shopId: base.shopId,
      name: args.primaryMarkerPersonName ?? DEFAULT_PRIMARY_MARKER.name,
      email: args.primaryMarkerPersonEmail ?? DEFAULT_PRIMARY_MARKER.email,
    });
    const secondaryMarker = await createScenarioStaff(ctx, {
      organizationId: base.organizationId,
      shopId: secondaryShopId,
      name: args.secondaryMarkerPersonName ?? DEFAULT_SECONDARY_MARKER.name,
      email: args.secondaryMarkerPersonEmail ?? DEFAULT_SECONDARY_MARKER.email,
    });
    return {
      organizationId: base.organizationId,
      primaryOrganizationId: base.organizationId,
      shopId: base.shopId,
      primaryShopId: base.shopId,
      secondaryShopId,
      userId: base.userId,
      ownerPersonId: base.ownerPersonId,
      managerStaffId: base.managerStaffId,
      primaryMarkerPersonId: primaryMarker.personId,
      primaryMarkerStaffId: primaryMarker.staffId,
      secondaryMarkerPersonId: secondaryMarker.personId,
      secondaryMarkerStaffId: secondaryMarker.staffId,
      organizationName: args.organizationName ?? "E2E 複数店舗グループ",
      primaryShopName,
      secondaryShopName,
      primaryMarkerPersonName: args.primaryMarkerPersonName ?? DEFAULT_PRIMARY_MARKER.name,
      primaryMarkerPersonEmail: args.primaryMarkerPersonEmail ?? DEFAULT_PRIMARY_MARKER.email,
      secondaryMarkerPersonName: args.secondaryMarkerPersonName ?? DEFAULT_SECONDARY_MARKER.name,
      secondaryMarkerPersonEmail: args.secondaryMarkerPersonEmail ?? DEFAULT_SECONDARY_MARKER.email,
    };
  },
});

export const seedMultiActorOrganizationScenario = internalMutation({
  args: {
    ownerManagerAuthTokenIdentifier: v.string(),
    ownerManagerEmail: v.string(),
    actorBManagerAuthTokenIdentifier: v.string(),
    actorBManagerEmail: v.string(),
    actorCManagerAuthTokenIdentifier: v.string(),
    actorCManagerEmail: v.string(),
    organizationName: v.optional(v.string()),
    primaryShopName: v.optional(v.string()),
    secondaryShopName: v.optional(v.string()),
    actorBName: v.optional(v.string()),
    actorCName: v.optional(v.string()),
    alternateOrganizationName: v.optional(v.string()),
    alternateShopName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const authIdentifiers = [
      args.ownerManagerAuthTokenIdentifier,
      args.actorBManagerAuthTokenIdentifier,
      args.actorCManagerAuthTokenIdentifier,
    ];
    if (authIdentifiers.some((identifier) => !identifier) || new Set(authIdentifiers).size !== 3) {
      throw new Error("Multi-actor E2E seed requires three distinct auth token identifiers");
    }
    await resetManagerScenarioDataForAuth(ctx, args.ownerManagerAuthTokenIdentifier);
    await deleteScenarioUsersByAuthTokenIdentifiers(ctx, authIdentifiers.slice(1));

    const ownerUserId = await createScenarioUser(ctx, {
      authTokenIdentifier: args.ownerManagerAuthTokenIdentifier,
      name: DEFAULT_MANAGER.name,
      email: args.ownerManagerEmail,
    });
    const actorBName = args.actorBName ?? "既存スタッフ管理者B";
    const actorCName = args.actorCName ?? "未招待管理者C";
    const actorBUserId = await createScenarioUser(ctx, {
      authTokenIdentifier: args.actorBManagerAuthTokenIdentifier,
      name: actorBName,
      email: args.actorBManagerEmail,
    });
    const actorCUserId = await createScenarioUser(ctx, {
      authTokenIdentifier: args.actorCManagerAuthTokenIdentifier,
      name: actorCName,
      email: args.actorCManagerEmail,
    });

    const organizationName = args.organizationName ?? "E2E 複数管理者グループ";
    const primaryShopName = args.primaryShopName ?? "E2E 管理者A店";
    const secondaryShopName = args.secondaryShopName ?? "E2E 管理者B店";
    const primaryOrganizationId = await createScenarioOrganization(ctx, {
      createdByUserId: ownerUserId,
      name: organizationName,
      billingEmail: args.ownerManagerEmail,
    });
    const ownerPersonId = await createScenarioPerson(ctx, {
      organizationId: primaryOrganizationId,
      userId: ownerUserId,
      name: DEFAULT_MANAGER.name,
      email: args.ownerManagerEmail,
    });
    const ownerMemberId = await createScenarioMember(ctx, {
      organizationId: primaryOrganizationId,
      personId: ownerPersonId,
      userId: ownerUserId,
    });
    const primaryShopId = await createScenarioShop(ctx, {
      organizationId: primaryOrganizationId,
      name: primaryShopName,
      managerUserId: ownerUserId,
    });
    const secondaryShopId = await createScenarioShop(ctx, {
      organizationId: primaryOrganizationId,
      name: secondaryShopName,
      managerUserId: ownerUserId,
    });
    await createComplimentaryBusinessEntitlement(ctx, primaryOrganizationId);
    const actorBPersonId = await createScenarioPerson(ctx, {
      organizationId: primaryOrganizationId,
      name: actorBName,
      email: args.actorBManagerEmail,
    });
    const actorBPrimaryStaffId = await ctx.db.insert("staffs", {
      organizationId: primaryOrganizationId,
      organizationPersonId: actorBPersonId,
      shopId: primaryShopId,
      name: actorBName,
      email: normalizeScenarioEmail(args.actorBManagerEmail),
      emailNormalized: normalizeScenarioEmail(args.actorBManagerEmail),
      isDeleted: false,
    });

    const alternateOrganizationName = args.alternateOrganizationName ?? "E2E 管理者B別グループ";
    const alternateShopName = args.alternateShopName ?? "E2E 管理者B別店舗";
    const alternateOrganizationId = await createScenarioOrganization(ctx, {
      createdByUserId: ownerUserId,
      name: alternateOrganizationName,
      billingEmail: args.actorBManagerEmail,
    });
    const actorBAlternatePersonId = await createScenarioPerson(ctx, {
      organizationId: alternateOrganizationId,
      userId: actorBUserId,
      name: actorBName,
      email: args.actorBManagerEmail,
    });
    const actorBAlternateMemberId = await createScenarioMember(ctx, {
      organizationId: alternateOrganizationId,
      personId: actorBAlternatePersonId,
      userId: actorBUserId,
    });
    const alternateShopId = await createScenarioShop(ctx, {
      organizationId: alternateOrganizationId,
      name: alternateShopName,
      managerUserId: actorBUserId,
    });
    await createComplimentaryBusinessEntitlement(ctx, alternateOrganizationId);

    return {
      ownerUserId,
      actorBUserId,
      actorCUserId,
      primaryOrganizationId,
      ownerPersonId,
      ownerMemberId,
      primaryShopId,
      secondaryShopId,
      actorBPersonId,
      actorBPrimaryStaffId,
      alternateOrganizationId,
      alternateShopId,
      actorBAlternatePersonId,
      actorBAlternateMemberId,
      organizationName,
      primaryShopName,
      secondaryShopName,
      actorBName,
      actorCName,
      alternateOrganizationName,
      alternateShopName,
    };
  },
});

/** Free管理者交代と複数グループ切替で共有する、actor単位で回収可能なE2E前提を作る。 */
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

    // 両グループをAのcreatedByUserId配下へ置くことで、既存のactor単位resetだけで安全に回収する。
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
      managerUserId: actorAUserId,
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
      managerUserId: actorAUserId,
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

export const resetMultiActorOrganizationScenarioData = internalMutation({
  args: {
    ownerManagerAuthTokenIdentifier: v.string(),
    actorBManagerAuthTokenIdentifier: v.string(),
    actorCManagerAuthTokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    await resetManagerScenarioDataForAuth(ctx, args.ownerManagerAuthTokenIdentifier);
    await deleteScenarioUsersByAuthTokenIdentifiers(ctx, [
      args.actorBManagerAuthTokenIdentifier,
      args.actorCManagerAuthTokenIdentifier,
    ]);
    return { reset: true };
  },
});

async function createStaff(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    name: string;
    email: string;
    lineUserId?: string;
    lineFollowing?: boolean;
    legalConsentState?: LegalConsentState;
  },
) {
  const staffId = await ctx.db.insert("staffs", {
    shopId: args.shopId,
    name: args.name,
    email: args.email,
    emailNormalized: args.email.trim().toLowerCase(),
    isDeleted: false,
  });
  if (args.lineUserId) {
    await upsertStaffLineAccount(ctx, {
      staffId,
      shopId: args.shopId,
      lineUserId: args.lineUserId,
      following: args.lineFollowing ?? false,
    });
  }
  await seedLegalConsentState(ctx, {
    audience: "staff",
    state: args.legalConsentState,
    shopId: args.shopId,
    staffId,
  });
  return staffId;
}

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

async function createMagicLink(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    recruitmentId: Id<"recruitments">;
    accessKind: MagicLinkPurpose;
    expiresAt?: number;
  },
) {
  const token = generateUUID();
  const recruitment = await ctx.db.get(args.recruitmentId);
  await ctx.db.insert("magicLinks", {
    token,
    staffId: args.staffId,
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    accessKind: args.accessKind,
    expiresAt:
      args.expiresAt ??
      (args.accessKind === "submit" && recruitment
        ? getSubmitLinkCutoff(recruitment.periodStart)
        : Date.now() + MAGIC_LINK_DEFAULT_TTL_MS),
  });
  return token;
}

async function createFailedRecruitmentNotification(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    recruitmentId: Id<"recruitments">;
    staffId: Id<"staffs">;
    email: string;
  },
) {
  const now = Date.now();
  const dedupeKey = `email:recruitment:${args.recruitmentId}:${args.staffId}:e2e-failed`;
  const notificationContext = "notification.sendRecruitmentNotificationEmails";
  const outboxId = await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "failed",
    dedupeKey,
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    payload: {
      kind: "email",
      from: "e2e@shiftori.invalid",
      to: args.email,
      subject: "E2E notification failure fixture",
      html: "<p>E2E notification failure fixture</p>",
      context: notificationContext,
      suppressDelivery: true,
    },
    attemptCount: 3,
    nextRunAt: now,
    lastError: E2E_SIMULATED_NOTIFICATION_FAILURE,
    failedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: `outbox:${outboxId}`,
    sourceType: "outbox",
    status: "open",
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    outboxId,
    channel: "email",
    dedupeKey,
    notificationContext,
    firstFailedAt: now,
    lastFailedAt: now,
    attemptCount: 3,
    lastError: E2E_SIMULATED_NOTIFICATION_FAILURE,
    createdAt: now,
    updatedAt: now,
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
export const clearAllTables = internalMutation(async ({ db }) => {
  assertE2EHelpersEnabled();

  for (const tableName of TABLE_NAMES) {
    const docs = await db.query(tableName).collect();
    for (const doc of docs) {
      await db.delete(doc._id);
    }
  }
  return { cleared: TABLE_NAMES };
});

/**
 * E2Eテスト用：最新shop/staffs/recruitmentのIDを取得し、shiftAssignmentsを一括挿入
 * getTestIds + seedAssignments を1関数に統合してCLI round-tripを削減
 */
export const seedShiftData = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.optional(v.string()),
    staffAssignments: v.array(
      v.object({
        staffName: v.string(),
        shifts: v.array(
          v.object({
            dateIndex: v.number(),
            startTime: v.string(),
            endTime: v.string(),
          }),
        ),
      }),
    ),
    dates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const shop = args.managerAuthTokenIdentifier
      ? await findManagerShopByAuthTokenIdentifier(ctx, args.managerAuthTokenIdentifier)
      : await ctx.db.query("shops").order("desc").first();
    if (!shop) throw new Error("No shop found");

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .collect();
    const activeStaffs = staffs.filter((s) => !s.isDeleted);

    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .take(1);
    const recruitment = recruitments[0];
    if (!recruitment) throw new Error("No recruitment found");
    const positionId = await ensureDefaultPosition(ctx, shop._id);

    let inserted = 0;
    for (const sa of args.staffAssignments) {
      const staff = activeStaffs.find((s) => s.name === sa.staffName);
      if (!staff) throw new Error(`Staff not found: ${sa.staffName}`);

      for (const shift of sa.shifts) {
        await ctx.db.insert("shiftAssignments", {
          recruitmentId: recruitment._id,
          staffId: staff._id,
          date: args.dates[shift.dateIndex],
          startTime: shift.startTime,
          endTime: shift.endTime,
          positionId,
        });
        inserted++;
      }
    }

    return { inserted };
  },
});

/**
 * E2Eテスト用：ページネーション検証データをセットアップ
 * completeSetup でshop/user作成済み前提。staffs 12人 + recruitments 8件を投入
 */
export const seedPaginationTestData = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertE2EHelpersEnabled();

    const shop = await ctx.db.query("shops").order("desc").first();
    if (!shop) throw new Error("No shop found. Run completeSetup first.");

    // スタッフ12人を追加
    for (let i = 1; i <= 12; i++) {
      await ctx.db.insert("staffs", {
        shopId: shop._id,
        name: `スタッフ${String(i).padStart(2, "0")}`,
        email: `staff${i}@example.com`,
        isDeleted: false,
      });
    }

    // シフト募集8件を作成（1週間ずつずらす）
    const baseDate = new Date("2026-05-04"); // 日曜始まり
    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const deadline = new Date(start);
      deadline.setDate(deadline.getDate() - 1);

      await ctx.db.insert("recruitments", {
        shopId: shop._id,
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        deadline: deadline.toISOString().slice(0, 10),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: shop.submissionPattern,
      });
    }

    return { staffsInserted: 12, recruitmentsInserted: 8 };
  },
});

/**
 * 探索的テスト用：最新shop/recruitmentにスタッフ15人と現実的な希望シフトを投入
 */
export const seedRealisticStaffRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertE2EHelpersEnabled();

    const shop = await ctx.db.query("shops").order("desc").first();
    if (!shop) throw new Error("No shop found");

    const recruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .first();
    if (!recruitment) throw new Error("No recruitment found");

    const start = new Date(recruitment.periodStart);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const isWeekend = (i: number) => {
      const dow = new Date(dates[i]).getDay();
      return dow === 0 || dow === 6;
    };

    type Pattern = {
      name: string;
      email: string;
      mode: "requests" | "allOff" | "unsubmitted";
      pick: (i: number) => { startTime: string; endTime: string } | null;
    };
    const patterns: Pattern[] = [
      {
        name: "田中 健太",
        email: "tanaka.kenta@example.com",
        mode: "requests",
        pick: (i) =>
          isWeekend(i) ? { startTime: "17:00", endTime: "25:00" } : { startTime: "19:00", endTime: "23:00" },
      },
      {
        name: "佐藤 美咲",
        email: "sato.misaki@example.com",
        mode: "requests",
        pick: (i) => (i === 3 ? null : { startTime: "17:00", endTime: "24:00" }),
      },
      {
        name: "鈴木 翔太",
        email: "suzuki.shota@example.com",
        mode: "requests",
        pick: (i) => ([1, 3, 4].includes(i) ? { startTime: "18:00", endTime: "23:00" } : null),
      },
      {
        name: "高橋 由美",
        email: "takahashi.yumi@example.com",
        mode: "requests",
        pick: (i) => ([4, 5].includes(i) ? { startTime: "17:00", endTime: "22:00" } : null),
      },
      {
        name: "伊藤 直樹",
        email: "ito.naoki@example.com",
        mode: "requests",
        pick: (i) => (isWeekend(i) ? { startTime: "17:00", endTime: "21:00" } : null),
      },
      {
        name: "渡辺 彩香",
        email: "watanabe.ayaka@example.com",
        mode: "requests",
        pick: (i) => ([0, 2, 5].includes(i) ? { startTime: "18:30", endTime: "23:00" } : null),
      },
      {
        name: "山本 隆",
        email: "yamamoto.takashi@example.com",
        mode: "requests",
        pick: (i) => (i === 2 ? null : { startTime: "17:00", endTime: "25:00" }),
      },
      {
        name: "中村 愛",
        email: "nakamura.ai@example.com",
        mode: "unsubmitted",
        pick: () => null,
      },
      {
        name: "小林 陽介",
        email: "kobayashi.yosuke@example.com",
        mode: "requests",
        pick: (i) => (isWeekend(i) ? { startTime: "17:00", endTime: "24:00" } : null),
      },
      {
        name: "加藤 真理",
        email: "kato.mari@example.com",
        mode: "requests",
        pick: (i) => (!isWeekend(i) ? { startTime: "18:00", endTime: "22:00" } : null),
      },
      {
        name: "吉田 亮",
        email: "yoshida.ryo@example.com",
        mode: "requests",
        pick: (i) => (i === 6 ? null : { startTime: "17:00", endTime: "24:30" }),
      },
      {
        name: "山田 美穂",
        email: "yamada.miho@example.com",
        mode: "requests",
        pick: (i) => ([0, 2, 4].includes(i) ? { startTime: "18:00", endTime: "23:00" } : null),
      },
      {
        name: "佐々木 翔",
        email: "sasaki.sho@example.com",
        mode: "requests",
        pick: (i) => ([1, 4, 5, 6].includes(i) ? { startTime: "17:30", endTime: "22:30" } : null),
      },
      {
        name: "松本 涼子",
        email: "matsumoto.ryoko@example.com",
        mode: "allOff",
        pick: () => null,
      },
      {
        name: "井上 大樹",
        email: "inoue.daiki@example.com",
        mode: "requests",
        pick: (i) => ([2, 5].includes(i) ? { startTime: "19:00", endTime: "23:00" } : null),
      },
    ];

    let staffInserted = 0;
    let requestsInserted = 0;
    let submissionsInserted = 0;

    for (const p of patterns) {
      const staffId = await ctx.db.insert("staffs", {
        shopId: shop._id,
        name: p.name,
        email: p.email,
        isDeleted: false,
      });
      staffInserted++;

      if (p.mode === "unsubmitted") continue;

      const slotPayloads = [];
      for (let i = 0; i < 7; i++) {
        const slot = p.pick(i);
        if (!slot) continue;
        slotPayloads.push({
          date: dates[i],
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        requestsInserted++;
      }

      const submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId: recruitment._id,
        staffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      await Promise.all(
        slotPayloads.map((slot) =>
          ctx.db.insert("shiftSubmissionSlots", {
            submissionId,
            recruitmentId: recruitment._id,
            staffId,
            ...slot,
          }),
        ),
      );
      submissionsInserted++;
    }

    return { staffInserted, requestsInserted, submissionsInserted, dates };
  },
});

/**
 * 探索的テスト用：シフト提出画面のテストデータを一括セットアップ
 * shop + staff + recruitment + magicLink + session を作成し、sessionTokenを返す
 */
export const seedSubmitTestData = internalMutation({
  args: {
    deadlinePassed: v.optional(v.boolean()),
    hasExistingSubmission: v.optional(v.boolean()),
    legalConsentState: v.optional(legalConsentStateValidator),
    shopClosedDates: v.optional(v.array(v.string())),
    submissionPattern: v.optional(submissionPatternValidator),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const submissionPattern = normalizeSubmissionPattern(args.submissionPattern);
    const periodStart = "2037-04-07";
    const periodEnd = "2037-04-13";
    const deadline = args.deadlinePassed ? "2026-01-01" : "2037-04-06";

    const shopId = await ctx.db.insert("shops", {
      name: "テスト居酒屋さくら",
      submissionPattern,
      regularClosedDays: [],
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "田中太郎",
      email: "tanaka@example.com",
      isDeleted: false,
    });
    await seedLegalConsentState(ctx, {
      audience: "staff",
      state: args.legalConsentState,
      shopId,
      staffId,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart,
      periodEnd,
      deadline,
      shopClosedDates: args.shopClosedDates ?? [],
      status: "open",
      isDeleted: false,
      submissionPattern,
    });

    // magic link token
    const token = generateUUID();
    await ctx.db.insert("magicLinks", {
      token,
      staffId,
      shopId,
      recruitmentId,
      accessKind: "submit",
      expiresAt: getSubmitLinkCutoff(periodStart),
    });

    // 既存提出がある場合
    if (args.hasExistingSubmission) {
      const submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      await Promise.all([
        ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId,
          staffId,
          date: "2037-04-07",
          startTime: "09:00",
          endTime: "18:00",
        }),
        ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId,
          staffId,
          date: "2037-04-09",
          startTime: "10:00",
          endTime: "15:00",
        }),
      ]);
    }

    return { token, shopId, staffId, recruitmentId };
  },
});

export const seedDashboardPaginationScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    firstPeriodStart: v.string(),
  },
  handler: async (ctx, args) => {
    const { shopId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "ページネーションテスト店舗",
    });

    for (let i = 1; i <= 12; i++) {
      await createStaff(ctx, {
        shopId,
        name: `スタッフ${String(i).padStart(2, "0")}`,
        email: `staff${i}@example.com`,
      });
    }

    // 8件を翌月1〜28日に収めつつ、同一期間にならないよう開始日を1日ずつずらす。
    for (let i = 0; i < 8; i++) {
      const periodStart = addDays(args.firstPeriodStart, i);

      await ctx.db.insert("recruitments", {
        shopId,
        periodStart,
        periodEnd: addDays(periodStart, 20),
        deadline: addDays(periodStart, -1),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    }

    return { shopId, staffsInserted: 12, recruitmentsInserted: 8 };
  },
});

export const seedStaffRegistrationReviewScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    shopName: v.optional(v.string()),
    existingStaff: v.optional(staffRegistrationReviewSeedEntryValidator),
    pendingRequest: v.optional(staffRegistrationReviewSeedEntryValidator),
    openRecruitmentDates: v.optional(scenarioDatesValidator),
  },
  handler: async (ctx, args) => {
    const { shopId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: args.shopName ?? "スタッフ参加申請E2E店舗",
    });
    const registrationToken = generateUUID();
    await ctx.db.insert("shopRegistrationLinks", {
      shopId,
      token: registrationToken,
      createdAt: Date.now(),
    });

    if (args.existingStaff) {
      await ctx.db.insert("staffs", {
        shopId,
        name: args.existingStaff.name,
        email: args.existingStaff.email,
        emailNormalized: args.existingStaff.email.trim().toLowerCase(),
        isDeleted: false,
      });
    }

    if (args.pendingRequest) {
      const versions = getLegalConsentVersions("staff");
      const now = Date.now();
      await ctx.db.insert("staffRegistrationRequests", {
        shopId,
        name: args.pendingRequest.name,
        email: args.pendingRequest.email.trim().toLowerCase(),
        emailNormalized: args.pendingRequest.email.trim().toLowerCase(),
        status: "pending",
        ...versions,
        consentedAt: now,
        createdAt: now,
      });
    }

    const recruitmentId = args.openRecruitmentDates
      ? await createRecruitment(ctx, { shopId, dates: args.openRecruitmentDates, status: "open" })
      : undefined;

    return { shopId, registrationToken, ...(recruitmentId ? { recruitmentId } : {}) };
  },
});

export const seedLegalManagerConsentScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    legalConsentState: legalConsentStateValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, userId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "法務同意テスト店舗",
      managerLegalConsentState: args.legalConsentState,
    });
    return { shopId, userId };
  },
});

export const seedLegalStaffConsentPageScenario = internalMutation({
  args: {
    legalConsentState: v.optional(legalConsentStateValidator),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const shopId = await ctx.db.insert("shops", {
      name: "法務同意テスト店舗",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      regularClosedDays: [],
      isDeleted: false,
    });
    const staffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      legalConsentState: args.legalConsentState ?? "missing",
    });
    const token = generateUUID();
    const expiresAt = Date.now() + LEGAL_CONSENT_TOKEN_TTL_MS;
    await ctx.db.insert("legalConsentTokens", {
      staffId,
      shopId,
      token,
      method: "staff_email_link",
      expiresAt,
    });
    return { token, shopId, staffId, expiresAt };
  },
});

export const seedLegalStaffSubmitScenario = internalMutation({
  args: {
    legalConsentState: legalConsentStateValidator,
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const shopId = await ctx.db.insert("shops", {
      name: "法務同意テスト店舗",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      regularClosedDays: [],
      isDeleted: false,
    });
    const staffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      legalConsentState: args.legalConsentState,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2037-04-07",
      periodEnd: "2037-04-13",
      deadline: "2037-04-06",
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const token = await createMagicLink(ctx, { staffId, shopId, recruitmentId, accessKind: "submit" });
    return { token, shopId, staffId, recruitmentId };
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

export const seedNotificationReminderScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
    remindedStaffLineState: v.optional(lineDeliveryStateValidator),
    managerLineState: v.optional(lineDeliveryStateValidator),
    managerIsReminderTarget: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "通知催促テスト店舗",
    });
    const remindedStaffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      lineUserId: args.remindedStaffLineState ? "U_e2e_reminded_staff" : undefined,
      lineFollowing: args.remindedStaffLineState === "following",
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

    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId,
      staffId: args.managerIsReminderTarget ? remindedStaffId : managerStaffId,
      firstSubmittedAt: Date.now(),
      submittedAt: Date.now(),
    });
    await ctx.db.insert("shiftSubmissionSlots", {
      submissionId,
      recruitmentId,
      staffId: args.managerIsReminderTarget ? remindedStaffId : managerStaffId,
      date: args.dates.dates[0],
      startTime: "09:00",
      endTime: "18:00",
    });
    return { shopId, recruitmentId, managerStaffId, remindedStaffId };
  },
});

export const triggerNotificationReminderScenario = internalMutation({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    assertE2EHelpersEnabled();
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") {
      throw new Error("Open recruitment not found");
    }
    await ctx.scheduler.runAfter(0, internal.notification.reminderActions.sendReminderEmails, { recruitmentId });
    return { scheduled: true };
  },
});

export const seedNotificationConfirmationViewScenario = internalMutation({
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
      shopName: "確定シフト閲覧テスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });
    const positionId = await ensureDefaultPosition(ctx, shopId);
    await setStaffLineDeliveryState(ctx, {
      staffId: managerStaffId,
      shopId,
      state: args.managerLineState,
    });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId: managerStaffId,
      date: args.dates.dates[0],
      startTime: "10:00",
      endTime: "18:00",
      positionId,
    });
    // 確定・通知action・view token発行はブラウザ操作から通す。
    return { shopId, recruitmentId, staffId: managerStaffId };
  },
});

export const seedNotificationFailureRecoveryScenario = internalMutation({
  args: {
    managerAuthTokenIdentifier: v.string(),
    managerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createManagerScenario(ctx, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
      managerEmail: args.managerEmail,
      shopName: "通知不達テスト店舗",
    });
    const secondStaffEmail = "notification-failure-staff@example.com";
    const secondStaffId = await createStaff(ctx, {
      shopId,
      name: "通知不達スタッフ",
      email: secondStaffEmail,
    });
    const thirdStaffEmail = "notification-failure-third-staff@example.com";
    const thirdStaffId = await createStaff(ctx, {
      shopId,
      name: "通知不達スタッフ2",
      email: thirdStaffEmail,
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });

    await createFailedRecruitmentNotification(ctx, {
      shopId,
      recruitmentId,
      staffId: managerStaffId,
      email: normalizeScenarioEmail(args.managerEmail ?? DEFAULT_MANAGER.email),
    });
    await createFailedRecruitmentNotification(ctx, {
      shopId,
      recruitmentId,
      staffId: secondStaffId,
      email: secondStaffEmail,
    });
    await createFailedRecruitmentNotification(ctx, {
      shopId,
      recruitmentId,
      staffId: thirdStaffId,
      email: thirdStaffEmail,
    });

    return { shopId, recruitmentId };
  },
});

export const seedCurrentShiftManualNotificationScenario = internalMutation({
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
      shopName: "現在シフト手動通知テスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "confirmed" });
    const positionId = await ensureDefaultPosition(ctx, shopId);
    await setStaffLineDeliveryState(ctx, {
      staffId: managerStaffId,
      shopId,
      state: args.managerLineState,
    });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId: managerStaffId,
      date: args.dates.dates[0],
      startTime: "10:00",
      endTime: "18:00",
      positionId,
    });

    return { shopId, recruitmentId };
  },
});

export const seedNotificationManagerDigestScenario = internalMutation({
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
      shopName: "管理者通知ダイジェストテスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });
    await setStaffLineDeliveryState(ctx, {
      staffId: managerStaffId,
      shopId,
      state: args.managerLineState,
    });
    const versions = getLegalConsentVersions("staff");
    const now = Date.now();
    await ctx.db.insert("staffRegistrationRequests", {
      shopId,
      name: "承認待ちスタッフ",
      email: "pending-digest@example.com",
      emailNormalized: "pending-digest@example.com",
      status: "pending",
      ...versions,
      consentedAt: now,
      createdAt: now,
    });
    await createFailedRecruitmentNotification(ctx, {
      shopId,
      recruitmentId,
      staffId: managerStaffId,
      email: normalizeScenarioEmail(args.managerEmail ?? DEFAULT_MANAGER.email),
    });

    return { shopId, recruitmentId };
  },
});

export const triggerNotificationManagerDigestScenario = internalMutation({
  args: {
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { shopId, recruitmentId }) => {
    assertE2EHelpersEnabled();
    const [shop, recruitment] = await Promise.all([ctx.db.get(shopId), ctx.db.get(recruitmentId)]);
    if (!shop || shop.isDeleted || !recruitment || recruitment.isDeleted || recruitment.shopId !== shopId) {
      throw new Error("Notification digest scenario not found");
    }

    await Promise.all([
      ctx.scheduler.runAfter(0, internal.staffRegistration.actions.sendOwnerDailyDigest, { shopId }),
      ctx.scheduler.runAfter(0, internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder, {
        recruitmentId,
      }),
      ctx.scheduler.runAfter(0, sendShopActivationReminderRef, { shopId }),
      ctx.scheduler.runAfter(0, internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest, {
        shopId,
      }),
    ]);
    return { scheduledPurposeCount: 4 };
  },
});

/** 複数管理者E2Eで代表のスタッフ登録digestだけを対象店舗へ起動する。 */
export const triggerStaffRegistrationManagerDigestScenario = internalMutation({
  args: {
    shopId: v.id("shops"),
  },
  handler: async (ctx, { shopId }) => {
    assertE2EHelpersEnabled();
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted || !shop.organizationId) {
      throw new Error("Staff registration manager digest scenario not found");
    }

    await ctx.scheduler.runAfter(0, internal.staffRegistration.actions.sendOwnerDailyDigest, { shopId });
    return { scheduledPurposeCount: 1 };
  },
});

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
 * E2E限定の通知受付probe。
 * 宛先・本文・token・provider errorは返さず、通知経路の結合確認に必要な状態だけ返す。
 */
export const getNotificationProbe = internalQuery({
  args: notificationProbeArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = args.staffEmail ? await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId) : null;
    if (args.staffEmail && !staff) {
      return { outbox: [], failureInbox: [], duplicateDedupeKeyCount: 0 };
    }

    const outboxStatuses: NotificationOutboxStatus[] = ["pending", "processing", "sent", "failed"];
    const outboxPages = await Promise.all(
      outboxStatuses.map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", args.shopId).eq("status", status))
          .order("desc")
          .take(50),
      ),
    );
    const matchingOutbox = outboxPages
      .flat()
      .filter((job) => !args.recruitmentId || job.recruitmentId === args.recruitmentId)
      .filter((job) => !staff || job.staffId === staff._id)
      .filter((job) => !args.channel || job.channel === args.channel)
      .filter((job) => !args.notificationContext || notificationContextForProbe(job) === args.notificationContext)
      .sort((left, right) => right.createdAt - left.createdAt);
    const dedupeCounts = new Map<string, number>();
    for (const job of matchingOutbox) dedupeCounts.set(job.dedupeKey, (dedupeCounts.get(job.dedupeKey) ?? 0) + 1);
    const duplicateDedupeKeyCount = [...dedupeCounts.values()].filter((count) => count > 1).length;
    const outbox = await Promise.all(
      matchingOutbox.map(async (job) => ({
        channel: job.channel,
        status: job.status,
        notificationContext: notificationContextForProbe(job),
        attemptCount: job.attemptCount,
        deliverySuppressed: isNotificationDeliverySuppressed({ suppressDelivery: job.payload.suppressDelivery }),
        hasRecruitmentTarget: job.recruitmentId !== undefined,
        hasStaffTarget: job.staffId !== undefined,
        hasUserTarget: job.userId !== undefined,
        recipientUserFingerprint: job.userId ? `sha256:${await digestInvitationToken(job.userId)}` : null,
        isResend: job.dedupeKey.includes(":resend:"),
        ...(await notificationCtaProbe(ctx, job)),
      })),
    );

    const failureStatuses: NotificationFailureInboxStatus[] = ["open", "retrying", "resolved"];
    const failurePages = await Promise.all(
      failureStatuses.map((status) =>
        ctx.db
          .query("notificationFailureInbox")
          .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", args.shopId).eq("status", status))
          .order("desc")
          .take(50),
      ),
    );
    const failureInbox = failurePages
      .flat()
      .filter((failure) => !args.recruitmentId || failure.recruitmentId === args.recruitmentId)
      .filter((failure) => !staff || failure.staffId === staff._id)
      .filter((failure) => !args.channel || failure.channel === args.channel)
      .filter((failure) => !args.notificationContext || failure.notificationContext === args.notificationContext)
      .sort((left, right) => right.lastFailedAt - left.lastFailedAt)
      .map((failure) => ({
        channel: failure.channel ?? null,
        status: failure.status,
        sourceType: failure.sourceType,
        notificationContext: failure.notificationContext,
      }));

    return { outbox, failureInbox, duplicateDedupeKeyCount };
  },
});

/** E2E限定のorganization-scope通知probe。宛先、本文、token、provider errorは返さない。 */
export const getOrganizationNotificationProbe = internalQuery({
  args: organizationNotificationProbeArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const outboxPages = await Promise.all(
      ALL_NOTIFICATION_OUTBOX_STATUSES.map((status) =>
        ctx.db
          .query("notificationOutbox")
          .withIndex("by_organizationId_status", (q) =>
            q.eq("organizationId", args.organizationId).eq("status", status),
          )
          .order("desc")
          .take(50),
      ),
    );
    const matchingOutbox = outboxPages
      .flat()
      .filter((job) => !args.organizationInvitationId || job.organizationInvitationId === args.organizationInvitationId)
      .filter((job) => !args.channel || job.channel === args.channel)
      .filter((job) => !args.notificationContext || notificationContextForProbe(job) === args.notificationContext)
      .sort((left, right) => right.createdAt - left.createdAt);
    const dedupeCounts = new Map<string, number>();
    for (const job of matchingOutbox) {
      dedupeCounts.set(job.dedupeKey, (dedupeCounts.get(job.dedupeKey) ?? 0) + 1);
    }
    const duplicateDedupeKeyCount = [...dedupeCounts.values()].filter((count) => count > 1).length;
    const outbox = await Promise.all(
      matchingOutbox.map(async (job) => {
        const invitation = job.organizationInvitationId ? await ctx.db.get(job.organizationInvitationId) : null;
        const invitationVersionMatchesTarget = job.organizationInvitationId
          ? Boolean(
              invitation &&
                invitation.organizationId === args.organizationId &&
                invitation.version === job.organizationInvitationVersion,
            )
          : null;
        return {
          organizationId: args.organizationId,
          organizationInvitationId: job.organizationInvitationId ?? null,
          purpose: job.purpose ?? null,
          channel: job.channel,
          status: job.status,
          notificationContext: notificationContextForProbe(job),
          // 将来dedupe構成へ宛先が混ざってもprobeからPIIが漏れないよう、同一性だけを返す。
          dedupeKey: `sha256:${await digestInvitationToken(job.dedupeKey)}`,
          attemptCount: job.attemptCount,
          deliverySuppressed: isNotificationDeliverySuppressed({
            suppressDelivery: job.payload.suppressDelivery,
          }),
          recipientUserFingerprint: job.userId ? `sha256:${await digestInvitationToken(job.userId)}` : null,
          invitationVersionMatchesTarget,
          ...(await notificationCtaProbe(ctx, job, args.expectedShopId)),
        };
      }),
    );
    return { outbox, duplicateDedupeKeyCount };
  },
});

/** bearer tokenを必要とする招待E2Eだけが使う専用probe。通常通知probeとは型とsymbolを分ける。 */
export const getManagerInvitationTokenProbe = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.id("organizationInvitations"),
  },
  handler: async (ctx, { organizationId, invitationId }) => {
    assertE2EHelpersEnabled();
    const invitation = await ctx.db.get(invitationId);
    const empty = {
      token: null,
      invitationId: null,
      version: null,
      status: null,
      expiresAt: null,
    };
    if (!invitation || invitation.organizationId !== organizationId) return empty;

    const token = await deriveInvitationToken({
      invitationId,
      version: invitation.version,
      signingSecret: getOrganizationInvitationSigningSecret(),
    });
    if ((await digestInvitationToken(token)) !== invitation.tokenDigest) return empty;
    return {
      token,
      invitationId,
      version: invitation.version,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  },
});

/** E2E起動前にhelperと通知dry-runの安全条件を確認する。 */
export const getE2ESafetyState = internalQuery({
  args: {},
  handler: async () => {
    assertE2EHelpersEnabled();
    let organizationInvitationSigningSecretConfigured = false;
    try {
      getOrganizationInvitationSigningSecret();
      organizationInvitationSigningSecretConfigured = true;
    } catch {
      // 秘密値そのものや設定エラー詳細はpreflightへ返さない。
    }
    return {
      helpersEnabled: true,
      notificationDeliverySuppressed: isNotificationDeliverySuppressed(),
      organizationInvitationSigningSecretConfigured,
    };
  },
});

/** Full Regression終了時に、E2E管理店舗の未解決通知とactive outbox重複を監査する。 */
export const getE2EBackendAudit = internalQuery({
  args: { managerEmails: v.array(v.string()) },
  handler: async (ctx, { managerEmails }) => {
    assertE2EHelpersEnabled();
    const normalizedEmails = new Set(managerEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
    const users = await ctx.db.query("users").collect();
    const e2eUsers = users.filter(
      (user) => !user.isDeleted && normalizedEmails.has((user.emailNormalized ?? user.email).trim().toLowerCase()),
    );
    const matchedManagerEmails = new Set(
      e2eUsers.map((user) => (user.emailNormalized ?? user.email).trim().toLowerCase()),
    );
    const managerEmailsWithShop = new Set<string>();
    const e2eShopIds = new Set<Id<"shops">>();
    const e2eOrganizationIds = new Set<Id<"organizations">>();
    for (const user of e2eUsers) {
      const memberships = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
        .collect();
      for (const membership of memberships) {
        const shop = await ctx.db.get(membership.shopId);
        if (!shop || shop.isDeleted) continue;
        e2eShopIds.add(membership.shopId);
        if (shop.organizationId) e2eOrganizationIds.add(shop.organizationId);
        managerEmailsWithShop.add((user.emailNormalized ?? user.email).trim().toLowerCase());
      }
    }
    const missingManagerEmailCount = [...normalizedEmails].filter((email) => !matchedManagerEmails.has(email)).length;
    const managerEmailWithoutShopCount = [...matchedManagerEmails].filter(
      (email) => !managerEmailsWithShop.has(email),
    ).length;

    const unresolvedPages = await Promise.all(
      (["open", "retrying"] as const).map((status) =>
        ctx.db
          .query("notificationFailureInbox")
          .withIndex("by_status_lastFailedAt", (q) => q.eq("status", status))
          .collect(),
      ),
    );
    const unexpectedContexts: string[] = [];
    for (const failure of unresolvedPages.flat()) {
      if (e2eShopIds.has(failure.shopId)) unexpectedContexts.push(failure.notificationContext);
    }

    const activeOutboxPages = await Promise.all([
      ...[...e2eShopIds].flatMap((shopId) =>
        (["pending", "processing"] as const).map((status) =>
          ctx.db
            .query("notificationOutbox")
            .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", status))
            .collect(),
        ),
      ),
      ...[...e2eOrganizationIds].flatMap((organizationId) =>
        (["pending", "processing"] as const).map((status) =>
          ctx.db
            .query("notificationOutbox")
            .withIndex("by_organizationId_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
            .collect(),
        ),
      ),
    ]);
    const activeOutbox = new Map(activeOutboxPages.flat().map((job) => [job._id, job]));
    const activeDedupeCounts = new Map<string, number>();
    for (const job of activeOutbox.values()) {
      activeDedupeCounts.set(job.dedupeKey, (activeDedupeCounts.get(job.dedupeKey) ?? 0) + 1);
    }
    const duplicateActiveDedupeKeyCount = [...activeDedupeCounts.values()].filter((count) => count > 1).length;

    return {
      requestedManagerEmailCount: normalizedEmails.size,
      matchedManagerEmailCount: matchedManagerEmails.size,
      missingManagerEmailCount,
      managerEmailWithoutShopCount,
      auditedShopCount: e2eShopIds.size,
      auditedOrganizationCount: e2eOrganizationIds.size,
      unexpectedUnresolvedFailureInboxCount: unexpectedContexts.length,
      duplicateActiveDedupeKeyCount,
      notificationContexts: [...new Set(unexpectedContexts)].sort(),
    };
  },
});

/** manager digestの前提として作った失敗だけを、シナリオ完了後に解決済みへ戻す。 */
export const resolveE2EFailureFixtures = internalMutation({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    assertE2EHelpersEnabled();
    const failures = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", "open"))
      .collect();
    const now = Date.now();
    let resolvedCount = 0;

    for (const failure of failures) {
      if (failure.lastError !== E2E_SIMULATED_NOTIFICATION_FAILURE) continue;
      await ctx.db.patch(failure._id, {
        status: "resolved",
        resolvedAt: now,
        resolutionKind: "sent",
        updatedAt: now,
      });
      resolvedCount += 1;
    }

    return { resolvedCount };
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

    const memberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(10);
    const managerMembership = memberships.find((membership) => membership.role === "manager");
    const manager = managerMembership ? await ctx.db.get(managerMembership.userId) : null;

    return {
      notificationDeliverySuppressed: isNotificationDeliverySuppressed() || isDryRunManagerEmail(manager?.email),
    };
  },
});

export const createMagicLinkTokenForLatestRecruitment = internalMutation({
  args: magicLinkLookupArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId);
    if (!staff) throw new Error(`Staff not found: ${args.staffEmail}`);

    const recruitment = await findRecruitmentForPurpose(ctx, staff, args.purpose, args.recruitmentId);
    if (!recruitment) throw new Error(`Recruitment not found for ${args.purpose}: ${args.staffEmail}`);

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

export const getLatestLineLinkToken = internalQuery({
  args: staffEmailScopeArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId);
    if (!staff) return { token: null };

    const links = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
      .order("desc")
      .take(10);
    const link = links[0];
    if (!link) return { token: null };

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    return {
      token: link.token,
      staffId: staff._id,
      expiresAt: link.expiresAt,
      usedAt: link.usedAt ?? null,
      authorizeUrl: channelId
        ? buildLineAuthorizeUrl({
            channelId,
            redirectUri: `${APP_URL}/line/callback`,
            state: link.token,
          })
        : null,
    };
  },
});

export const simulateLineFollowForStaff = internalMutation({
  args: staffEmailScopeArgs,
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail, args.shopId);
    if (!staff) throw new Error(`Staff not found: ${args.staffEmail}`);

    const account = await getStaffLineAccount(ctx, staff._id);
    if (!account?.lineUserId) throw new Error("LINE account must exist before simulating follow");
    const wasFollowing = Boolean(account?.following);
    if (!wasFollowing) {
      // production Webhookと同じmutationを通し、法務案内とopen募集案内の両方を検証する。
      await ctx.scheduler.runAfter(0, internal.line.mutations.markFollowing, {
        staffId: staff._id,
        following: true,
      });
    }

    return { scheduled: !wasFollowing };
  },
});
