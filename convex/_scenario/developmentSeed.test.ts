import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";
import { DEVELOPMENT_SEED_SCENARIO_KEYS, type DevelopmentSeedScenarioKey } from "../developmentSeed/catalog";
import { hasCurrentStaffLegalConsent } from "../legal/service";
import { getOrganizationPersonLineState, resolveStaffLineRecipient } from "../line/service";
import {
  confirmationSnapshotMatchesAssignments,
  hasValidConfirmationSnapshotSignature,
} from "../notification/confirmationSnapshots";
import { getOrganizationStaffOrderScope } from "../organization/staffOrder";

const CLERK_ISSUER = "https://clerk.seed.example.test";
const PRIMARY_AUTH_TOKEN_IDENTIFIER = `${CLERK_ISSUER}|user_seedPrimary`;

type PreflightResult = {
  contractVersion: string;
  contractFingerprint: string;
  deploymentUrl: string;
  today: string;
  scenarioKeys: string[];
  tableCount: number;
};
type CancelResult = {
  auditToken: string;
  continueCursor: string;
  isDone: boolean;
  cancelledCount: number;
  inProgressCount: number;
};
type ClearResult = { done: boolean; nextTableIndex: number; deletedCount: number; tableName: string | null };
type VerifyResult = {
  contractVersion: string;
  contractFingerprint: string;
  scenarioCount: number;
  tableCount: number;
  organizationCount: number;
  shopCount: number;
  staffCount: number;
  recruitmentCount: number;
  openFailureCount: number;
  activeOutboxCount: number;
  activeFanoutCount: number;
  delayedDeadlineCount: number;
  liveScheduledFunctionCount: number;
};

const preflightRef = makeFunctionReference<"mutation", Record<string, never>, PreflightResult>(
  "developmentSeed/mutations:preflight",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, PreflightResult>;
const cancelRef = makeFunctionReference<"mutation", { cursor: string | null; auditToken: string | null }, CancelResult>(
  "developmentSeed/mutations:cancelScheduledFunctions",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  { cursor: string | null; auditToken: string | null },
  CancelResult
>;
const clearRef = makeFunctionReference<"mutation", { tableIndex: number; auditToken: string }, ClearResult>(
  "developmentSeed/mutations:clearAllTables",
) as unknown as FunctionReference<"mutation", "internal", { tableIndex: number; auditToken: string }, ClearResult>;
const seedActorsRef = makeFunctionReference<
  "mutation",
  { today: string; auditToken: string },
  { createdCount: number }
>("developmentSeed/mutations:seedActors") as unknown as FunctionReference<
  "mutation",
  "internal",
  { today: string; auditToken: string },
  { createdCount: number }
>;
const seedScenarioRef = makeFunctionReference<
  "mutation",
  { scenarioKey: DevelopmentSeedScenarioKey; today: string; auditToken: string },
  { scenarioKey: string; insertedCount: number }
>("developmentSeed/mutations:seedScenario") as unknown as FunctionReference<
  "mutation",
  "internal",
  { scenarioKey: DevelopmentSeedScenarioKey; today: string; auditToken: string },
  { scenarioKey: string; insertedCount: number }
>;
const verifyRef = makeFunctionReference<"mutation", { today: string; auditToken: string }, VerifyResult>(
  "developmentSeed/queries:verify",
) as unknown as FunctionReference<"mutation", "internal", { today: string; auditToken: string }, VerifyResult>;

type SeedTest = TestConvex<typeof schema>;

function configureDevelopmentSeed() {
  vi.stubEnv("DEVELOPMENT_SEED_ENABLED", "true");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud");
  vi.stubEnv("DEVELOPMENT_SEED_DEPLOYMENT_URL", "https://seed-development.convex.cloud");
  vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", CLERK_ISSUER);
  vi.stubEnv("DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", PRIMARY_AUTH_TOKEN_IDENTIFIER);
}

async function cancelAllScheduledFunctions(t: SeedTest): Promise<string> {
  let cursor: string | null = null;
  let auditToken: string | null = null;
  let inProgressCount = 0;
  do {
    const result: CancelResult = await t.mutation(cancelRef, { cursor, auditToken });
    auditToken = result.auditToken;
    inProgressCount += result.inProgressCount;
    cursor = result.isDone ? null : result.continueCursor;
    if (result.isDone) {
      expect(inProgressCount).toBe(0);
      return auditToken;
    }
  } while (cursor);
  throw new Error("Scheduled-function audit ended without a token");
}

async function clearAllTables(t: SeedTest, auditToken: string) {
  let tableIndex = 0;
  while (true) {
    const result: ClearResult = await t.mutation(clearRef, { tableIndex, auditToken });
    tableIndex = result.nextTableIndex;
    if (result.done) return;
  }
}

async function seedAllScenarios(t: SeedTest, today: string, auditToken: string) {
  const actors = await t.mutation(seedActorsRef, { today, auditToken });
  for (const scenarioKey of DEVELOPMENT_SEED_SCENARIO_KEYS) {
    await t.mutation(seedScenarioRef, { scenarioKey, today, auditToken });
  }
  return actors;
}

async function prepareRebuild(t: SeedTest) {
  const preflight = await t.mutation(preflightRef, {});
  const auditToken = await cancelAllScheduledFunctions(t);
  await clearAllTables(t, auditToken);
  const actors = await seedAllScenarios(t, preflight.today, auditToken);
  return { actors, auditToken, preflight };
}

async function rebuild(t: SeedTest) {
  const { actors, auditToken, preflight } = await prepareRebuild(t);
  const verification = await t.mutation(verifyRef, { today: preflight.today, auditToken });
  return { actors, preflight, verification };
}

describe("development seed rebuild", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T01:00:00.000Z"));
    configureDevelopmentSeed();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("preflightから9 scenarioと整合graphを構築しactive workflowを残さない", async () => {
    const t = convexTest(schema, modules);
    const { actors, preflight, verification } = await rebuild(t);

    expect(actors).toEqual({ createdCount: 11 });
    expect(actors).not.toHaveProperty("primaryAuthTokenIdentifier");
    expect(preflight.scenarioKeys).toEqual(DEVELOPMENT_SEED_SCENARIO_KEYS);
    expect(verification).toEqual({
      contractVersion: "development-seed-v4",
      contractFingerprint: "5a10ca20",
      scenarioCount: 9,
      tableCount: 66,
      organizationCount: 9,
      shopCount: 11,
      staffCount: 163,
      recruitmentCount: 17,
      openFailureCount: 1,
      activeOutboxCount: 0,
      activeFanoutCount: 0,
      delayedDeadlineCount: 0,
      liveScheduledFunctionCount: 0,
    });

    const state = await t.run(async (ctx) => ({
      patterns: [
        ...new Set((await ctx.db.query("recruitments").collect()).map((row) => row.submissionPattern.kind)),
      ].sort(),
      outboxStatuses: (await ctx.db.query("notificationOutbox").collect()).map((row) => row.status).sort(),
      failureStatuses: (await ctx.db.query("notificationFailureInbox").collect()).map((row) => row.status).sort(),
      legacyBillingShapeCount: (await ctx.db.query("organizationBillingStates").collect()).filter((row) => {
        const state = row.state as unknown as Record<string, unknown>;
        return "planIdVersion" in state || state.kind === "grace" || Object.values(state).includes("business");
      }).length,
      legacyShopBillingStateCount: (await ctx.db.query("shopBillingStates").collect()).length,
      legacyShopOperatingStatusCount: (await ctx.db.query("shops").collect()).filter(
        (shop) => shop.operatingStatus !== undefined,
      ).length,
      deletedShopCount: (await ctx.db.query("shops").collect()).filter((shop) => shop.isDeleted).length,
      deletedStaffCount: (await ctx.db.query("staffs").collect()).filter((staff) => staff.isDeleted).length,
      delayedDeadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      auditMarkers: await ctx.db.query("rateLimits").collect(),
      activeScheduled: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (scheduled) => scheduled.state.kind === "pending" || scheduled.state.kind === "inProgress",
      ),
    }));
    expect(state).toEqual({
      patterns: ["dateOnly", "shiftType", "time"],
      outboxStatuses: ["failed", "sent"],
      failureStatuses: ["open", "resolved"],
      legacyBillingShapeCount: 0,
      legacyShopBillingStateCount: 0,
      legacyShopOperatingStatusCount: 0,
      deletedShopCount: 0,
      deletedStaffCount: 0,
      delayedDeadlines: [],
      auditMarkers: [],
      activeScheduled: [],
    });

    const organizationUsageSummaries = await t.run(async (ctx) => {
      const [organizations, people, members, shops, staffs] = await Promise.all([
        ctx.db.query("organizations").collect(),
        ctx.db.query("organizationPeople").collect(),
        ctx.db.query("organizationMembers").collect(),
        ctx.db.query("shops").collect(),
        ctx.db.query("staffs").collect(),
      ]);
      return organizations.map((organization) => {
        const organizationShops = shops.filter((shop) => shop.organizationId === organization._id);
        return {
          organizationName: organization.name,
          peopleCount: people.filter(
            (person) => person.organizationId === organization._id && person.status === "active",
          ).length,
          activeManagerCount: members.filter(
            (member) => member.organizationId === organization._id && member.status === "active",
          ).length,
          peopleNames: people
            .filter((person) => person.organizationId === organization._id && person.status === "active")
            .map((person) => person.name)
            .sort(),
          staffCountsByShop: organizationShops.map(
            (shop) => staffs.filter((staff) => staff.shopId === shop._id).length,
          ),
        };
      });
    });
    const usageByOrganization = Object.fromEntries(
      organizationUsageSummaries.map(({ organizationName, ...usage }) => [organizationName, usage]),
    );
    expect(usageByOrganization).toMatchObject({
      "[SEED] Trial・50名・終了間近": {
        peopleCount: 50,
        activeManagerCount: 2,
        staffCountsByShop: [50],
      },
      "[SEED] Pro・50名・通知": {
        peopleCount: 50,
        activeManagerCount: 2,
        staffCountsByShop: [50],
      },
      "[SEED] Standard・25名・複数店舗": {
        peopleCount: 25,
        activeManagerCount: 5,
        staffCountsByShop: [25, 12, 6],
      },
      合同会社シフトリノート: {
        peopleCount: 9,
        activeManagerCount: 1,
        peopleNames: [
          "波留野 澄人",
          "小庭井 美澄",
          "水代谷 朔",
          "野依田 千景",
          "古瀬戸 透里",
          "月守 奈緒",
          "霞野 直",
          "森澄 ひより",
          "羽路木 圭",
        ].sort(),
        staffCountsByShop: [9],
      },
    });
    expect(Math.max(...Object.values(usageByOrganization).map((usage) => usage.activeManagerCount))).toBe(5);

    const productScopes = await t.run(async (ctx) => {
      const organizations = await ctx.db.query("organizations").collect();
      const shops = await ctx.db.query("shops").collect();
      const organizationByName = new Map(organizations.map((organization) => [organization.name, organization]));
      const findShop = (organizationName: string) => {
        const organization = organizationByName.get(organizationName);
        const shop = organization && shops.find((candidate) => candidate.organizationId === organization._id);
        if (!shop) throw new Error(`Missing product-query seed shop: ${organizationName}`);
        return shop._id;
      };
      const businessOrganization = organizationByName.get("[SEED] Pro・50名・通知");
      const proOrganization = organizationByName.get("[SEED] Standard・25名・複数店舗");
      if (!businessOrganization || !proOrganization) throw new Error("Missing product-query seed organization");
      const businessShopId = findShop("[SEED] Pro・50名・通知");
      const businessPeople = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", businessOrganization._id).eq("status", "active"),
        )
        .collect();
      const linkedPeople = businessPeople.filter(
        (person) => person.name.startsWith("[SEED] 提出済み") || person.name.startsWith("[SEED] 全休希望"),
      );
      const lineStates = await Promise.all(
        linkedPeople.map(
          async (person) =>
            await getOrganizationPersonLineState(ctx, {
              organizationId: businessOrganization._id,
              organizationPersonId: person._id,
            }),
        ),
      );
      const businessStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", businessShopId).eq("isDeleted", false))
        .collect();
      const lineRecipients = await Promise.all(
        businessStaffs
          .filter((staff) => staff.name === "[SEED] 提出済み" || staff.name === "[SEED] 全休希望")
          .map(async (staff) => await resolveStaffLineRecipient(ctx, { staffId: staff._id, shopId: businessShopId })),
      );
      const proShops = shops.filter((shop) => shop.organizationId === proOrganization._id);
      const proOrderScopes = await Promise.all([
        getOrganizationStaffOrderScope(ctx, { organizationId: proOrganization._id }),
        ...proShops.map(
          async (shop) =>
            await getOrganizationStaffOrderScope(ctx, {
              organizationId: proOrganization._id,
              shopId: shop._id,
            }),
        ),
      ]);
      const primaryUser = await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", PRIMARY_AUTH_TOKEN_IDENTIFIER))
        .unique();
      if (!primaryUser) throw new Error("Missing primary seed user");
      const primaryMemberships = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", primaryUser._id).eq("status", "active"))
        .collect();
      const primaryConsentStates = await ctx.db
        .query("legalConsentStates")
        .withIndex("by_userId", (q) => q.eq("userId", primaryUser._id))
        .collect();
      const confirmationSnapshot = await ctx.db.query("shiftConfirmationSnapshots").unique();
      if (!confirmationSnapshot) throw new Error("Missing product-query confirmation snapshot");
      const sentConfirmationHistory = (await ctx.db.query("notificationHistory").collect()).find(
        (history) => history.notificationKind === "shiftConfirmation" && history.sendStatus === "sent",
      );
      if (!sentConfirmationHistory?.outboxId) throw new Error("Missing sent confirmation history");
      const sentConfirmationOutbox = await ctx.db.get(sentConfirmationHistory.outboxId);
      if (!sentConfirmationOutbox) throw new Error("Missing sent confirmation outbox");
      const resolvedConfirmationFailure = (await ctx.db.query("notificationFailureInbox").collect()).find(
        (failure) => failure.outboxId === sentConfirmationOutbox._id && failure.status === "resolved",
      );
      if (!resolvedConfirmationFailure) throw new Error("Missing resolved confirmation failure");
      const currentSnapshotAssignments = (await ctx.db.query("shiftAssignments").collect())
        .filter(
          (assignment) =>
            assignment.recruitmentId === confirmationSnapshot.recruitmentId &&
            assignment.staffId === confirmationSnapshot.staffId,
        )
        .map((assignment) => ({
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          positionId: assignment.positionId,
          ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
        }));
      return {
        businessShopId,
        freeShopId: findShop("[SEED] Free・上限確認"),
        policyOverLimitShopId: findShop("[SEED] Free・上限超過"),
        scheduledStopShopId: findShop("[SEED] Standard・解約予約"),
        trialShopId: findShop("合同会社シフトリノート"),
        lineStatuses: lineStates.map((state) => state?.status).sort(),
        lineRecipientFollowing: lineRecipients.map((recipient) => recipient?.following).sort(),
        proOrderModes: proOrderScopes.map((scope) => scope.mode),
        primaryManagerRole: primaryUser.role,
        primaryManagerOrganizationIds: primaryMemberships.map((membership) => membership.organizationId).sort(),
        primaryConsentStateCount: primaryConsentStates.length,
        confirmationSignatureValid: hasValidConfirmationSnapshotSignature(confirmationSnapshot),
        confirmationMatchesCurrent: confirmationSnapshotMatchesAssignments(
          confirmationSnapshot,
          currentSnapshotAssignments,
          false,
        ),
        confirmationNotificationGraphMatches:
          sentConfirmationHistory.staffId === confirmationSnapshot.staffId &&
          sentConfirmationOutbox.staffId === confirmationSnapshot.staffId &&
          sentConfirmationOutbox.recruitmentId === confirmationSnapshot.recruitmentId &&
          resolvedConfirmationFailure.staffId === confirmationSnapshot.staffId &&
          resolvedConfirmationFailure.recruitmentId === confirmationSnapshot.recruitmentId,
      };
    });
    expect(productScopes.lineStatuses).toEqual(["linked_following", "linked_unfollowed"]);
    expect(productScopes.lineRecipientFollowing).toEqual([false, true]);
    expect(productScopes.proOrderModes).toEqual(["ordered", "ordered", "ordered", "ordered"]);
    expect(productScopes.primaryManagerRole).toBe("manager");
    expect(productScopes.primaryManagerOrganizationIds).toHaveLength(9);
    expect(new Set(productScopes.primaryManagerOrganizationIds).size).toBe(9);
    expect(productScopes.primaryConsentStateCount).toBe(1);
    expect(productScopes.confirmationSignatureValid).toBe(true);
    expect(productScopes.confirmationMatchesCurrent).toBe(false);
    expect(productScopes.confirmationNotificationGraphMatches).toBe(true);
    const primaryManager = t.withIdentity({ tokenIdentifier: PRIMARY_AUTH_TOKEN_IDENTIFIER });
    const visibleFailures = await primaryManager.query(api.notificationOutbox.queries.listOpenFailures, {
      shopId: productScopes.businessShopId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(visibleFailures.page).toHaveLength(1);
    expect(visibleFailures.page[0]).toMatchObject({
      status: "open",
      notificationKind: "recruitment",
      canRetry: true,
    });

    const [freeRequests, trialRequests] = await Promise.all([
      primaryManager.query(api.staffRegistration.queries.getPendingRequests, { shopId: productScopes.freeShopId }),
      primaryManager.query(api.staffRegistration.queries.getPendingRequests, { shopId: productScopes.trialShopId }),
    ]);
    expect(freeRequests).toEqual([expect.objectContaining({ name: "[SEED] 上限で承認不可", canApprove: true })]);
    expect(trialRequests).toEqual([
      expect.objectContaining({ name: "鳥沢野 美月", canApprove: true }),
      expect.objectContaining({ name: "小庭井 美澄", canApprove: false }),
    ]);
    await expect(
      primaryManager.mutation(api.staffRegistration.mutations.approveRequest, {
        shopId: productScopes.freeShopId,
        requestId: freeRequests[0]._id,
      }),
    ).rejects.toThrow(/現在5名、上限5名/);
    const approvableTrialRequest = trialRequests.find((request) => request.canApprove);
    if (!approvableTrialRequest) throw new Error("Missing approvable Trial request");
    await primaryManager.mutation(api.staffRegistration.mutations.approveRequest, {
      shopId: productScopes.trialShopId,
      requestId: approvableTrialRequest._id,
    });
    await expect(
      t.run(async (ctx) => {
        const approvedStaff = await ctx.db
          .query("staffs")
          .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
            q
              .eq("shopId", productScopes.trialShopId)
              .eq("emailNormalized", "trial-daily-approval-pending@seed.example.test")
              .eq("isDeleted", false),
          )
          .unique();
        return approvedStaff ? await hasCurrentStaffLegalConsent(ctx, approvedStaff._id) : false;
      }),
    ).resolves.toBe(true);
    await expect(primaryManager.query(api.legal.queries.getManagerConsentStatus, {})).resolves.toEqual(
      expect.objectContaining({ required: false }),
    );
    const [scheduledStopSettings, policyOverLimitSettings] = await Promise.all([
      primaryManager.query(api.organization.queries.getSettings, { shopId: productScopes.scheduledStopShopId }),
      primaryManager.query(api.organization.queries.getSettings, { shopId: productScopes.policyOverLimitShopId }),
    ]);
    expect(scheduledStopSettings?.billing).toMatchObject({
      state: "scheduledChange",
      currentPlan: "standard",
      targetPlan: "free",
      restrictAtPeriodEnd: true,
      nextEvent: { label: "契約終了日" },
    });
    expect(policyOverLimitSettings?.billing).toMatchObject({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 6, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 2, max: 2, pendingInvitations: 0 },
      requiredReductions: { people: 1, shops: 0, managers: 0 },
    });
    expect(policyOverLimitSettings).toMatchObject({
      canUpdateOrganizationName: false,
      canAddShop: false,
      canInviteManager: false,
    });
  });

  it("同じJST日付に再実行しても件数を増やさない", async () => {
    const t = convexTest(schema, modules);
    const first = await rebuild(t);
    const firstSensitiveValues = await t.run(async (ctx) => ({
      registrationToken: (await ctx.db.query("shopRegistrationLinks").unique())?.token,
      announcementDisplayDate: (await ctx.db.query("dashboardAnnouncements").unique())?.displayDate,
    }));
    const second = await rebuild(t);
    const secondSensitiveValues = await t.run(async (ctx) => ({
      registrationToken: (await ctx.db.query("shopRegistrationLinks").unique())?.token,
      announcementDisplayDate: (await ctx.db.query("dashboardAnnouncements").unique())?.displayDate,
    }));

    expect(second.preflight.today).toBe(first.preflight.today);
    expect(second.verification).toEqual(first.verification);
    expect(firstSensitiveValues.registrationToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(secondSensitiveValues.registrationToken).not.toBe(firstSensitiveValues.registrationToken);
    expect(firstSensitiveValues.announcementDisplayDate).toBe(first.preflight.today);
    expect(secondSensitiveValues.announcementDisplayDate).toBe(second.preflight.today);
    expect(first.verification).not.toHaveProperty("registrationToken");
    expect(second.preflight).not.toHaveProperty("registrationToken");
  });

  it("途中scenarioまでで停止しても全clearからの再実行だけで復旧する", async () => {
    const t = convexTest(schema, modules);
    const preflight = await t.mutation(preflightRef, {});
    const auditToken = await cancelAllScheduledFunctions(t);
    await clearAllTables(t, auditToken);
    await t.mutation(seedActorsRef, { today: preflight.today, auditToken });
    for (const scenarioKey of DEVELOPMENT_SEED_SCENARIO_KEYS.slice(0, 3)) {
      await t.mutation(seedScenarioRef, { scenarioKey, today: preflight.today, auditToken });
    }
    await expect(t.mutation(verifyRef, { today: preflight.today, auditToken })).rejects.toThrowError(
      /not ready for verification/,
    );

    const recovered = await rebuild(t);
    expect(recovered.verification.scenarioCount).toBe(9);
    expect(recovered.verification.liveScheduledFunctionCount).toBe(0);
  });

  it("全table runtime coverageが意図的空tableの混入とseeded table欠損を拒否する", async () => {
    const contaminated = convexTest(schema, modules);
    const contaminatedRun = await prepareRebuild(contaminated);
    await contaminated.run(async (ctx) => {
      await ctx.db.insert("featureRequests", {
        comment: "development seed runtime coverage sentinel",
        requestId: "development-seed-unexpected-feature-request",
      });
    });
    await expect(
      contaminated.mutation(verifyRef, {
        today: contaminatedRun.preflight.today,
        auditToken: contaminatedRun.auditToken,
      }),
    ).rejects.toThrowError(/table must be empty: featureRequests/);
    await expect(
      contaminated.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).map((marker) => marker.key)),
    ).resolves.toEqual([contaminatedRun.auditToken]);

    const missing = convexTest(schema, modules);
    const missingRun = await prepareRebuild(missing);
    await missing.run(async (ctx) => {
      const announcement = await ctx.db.query("dashboardAnnouncements").unique();
      if (!announcement) throw new Error("Missing seeded announcement fixture");
      await ctx.db.delete(announcement._id);
    });
    await expect(
      missing.mutation(verifyRef, { today: missingRun.preflight.today, auditToken: missingRun.auditToken }),
    ).rejects.toThrowError(/table is missing: dashboardAnnouncements/);
  });

  it("audit完了後に作成・完了したscheduled functionがあればseedを開始しない", async () => {
    const t = convexTest(schema, modules);
    const preflight = await t.mutation(preflightRef, {});
    const auditToken = await cancelAllScheduledFunctions(t);
    await clearAllTables(t, auditToken);

    vi.setSystemTime(new Date("2026-08-20T01:00:00.001Z"));
    await t.run(async (ctx) => {
      await ctx.scheduler.runAfter(0, preflightRef, {});
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(t.mutation(seedActorsRef, { today: preflight.today, auditToken })).rejects.toThrowError(
      /scheduled-function audit is stale/,
    );
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toEqual([]);

    const completedSeed = convexTest(schema, modules);
    const completedRun = await prepareRebuild(completedSeed);
    vi.setSystemTime(new Date("2026-08-20T01:00:00.002Z"));
    await completedSeed.run(async (ctx) => {
      await ctx.scheduler.runAfter(0, preflightRef, {});
    });
    await completedSeed.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      completedSeed.mutation(verifyRef, {
        today: completedRun.preflight.today,
        auditToken: completedRun.auditToken,
      }),
    ).rejects.toThrowError(/scheduled-function audit is stale/);
  });
});
