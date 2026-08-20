import { v } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDevelopmentSeedEnabled } from "../_lib/config";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import schema from "../schema";
import { requireDevelopmentSeedWorkflowState } from "./audit";
import {
  assertSeedDate,
  buildDevelopmentSeedRecruitmentWindows,
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
  DEVELOPMENT_SEED_SCENARIOS,
  DEVELOPMENT_SEED_TABLE_COVERAGE,
  DEVELOPMENT_SEED_UNION_COVERAGE,
  PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER,
} from "./catalog";

const VERIFY_ROW_LIMIT = 512;

async function takeVerified<Table extends TableNames>(ctx: MutationCtx, table: Table): Promise<Doc<Table>[]> {
  const rows = await ctx.db.query(table).take(VERIFY_ROW_LIMIT + 1);
  if (rows.length > VERIFY_ROW_LIMIT) throw new Error(`Development seed verify limit exceeded: ${table}`);
  return rows;
}

function requireRecord<Table extends TableNames>(
  records: Map<Id<Table>, Doc<Table>>,
  id: Id<Table>,
  relation: string,
): Doc<Table> {
  const record = records.get(id);
  if (!record) throw new Error(`Development seed has a dangling ${relation}`);
  return record;
}

function assertExpectedOrganizationNames(organizations: Doc<"organizations">[]) {
  const actual = organizations.map((organization) => organization.name).sort();
  const expected = DEVELOPMENT_SEED_SCENARIOS.map((scenario) => scenario.organizationName).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Development seed organization scenarios are incomplete");
  }
}

async function assertRuntimeTableCoverage(ctx: MutationCtx, auditMarker: Doc<"rateLimits">) {
  for (const tableName of Object.keys(DEVELOPMENT_SEED_TABLE_COVERAGE) as TableNames[]) {
    const disposition = DEVELOPMENT_SEED_TABLE_COVERAGE[tableName];
    const rows = await ctx.db.query(tableName).take(tableName === "rateLimits" ? 2 : 1);
    if (tableName === "rateLimits") {
      if (rows.length !== 1 || rows[0]?._id !== auditMarker._id) {
        throw new Error("Development seed runtime audit table is invalid");
      }
    } else if (disposition.kind === "seeded") {
      if (rows.length === 0) throw new Error(`Development seed table is missing: ${tableName}`);
    } else if (rows.length > 0) {
      throw new Error(`Development seed table must be empty: ${tableName}`);
    }
  }
}

function assertRuntimeUnionCoverage(
  label: string,
  values: readonly string[],
  coverage: Record<string, { kind: "seeded" | "intentionallyEmpty" }>,
) {
  const actual = new Set(values);
  for (const [variant, disposition] of Object.entries(coverage)) {
    if (disposition.kind === "seeded" && !actual.has(variant)) {
      throw new Error(`Development seed union variant is missing: ${label}.${variant}`);
    }
    if (disposition.kind === "intentionallyEmpty" && actual.has(variant)) {
      throw new Error(`Development seed union variant must be empty: ${label}.${variant}`);
    }
  }
}

export const verify = internalMutation({
  args: { today: v.string(), auditToken: v.string() },
  returns: v.object({
    contractVersion: v.string(),
    contractFingerprint: v.string(),
    scenarioCount: v.number(),
    tableCount: v.number(),
    organizationCount: v.number(),
    shopCount: v.number(),
    staffCount: v.number(),
    recruitmentCount: v.number(),
    openFailureCount: v.number(),
    activeOutboxCount: v.number(),
    activeFanoutCount: v.number(),
    delayedDeadlineCount: v.number(),
    liveScheduledFunctionCount: v.number(),
  }),
  handler: async (ctx, { today, auditToken }) => {
    assertDevelopmentSeedEnabled();
    assertSeedDate(today);
    if (Object.keys(schema.tables).length !== DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT) {
      throw new Error("Development seed table catalog count is stale");
    }
    const { marker: auditMarker, state } = await requireDevelopmentSeedWorkflowState(
      ctx,
      auditToken,
      Object.keys(schema.tables).length,
      DEVELOPMENT_SEED_SCENARIO_KEYS.length,
    );
    if (state.phase !== "readyToVerify") {
      throw new Error("Development seed workflow is not ready for verification");
    }
    await assertRuntimeTableCoverage(ctx, auditMarker);
    const [
      users,
      organizations,
      organizationPeople,
      organizationMembers,
      billingStates,
      shops,
      staffs,
      positions,
      recruitments,
      submissions,
      submissionSlots,
      submissionDates,
      assignments,
      stats,
      orderStates,
      orderEntries,
      shopOrderEntries,
      fanouts,
      outboxes,
      delayedDeadlines,
      failures,
      registrationLinks,
      registrationRequests,
      announcements,
      confirmationSnapshots,
      lineProviderUsers,
      personLineLinks,
      staffLineAccounts,
      lineQuotaStatuses,
      notificationHistories,
      deliveryEvents,
    ] = await Promise.all([
      takeVerified(ctx, "users"),
      takeVerified(ctx, "organizations"),
      takeVerified(ctx, "organizationPeople"),
      takeVerified(ctx, "organizationMembers"),
      takeVerified(ctx, "organizationBillingStates"),
      takeVerified(ctx, "shops"),
      takeVerified(ctx, "staffs"),
      takeVerified(ctx, "positions"),
      takeVerified(ctx, "recruitments"),
      takeVerified(ctx, "shiftSubmissions"),
      takeVerified(ctx, "shiftSubmissionSlots"),
      takeVerified(ctx, "shiftSubmissionDates"),
      takeVerified(ctx, "shiftAssignments"),
      takeVerified(ctx, "recruitmentStats"),
      takeVerified(ctx, "organizationStaffOrderStates"),
      takeVerified(ctx, "organizationStaffOrderEntries"),
      takeVerified(ctx, "shopStaffOrderEntries"),
      takeVerified(ctx, "notificationFanoutOperations"),
      takeVerified(ctx, "notificationOutbox"),
      takeVerified(ctx, "notificationResendDelayedFailureDeadlines"),
      takeVerified(ctx, "notificationFailureInbox"),
      takeVerified(ctx, "shopRegistrationLinks"),
      takeVerified(ctx, "staffRegistrationRequests"),
      takeVerified(ctx, "dashboardAnnouncements"),
      takeVerified(ctx, "shiftConfirmationSnapshots"),
      takeVerified(ctx, "lineProviderUsers"),
      takeVerified(ctx, "organizationPersonLineLinks"),
      takeVerified(ctx, "staffLineAccounts"),
      takeVerified(ctx, "lineQuotaStatus"),
      takeVerified(ctx, "notificationHistory"),
      takeVerified(ctx, "notificationDeliveryEvents"),
    ]);

    assertRuntimeUnionCoverage(
      "submissionKind",
      recruitments.map((recruitment) => recruitment.submissionPattern.kind),
      DEVELOPMENT_SEED_UNION_COVERAGE.submissionKind,
    );
    assertRuntimeUnionCoverage(
      "billingKind",
      billingStates.map((billing) => billing.state.kind),
      DEVELOPMENT_SEED_UNION_COVERAGE.billingKind,
    );
    assertRuntimeUnionCoverage(
      "recruitmentStatus",
      recruitments.map((recruitment) => recruitment.status),
      DEVELOPMENT_SEED_UNION_COVERAGE.recruitmentStatus,
    );
    assertRuntimeUnionCoverage(
      "memberStatus",
      organizationMembers.map((member) => member.status),
      DEVELOPMENT_SEED_UNION_COVERAGE.memberStatus,
    );
    assertRuntimeUnionCoverage(
      "registrationStatus",
      registrationRequests.map((request) => request.status),
      DEVELOPMENT_SEED_UNION_COVERAGE.registrationStatus,
    );
    assertRuntimeUnionCoverage(
      "outboxStatus",
      outboxes.map((outbox) => outbox.status),
      DEVELOPMENT_SEED_UNION_COVERAGE.outboxStatus,
    );
    assertRuntimeUnionCoverage(
      "failureStatus",
      failures.map((failure) => failure.status),
      DEVELOPMENT_SEED_UNION_COVERAGE.failureStatus,
    );

    assertExpectedOrganizationNames(organizations);
    if (organizations.length !== DEVELOPMENT_SEED_SCENARIO_KEYS.length) {
      throw new Error("Development seed organization count is invalid");
    }
    const primaryUser = users.find((user) => user.authTokenIdentifier === PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER);
    if (!primaryUser) throw new Error("Development seed primary user is missing");

    const organizationMap = new Map(organizations.map((organization) => [organization._id, organization]));
    const personMap = new Map(organizationPeople.map((person) => [person._id, person]));
    const shopMap = new Map(shops.map((shop) => [shop._id, shop]));
    const staffMap = new Map(staffs.map((staff) => [staff._id, staff]));
    const positionMap = new Map(positions.map((position) => [position._id, position]));
    const recruitmentMap = new Map(recruitments.map((recruitment) => [recruitment._id, recruitment]));
    const submissionMap = new Map(submissions.map((submission) => [submission._id, submission]));
    const outboxMap = new Map(outboxes.map((outbox) => [outbox._id, outbox]));
    const lineProviderUserMap = new Map(lineProviderUsers.map((providerUser) => [providerUser._id, providerUser]));

    for (const organization of organizations) {
      const primaryMemberships = organizationMembers.filter(
        (membership) =>
          membership.organizationId === organization._id &&
          membership.userId === primaryUser._id &&
          membership.status === "active",
      );
      if (primaryMemberships.length !== 1) throw new Error("Primary seed manager must be active in every organization");
      if (billingStates.filter((billing) => billing.organizationId === organization._id).length !== 1) {
        throw new Error("Every seed organization must have exactly one billing state");
      }
    }

    for (const shop of shops) {
      if (!shop.organizationId) throw new Error("Seed shop organization is missing");
      requireRecord(organizationMap, shop.organizationId, "shop organization");
    }
    for (const person of organizationPeople)
      requireRecord(organizationMap, person.organizationId, "person organization");
    for (const member of organizationMembers) {
      const person = requireRecord(personMap, member.personId, "member person");
      if (person.organizationId !== member.organizationId) throw new Error("Seed member crosses organization boundary");
    }
    for (const staff of staffs) {
      const shop = requireRecord(shopMap, staff.shopId, "staff shop");
      if (!staff.organizationId || !staff.organizationPersonId) throw new Error("Seed staff canonical link is missing");
      const person = requireRecord(personMap, staff.organizationPersonId, "staff person");
      if (shop.organizationId !== staff.organizationId || person.organizationId !== staff.organizationId) {
        throw new Error("Seed staff crosses organization boundary");
      }
      if (!staff.email.endsWith("@seed.example.test")) throw new Error("Seed staff contains a non-example email");
    }
    for (const recruitment of recruitments) requireRecord(shopMap, recruitment.shopId, "recruitment shop");
    for (const submission of submissions) {
      const recruitment = requireRecord(recruitmentMap, submission.recruitmentId, "submission recruitment");
      const staff = requireRecord(staffMap, submission.staffId, "submission staff");
      if (staff.shopId !== recruitment.shopId) throw new Error("Seed submission crosses shop boundary");
    }
    for (const slot of submissionSlots) {
      const submission = requireRecord(submissionMap, slot.submissionId, "submission slot parent");
      if (submission.recruitmentId !== slot.recruitmentId || submission.staffId !== slot.staffId) {
        throw new Error("Seed submission slot graph is inconsistent");
      }
    }
    for (const date of submissionDates) {
      const submission = requireRecord(submissionMap, date.submissionId, "submission date parent");
      if (submission.recruitmentId !== date.recruitmentId || submission.staffId !== date.staffId) {
        throw new Error("Seed submission date graph is inconsistent");
      }
    }
    for (const assignment of assignments) {
      const recruitment = requireRecord(recruitmentMap, assignment.recruitmentId, "assignment recruitment");
      const staff = requireRecord(staffMap, assignment.staffId, "assignment staff");
      const position = requireRecord(positionMap, assignment.positionId, "assignment position");
      if (staff.shopId !== recruitment.shopId || position.shopId !== recruitment.shopId) {
        throw new Error("Seed assignment crosses shop boundary");
      }
    }
    for (const stat of stats) {
      const matchingSubmissions = submissions.filter((submission) => submission.recruitmentId === stat.recruitmentId);
      if (matchingSubmissions.length !== stat.submittedCount) throw new Error("Seed recruitment stats drifted");
    }

    if (registrationLinks.length !== 1 || registrationRequests.length !== 3) {
      throw new Error("Development seed registration scenarios are incomplete");
    }
    for (const link of registrationLinks) {
      requireRecord(shopMap, link.shopId, "registration link shop");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(link.token)) {
        throw new Error("Development seed registration capability is invalid");
      }
    }
    for (const request of registrationRequests) {
      requireRecord(shopMap, request.shopId, "registration request shop");
      if (request.status !== "pending" || !request.email.endsWith("@seed.example.test")) {
        throw new Error("Development seed registration request is invalid");
      }
    }

    for (const snapshot of confirmationSnapshots) {
      const recruitment = requireRecord(recruitmentMap, snapshot.recruitmentId, "confirmation snapshot recruitment");
      const staff = requireRecord(staffMap, snapshot.staffId, "confirmation snapshot staff");
      if (recruitment.shopId !== staff.shopId || snapshot.assignments.length === 0) {
        throw new Error("Development seed confirmation snapshot graph is inconsistent");
      }
      for (const assignment of snapshot.assignments) {
        const position = requireRecord(positionMap, assignment.positionId, "confirmation snapshot position");
        if (position.shopId !== recruitment.shopId) {
          throw new Error("Development seed confirmation snapshot crosses shop boundary");
        }
      }
    }

    if (
      lineProviderUsers.length !== 2 ||
      personLineLinks.length !== 2 ||
      staffLineAccounts.length !== 2 ||
      lineQuotaStatuses.length !== 1
    ) {
      throw new Error("Development seed LINE scenario is incomplete");
    }
    for (const account of staffLineAccounts) {
      const staff = requireRecord(staffMap, account.staffId, "LINE account staff");
      if (staff.shopId !== account.shopId || !staff.organizationPersonId) {
        throw new Error("Development seed LINE account graph is inconsistent");
      }
      const providerUser = lineProviderUsers.find((candidate) => candidate.lineUserId === account.lineUserId);
      if (!providerUser) throw new Error("Development seed LINE provider user is missing");
      const canonicalLink = personLineLinks.find(
        (link) =>
          link.organizationPersonId === staff.organizationPersonId && link.lineProviderUserId === providerUser._id,
      );
      if (!canonicalLink || canonicalLink.organizationId !== staff.organizationId) {
        throw new Error("Development seed canonical LINE graph is inconsistent");
      }
      requireRecord(lineProviderUserMap, canonicalLink.lineProviderUserId, "canonical LINE provider user");
    }

    if (outboxes.length !== 2 || notificationHistories.length !== 2 || deliveryEvents.length !== 1) {
      throw new Error("Development seed notification scenario is incomplete");
    }
    for (const outbox of outboxes) {
      if (
        outbox.deliverySuppressed !== true ||
        outbox.payload.kind !== "email" ||
        outbox.payload.suppressDelivery !== true ||
        !outbox.payload.from.endsWith("@seed.example.test") ||
        !outbox.payload.to.endsWith("@seed.example.test")
      ) {
        throw new Error("Development seed notification delivery is not safely suppressed");
      }
      if (!outbox.shopId || !outbox.organizationId || !outbox.recruitmentId || !outbox.staffId) {
        throw new Error("Development seed notification scope is incomplete");
      }
      const shop = requireRecord(shopMap, outbox.shopId, "notification shop");
      const recruitment = requireRecord(recruitmentMap, outbox.recruitmentId, "notification recruitment");
      const staff = requireRecord(staffMap, outbox.staffId, "notification staff");
      if (
        shop.organizationId !== outbox.organizationId ||
        recruitment.shopId !== shop._id ||
        staff.shopId !== shop._id
      ) {
        throw new Error("Development seed notification crosses tenant boundary");
      }
    }
    for (const history of notificationHistories) {
      const outbox = requireRecord(outboxMap, history.outboxId, "notification history outbox");
      if (outbox.shopId !== history.shopId || outbox.staffId !== history.staffId) {
        throw new Error("Development seed notification history graph is inconsistent");
      }
    }
    for (const event of deliveryEvents) {
      if (!event.outboxId || !outboxMap.has(event.outboxId)) {
        throw new Error("Development seed notification delivery event graph is inconsistent");
      }
    }
    for (const failure of failures) {
      if (!failure.outboxId || !outboxMap.has(failure.outboxId)) {
        throw new Error("Development seed notification failure graph is inconsistent");
      }
      if (failure.status === "open") {
        if (!failure.recruitmentId) throw new Error("Development seed open failure recruitment is missing");
        const recruitment = requireRecord(recruitmentMap, failure.recruitmentId, "open failure recruitment");
        if (recruitment.status !== "open" || recruitment.shopId !== failure.shopId) {
          throw new Error("Development seed open failure is not manager-visible");
        }
      }
    }

    const proOrganization = organizations.find((organization) => organization.name === "[SEED] Pro・複数店舗");
    if (!proOrganization) throw new Error("Pro operation scenario is missing");
    if (orderStates.filter((state) => state.organizationId === proOrganization._id).length !== 1) {
      throw new Error("Pro custom staff order state is missing");
    }
    const proActivePeople = organizationPeople.filter(
      (person) => person.organizationId === proOrganization._id && person.status === "active",
    );
    if (
      orderEntries.filter((entry) => entry.organizationId === proOrganization._id).length !== proActivePeople.length
    ) {
      throw new Error("Pro organization staff order is incomplete");
    }
    if (shopOrderEntries.filter((entry) => entry.organizationId === proOrganization._id).length !== 9) {
      throw new Error("Pro shop staff order is incomplete");
    }
    if (
      announcements.length !== 1 ||
      announcements[0].organizationId !== proOrganization._id ||
      announcements[0].displayDate !== today
    ) {
      throw new Error("Development seed dashboard announcement is invalid");
    }

    const windows = buildDevelopmentSeedRecruitmentWindows(today);
    const proShopIds = new Set(
      shops.filter((shop) => shop.organizationId === proOrganization._id).map((shop) => shop._id),
    );
    for (const window of Object.values(windows)) {
      if (
        !recruitments.some(
          (recruitment) =>
            proShopIds.has(recruitment.shopId) &&
            recruitment.status === window.status &&
            recruitment.deadline === window.deadline &&
            recruitment.periodStart === window.periodStart &&
            recruitment.periodEnd === window.periodEnd,
        )
      ) {
        throw new Error("Development seed relative recruitment window is missing");
      }
    }

    const activeOutboxCount = outboxes.filter(
      (outbox) => outbox.status === "pending" || outbox.status === "processing",
    ).length;
    const activeFanoutCount = fanouts.filter(
      (fanout) => fanout.status === "pending" || fanout.status === "processing",
    ).length;
    const liveScheduledFunctions = (await ctx.db.system.query("_scheduled_functions").order("desc").take(1)).filter(
      (scheduled) => scheduled.state.kind === "pending" || scheduled.state.kind === "inProgress",
    );
    if (activeOutboxCount || activeFanoutCount || delayedDeadlines.length || liveScheduledFunctions.length) {
      throw new Error("Development seed contains an active workflow");
    }

    await ctx.db.delete(auditMarker._id);
    return {
      contractVersion: DEVELOPMENT_SEED_CONTRACT_VERSION,
      contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
      scenarioCount: organizations.length,
      tableCount: Object.keys(schema.tables).length,
      organizationCount: organizations.length,
      shopCount: shops.length,
      staffCount: staffs.length,
      recruitmentCount: recruitments.length,
      openFailureCount: failures.filter((failure) => failure.status === "open").length,
      activeOutboxCount,
      activeFanoutCount,
      delayedDeadlineCount: delayedDeadlines.length,
      liveScheduledFunctionCount: liveScheduledFunctions.length,
    };
  },
});
