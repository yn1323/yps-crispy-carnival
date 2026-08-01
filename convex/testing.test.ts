import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShopMembership,
  testAuthTokenIdentifier,
} from "./_test/seed";
import { modules, schema } from "./_test/setup.test-helper";
import { getLegalConsentVersions } from "./legal/documents";
import { deriveInvitationToken, digestInvitationToken } from "./organizationInvitation/token";

const seedMultiShopOrganizationScenarioRef = makeFunctionReference<
  "mutation",
  {
    managerAuthTokenIdentifier: string;
    managerEmail: string;
    organizationName?: string;
    primaryShopName?: string;
    secondaryShopName?: string;
  },
  {
    organizationId: Id<"organizations">;
    primaryOrganizationId: Id<"organizations">;
    shopId: Id<"shops">;
    primaryShopId: Id<"shops">;
    secondaryShopId: Id<"shops">;
    userId: Id<"users">;
    ownerPersonId: Id<"organizationPeople">;
    primaryMarkerPersonId: Id<"organizationPeople">;
    primaryMarkerStaffId: Id<"staffs">;
    secondaryMarkerPersonId: Id<"organizationPeople">;
    secondaryMarkerStaffId: Id<"staffs">;
  }
>("testing:seedMultiShopOrganizationScenario");

type MultiActorSeedArgs = {
  ownerManagerAuthTokenIdentifier: string;
  ownerManagerEmail: string;
  actorBManagerAuthTokenIdentifier: string;
  actorBManagerEmail: string;
  actorCManagerAuthTokenIdentifier: string;
  actorCManagerEmail: string;
  personRemovalAssignments?: { today: string; future: string };
};

type MultiActorSeedResult = {
  ownerUserId: Id<"users">;
  actorBUserId: Id<"users">;
  actorCUserId: Id<"users">;
  primaryOrganizationId: Id<"organizations">;
  ownerMemberId: Id<"organizationMembers">;
  primaryShopId: Id<"shops">;
  secondaryShopId: Id<"shops">;
  actorBPersonId: Id<"organizationPeople">;
  actorBPrimaryStaffId: Id<"staffs">;
  alternateOrganizationId: Id<"organizations">;
  alternateShopId: Id<"shops">;
  actorBAlternatePersonId: Id<"organizationPeople">;
  actorBAlternateMemberId: Id<"organizationMembers">;
  personRemovalRecruitmentId?: Id<"recruitments">;
  personRemovalAssignmentCount?: number;
};

const seedMultiActorOrganizationScenarioRef = makeFunctionReference<
  "mutation",
  MultiActorSeedArgs,
  MultiActorSeedResult
>("testing:seedMultiActorOrganizationScenario");

const resetMultiActorOrganizationScenarioDataRef = makeFunctionReference<
  "mutation",
  Pick<
    MultiActorSeedArgs,
    "ownerManagerAuthTokenIdentifier" | "actorBManagerAuthTokenIdentifier" | "actorCManagerAuthTokenIdentifier"
  >,
  { reset: boolean }
>("testing:resetMultiActorOrganizationScenarioData");

type FreeManagerMultiOrganizationSeedArgs = {
  actorAManagerAuthTokenIdentifier: string;
  actorAManagerEmail: string;
  actorBManagerAuthTokenIdentifier: string;
  actorBManagerEmail: string;
  actorCManagerAuthTokenIdentifier: string;
  targetOrganizationName?: string;
  targetShopName?: string;
  actorBName?: string;
  alternateOrganizationName?: string;
  alternateShopName?: string;
};

type FreeManagerMultiOrganizationSeedResult = {
  actorAUserId: Id<"users">;
  actorAName: string;
  targetOrganizationId: Id<"organizations">;
  targetOrganizationName: string;
  targetShopId: Id<"shops">;
  targetShopName: string;
  actorATargetPersonId: Id<"organizationPeople">;
  actorATargetMemberId: Id<"organizationMembers">;
  actorATargetStaffId: Id<"staffs">;
  actorBTargetPersonId: Id<"organizationPeople">;
  actorBTargetStaffId: Id<"staffs">;
  actorBName: string;
  alternateOrganizationId: Id<"organizations">;
  alternateOrganizationName: string;
  alternateShopId: Id<"shops">;
  alternateShopName: string;
  actorAAlternatePersonId: Id<"organizationPeople">;
  actorAAlternateMemberId: Id<"organizationMembers">;
  actorAAlternateStaffId: Id<"staffs">;
};

const seedFreeManagerMultiOrganizationScenarioRef = makeFunctionReference<
  "mutation",
  FreeManagerMultiOrganizationSeedArgs,
  FreeManagerMultiOrganizationSeedResult
>("testing:seedFreeManagerMultiOrganizationScenario");

type OrganizationNotificationProbeResult = {
  outbox: Array<{
    organizationId: Id<"organizations">;
    organizationInvitationId: Id<"organizationInvitations"> | null;
    purpose: "business" | "billing" | null;
    channel: "email" | "line";
    status: "pending" | "processing" | "sent" | "failed" | "cancelled";
    notificationContext: string;
    dedupeKey: string;
    attemptCount: number;
    deliverySuppressed: boolean;
    recipientUserFingerprint: string | null;
    invitationVersionMatchesTarget: boolean | null;
    hasRecognizedCta: boolean;
    ctaTokenMatchesTarget: boolean | null;
    ctaShopMatchesTarget: boolean | null;
  }>;
  duplicateDedupeKeyCount: number;
};

const getOrganizationNotificationProbeRef = makeFunctionReference<
  "query",
  {
    organizationId: Id<"organizations">;
    organizationInvitationId?: Id<"organizationInvitations">;
    expectedShopId?: Id<"shops">;
    notificationContext?: string;
    channel?: "email" | "line";
  },
  OrganizationNotificationProbeResult
>("testing:getOrganizationNotificationProbe");

type ManagerInvitationTokenProbeResult = {
  token: string | null;
  invitationId: Id<"organizationInvitations"> | null;
  version: number | null;
  status: "pending" | "accepted" | "issued" | "linked" | "revoked" | "expired" | null;
  expiresAt: number | null;
};

const getManagerInvitationTokenProbeRef = makeFunctionReference<
  "query",
  { organizationId: Id<"organizations">; invitationId: Id<"organizationInvitations"> },
  ManagerInvitationTokenProbeResult
>("testing:getManagerInvitationTokenProbe");

const triggerStaffRegistrationManagerDigestScenarioRef = makeFunctionReference<
  "mutation",
  { shopId: Id<"shops"> },
  { scheduledPurposeCount: number }
>("testing:triggerStaffRegistrationManagerDigestScenario");

const seedPendingStaffRegistrationRequestScenarioRef = makeFunctionReference<
  "mutation",
  { shopId: Id<"shops">; name: string; email: string },
  { requestId: Id<"staffRegistrationRequests"> }
>("testing:seedPendingStaffRegistrationRequestScenario");

type OrganizationBillingPlanChangeSeedArgs = {
  managerAuthTokenIdentifier: string;
  managerEmail: string;
  complimentaryOrganizationName?: string;
  complimentaryShopName?: string;
  restrictedOrganizationName?: string;
  restrictedShopName?: string;
  removablePersonName?: string;
};

type OrganizationBillingPlanChangeSeedResult = {
  complimentaryOrganizationId: Id<"organizations">;
  complimentaryShopId: Id<"shops">;
  complimentaryOrganizationName: string;
  restrictedOrganizationId: Id<"organizations">;
  restrictedShopId: Id<"shops">;
  restrictedOrganizationName: string;
  removablePersonId: Id<"organizationPeople">;
  removablePersonName: string;
  expectedRestrictedPeople: number;
  expectedProLimit: number;
};

const seedOrganizationBillingPlanChangeScenarioRef = makeFunctionReference<
  "mutation",
  OrganizationBillingPlanChangeSeedArgs,
  OrganizationBillingPlanChangeSeedResult
>("testing:seedOrganizationBillingPlanChangeScenario");

type ClearAllTablesResult = {
  cleared: string[];
  deleted: number;
  nextTable: string | null;
  done: boolean;
};

const clearAllTablesRef = makeFunctionReference<"mutation", { tableName?: string }, ClearAllTablesResult>(
  "testing:clearAllTables",
);

describe("E2E testing helpers", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://e2e-test.convex.cloud");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects clearAllTables when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(clearAllTablesRef, {})).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("allows clearAllTables when E2E testing helpers are enabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index++) {
        await ctx.db.insert("users", {
          authTokenIdentifier: `manager_test_${index}`,
          name: `Test Manager ${index}`,
          email: `manager-${index}@example.com`,
          role: "manager",
          isDeleted: false,
        });
      }
    });

    const clearedTables = new Set<string>();
    let nextTable: string | undefined;
    let totalDeleted = 0;
    let result: ClearAllTablesResult | undefined;
    do {
      result = await t.mutation(clearAllTablesRef, nextTable ? { tableName: nextTable } : {});
      result.cleared.forEach((tableName) => {
        clearedTables.add(tableName);
      });
      totalDeleted += result.deleted;
      nextTable = result.nextTable ?? undefined;
    } while (!result.done);

    expect(result).toEqual(expect.objectContaining({ done: true, nextTable: null }));
    expect(clearedTables).toContain("users");
    expect(totalDeleted).toBe(105);
    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it.each([
    { current: "https://e2e-test.convex.cloud", allowed: "" },
    { current: "https://production-example.convex.cloud", allowed: "https://e2e-test.convex.cloud" },
  ])("rejects destructive helpers when the deployment binding does not match", async ({ current, allowed }) => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", current);
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", allowed);
    const t = convexTest(schema, modules);

    await expect(t.mutation(clearAllTablesRef, {})).rejects.toThrow(
      "E2E testing helpers are disabled for this deployment",
    );
  });

  it("rejects direct seed helpers when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.seedSubmitTestData, {})).rejects.toThrow(
      "E2E testing helpers are disabled",
    );
    await expect(
      t.mutation(seedFreeManagerMultiOrganizationScenarioRef, {
        actorAManagerAuthTokenIdentifier: testAuthTokenIdentifier("disabled_free_multi_a"),
        actorAManagerEmail: "disabled-free-multi-a@example.com",
        actorBManagerAuthTokenIdentifier: testAuthTokenIdentifier("disabled_free_multi_b"),
        actorBManagerEmail: "disabled-free-multi-b@example.com",
        actorCManagerAuthTokenIdentifier: testAuthTokenIdentifier("disabled_free_multi_c"),
      }),
    ).rejects.toThrow("E2E testing helpers are disabled");
    await expect(
      t.mutation(seedOrganizationBillingPlanChangeScenarioRef, {
        managerAuthTokenIdentifier: testAuthTokenIdentifier("disabled_billing_plan_change"),
        managerEmail: "disabled-billing-plan-change@example.com",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("課金プラン変更seedは支払い不要BusinessとPro上限超過をStripe秘密情報なしで再現する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);

    const seeded = await t.mutation(seedOrganizationBillingPlanChangeScenarioRef, {
      managerAuthTokenIdentifier: testAuthTokenIdentifier("billing_plan_change"),
      managerEmail: "billing-plan-change@example.com",
      complimentaryOrganizationName: "支払い不要Business契約テスト",
      complimentaryShopName: "支払い不要Business店舗",
      restrictedOrganizationName: "Pro上限復旧契約テスト",
      restrictedShopName: "Pro上限復旧店舗",
      removablePersonName: "上限復旧で削除する人",
    });

    expect(Object.keys(seeded).sort()).toEqual(
      [
        "complimentaryOrganizationId",
        "complimentaryOrganizationName",
        "complimentaryShopId",
        "expectedProLimit",
        "expectedRestrictedPeople",
        "removablePersonId",
        "removablePersonName",
        "restrictedOrganizationId",
        "restrictedOrganizationName",
        "restrictedShopId",
      ].sort(),
    );
    expect(seeded).toMatchObject({
      complimentaryOrganizationName: "支払い不要Business契約テスト",
      restrictedOrganizationName: "Pro上限復旧契約テスト",
      removablePersonName: "上限復旧で削除する人",
      expectedRestrictedPeople: 21,
      expectedProLimit: 20,
    });

    const stored = await t.run(async (ctx) => {
      const complimentaryBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.complimentaryOrganizationId))
        .unique();
      const restrictedBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.restrictedOrganizationId))
        .unique();
      const restrictedPeople = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.restrictedOrganizationId))
        .collect();
      return {
        complimentaryBilling,
        restrictedBilling,
        activeRestrictedPeople: restrictedPeople.filter((person) => person.status === "active"),
        stripeCustomers: await ctx.db.query("organizationStripeCustomers").collect(),
        stripeSubscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
        stripeOperations: await ctx.db.query("organizationStripeOperations").collect(),
        notificationOutbox: await ctx.db.query("notificationOutbox").collect(),
      };
    });

    expect(stored.complimentaryBilling?.state).toEqual({ kind: "complimentary", plan: "business" });
    expect(stored.restrictedBilling?.state).toMatchObject({
      kind: "restricted",
      reason: "planLimitExceeded",
      previousPlan: "business",
      targetPlan: "pro",
      limitPlan: "pro",
    });
    expect(stored.activeRestrictedPeople).toHaveLength(21);
    expect(stored.activeRestrictedPeople.some((person) => person._id === seeded.removablePersonId)).toBe(true);
    expect(stored.stripeCustomers).toEqual([]);
    expect(stored.stripeSubscriptions).toEqual([]);
    expect(stored.stripeOperations).toEqual([]);
    expect(stored.notificationOutbox).toEqual([]);
  });

  it("スタッフ登録申請seedはE2E境界と有効店舗を検証し、正規化済みの現行同意情報を保存する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const { shopId } = await t.run(async (ctx) =>
      seedManagerShop(ctx, {
        subject: "pending_staff_registration_seed",
        shopName: "スタッフ登録申請seed店舗",
      }),
    );

    const { requestId } = await t.mutation(seedPendingStaffRegistrationRequestScenarioRef, {
      shopId,
      name: "  申請スタッフ  ",
      email: "  Pending-Staff@Example.COM  ",
    });
    const request = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(request).toMatchObject({
      shopId,
      name: "申請スタッフ",
      email: "pending-staff@example.com",
      emailNormalized: "pending-staff@example.com",
      status: "pending",
      ...getLegalConsentVersions("staff"),
      consentedAt: expect.any(Number),
      createdAt: expect.any(Number),
    });

    const { shopId: deletedShopId } = await t.run(async (ctx) =>
      seedManagerShop(ctx, {
        subject: "deleted_pending_staff_registration_seed",
        shopName: "削除済みスタッフ登録申請seed店舗",
        shopDeleted: true,
      }),
    );
    await expect(
      t.mutation(seedPendingStaffRegistrationRequestScenarioRef, {
        shopId: deletedShopId,
        name: "削除済み店舗申請スタッフ",
        email: "deleted-pending-staff@example.com",
      }),
    ).rejects.toThrow("Staff registration request scenario not found");

    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://other-e2e-test.convex.cloud");
    await expect(
      t.mutation(seedPendingStaffRegistrationRequestScenarioRef, {
        shopId,
        name: "deployment不一致申請スタッフ",
        email: "deployment-mismatch-pending-staff@example.com",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment");

    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    await expect(
      t.mutation(seedPendingStaffRegistrationRequestScenarioRef, {
        shopId,
        name: "無効境界申請スタッフ",
        email: "disabled-pending-staff@example.com",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("reset前に想定外の未解決FailureInboxを検出する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const subject = "manager_unexpected_failure";
    await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject,
        email: "unexpected-failure@example.com",
        shopName: "通知監査テスト店舗",
      });
      const now = Date.now();
      await ctx.db.insert("notificationFailureInbox", {
        failureKey: "e2e:unexpected-failure",
        sourceType: "enqueue",
        status: "open",
        shopId,
        channel: "email",
        dedupeKey: "email:e2e:unexpected-failure",
        notificationContext: "e2e.unexpectedFailure",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "unexpected provider failure",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.testing.resetManagerScenarioData, {
        managerAuthTokenIdentifier: testAuthTokenIdentifier(subject),
      }),
    ).rejects.toThrow("unexpectedFailures=1");

    await expect(
      t.mutation(internal.testing.forceResetManagerScenarioData, {
        managerAuthTokenIdentifier: testAuthTokenIdentifier(subject),
      }),
    ).resolves.toEqual({ reset: true });
    const remaining = await t.run(async (ctx) => ({
      shops: await ctx.db.query("shops").collect(),
      failures: await ctx.db.query("notificationFailureInbox").collect(),
    }));
    expect(remaining).toEqual({ shops: [], failures: [] });
  });

  it("reset前にactive outboxのdedupe重複を検出する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const subject = "manager_duplicate_outbox";
    await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject,
        email: "duplicate-outbox@example.com",
        shopName: "通知重複監査テスト店舗",
      });
      const now = Date.now();
      const baseJob = {
        channel: "email" as const,
        dedupeKey: "email:e2e:duplicate-active",
        shopId,
        payload: {
          kind: "email" as const,
          from: "e2e@shiftori.invalid",
          to: "recipient@example.com",
          subject: "E2E duplicate audit",
          html: "<p>E2E duplicate audit</p>",
          context: "e2e.duplicateAudit",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("notificationOutbox", { ...baseJob, status: "pending" });
      await ctx.db.insert("notificationOutbox", { ...baseJob, status: "processing", processingStartedAt: now });
    });

    await expect(
      t.mutation(internal.testing.resetManagerScenarioData, {
        managerAuthTokenIdentifier: testAuthTokenIdentifier(subject),
      }),
    ).rejects.toThrow("duplicateActiveDedupeKeys=1");
  });

  it("Full Regression監査で管理者の欠落と有効店舗への未所属を件数だけ返す", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const audited = await seedOrganizationManagerShop(ctx, {
        subject: "manager_backend_audit",
        email: "audited@example.com",
        shopName: "E2E監査対象店舗",
      });
      await seedShopMembership(ctx, { userId: audited.userId, shopId: audited.shopId });
      await ctx.db.insert("users", {
        authTokenIdentifier: testAuthTokenIdentifier("manager_without_shop"),
        name: "店舗未所属管理者",
        email: "without-shop@example.com",
        emailNormalized: "without-shop@example.com",
        role: "manager",
        isDeleted: false,
      });
      await seedManagerShop(ctx, {
        subject: "manager_deleted_shop",
        email: "deleted-shop@example.com",
        shopName: "削除済みE2E監査対象店舗",
        shopDeleted: true,
      });
      const { shopId: missingShopId } = await seedManagerShop(ctx, {
        subject: "manager_missing_shop",
        email: "missing-shop@example.com",
        shopName: "欠落E2E監査対象店舗",
      });
      await ctx.db.delete(missingShopId);
    });

    await expect(
      t.query(internal.testing.getE2EBackendAudit, {
        managerEmails: [
          "AUDITED@example.com",
          "without-shop@example.com",
          "deleted-shop@example.com",
          "missing-shop@example.com",
          "missing@example.com",
        ],
      }),
    ).resolves.toMatchObject({
      requestedManagerEmailCount: 5,
      matchedManagerEmailCount: 4,
      missingManagerEmailCount: 1,
      managerEmailWithoutShopCount: 3,
      auditedShopCount: 1,
      auditedOrganizationCount: 1,
      unexpectedUnresolvedFailureInboxCount: 0,
      duplicateActiveDedupeKeyCount: 0,
    });
  });

  it("Full Regression監査でorganization-scopeのactive outbox重複を検出する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "organization_outbox_backend_audit",
        email: "organization-audit@example.com",
        shopName: "組織通知監査対象店舗",
      });
      await seedShopMembership(ctx, { userId: seeded.userId, shopId: seeded.shopId });
      const now = Date.now();
      const baseJob = {
        organizationId: seeded.organizationId,
        purpose: "business" as const,
        channel: "email" as const,
        dedupeKey: "email:e2e:duplicate-organization-active",
        payload: {
          kind: "email" as const,
          from: "e2e@shiftori.invalid",
          to: "organization-audit@example.com",
          subject: "E2E organization duplicate audit",
          html: "<p>E2E organization duplicate audit</p>",
          context: "e2e.organizationDuplicateAudit",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("notificationOutbox", { ...baseJob, status: "pending" });
      await ctx.db.insert("notificationOutbox", { ...baseJob, status: "processing", processingStartedAt: now });
      await ctx.db.insert("notificationOutbox", {
        ...baseJob,
        shopId: seeded.shopId,
        status: "pending",
        dedupeKey: "email:e2e:shop-and-organization-active",
      });

      const foreign = await seedOrganizationManagerShop(ctx, {
        subject: "foreign_organization_outbox_backend_audit",
        email: "foreign-organization-audit@example.com",
        shopName: "対象外組織通知監査店舗",
      });
      const foreignBaseJob = {
        ...baseJob,
        organizationId: foreign.organizationId,
        dedupeKey: "email:e2e:foreign-duplicate-organization-active",
      };
      await ctx.db.insert("notificationOutbox", { ...foreignBaseJob, status: "pending" });
      await ctx.db.insert("notificationOutbox", {
        ...foreignBaseJob,
        status: "processing",
        processingStartedAt: now,
      });
    });

    await expect(
      t.query(internal.testing.getE2EBackendAudit, { managerEmails: ["organization-audit@example.com"] }),
    ).resolves.toMatchObject({
      auditedShopCount: 1,
      auditedOrganizationCount: 1,
      duplicateActiveDedupeKeyCount: 1,
    });
  });

  it("既存manager seedも正規organizationと固定Business entitlementを作る", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const seeded = await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: testAuthTokenIdentifier("canonical_manager_seed"),
      managerEmail: "canonical-manager@example.com",
      dates: {
        periodStart: "2037-04-07",
        periodEnd: "2037-04-13",
        deadline: "2037-04-06",
        dates: ["2037-04-07"],
      },
    });

    const snapshot = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("canonical shop was not seeded");
      const organizationId = shop.organizationId;
      const managerStaff = await ctx.db.get(seeded.staffId);
      if (!managerStaff?.userId) throw new Error("canonical manager staff was not linked");
      const userId = managerStaff.userId;
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
        .collect();
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
        .collect();
      return {
        shop,
        userId,
        organization: await ctx.db.get(organizationId),
        people,
        members,
        managerStaff,
        billing: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique(),
        legacyMembership: await ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId", (q) => q.eq("userId", userId).eq("shopId", seeded.shopId))
          .unique(),
      };
    });

    expect(snapshot.shop).toMatchObject({ operatingStatus: "active", isDeleted: false });
    expect(snapshot.organization).toMatchObject({
      createdByUserId: snapshot.userId,
      billingEmailNormalized: "canonical-manager@example.com",
      isDeleted: false,
    });
    expect(snapshot.people).toEqual([
      expect.objectContaining({ userId: snapshot.userId, emailNormalized: "canonical-manager@example.com" }),
    ]);
    expect(snapshot.members).toEqual([expect.objectContaining({ userId: snapshot.userId, status: "active" })]);
    expect(snapshot.managerStaff).toMatchObject({
      userId: snapshot.userId,
      organizationPersonId: snapshot.people[0]._id,
      emailNormalized: "canonical-manager@example.com",
    });
    expect(snapshot.billing).toMatchObject({ state: { kind: "complimentary", plan: "business" }, version: 1 });
    expect(snapshot.legacyMembership).toMatchObject({ role: "manager", isDeleted: false });
  });

  it("2店舗seedは同一organization配下に識別用personとstaffを作る", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const seeded = await t.mutation(seedMultiShopOrganizationScenarioRef, {
      managerAuthTokenIdentifier: testAuthTokenIdentifier("multi_shop_owner"),
      managerEmail: "multi-shop-owner@example.com",
      organizationName: "2店舗テストグループ",
      primaryShopName: "識別A店",
      secondaryShopName: "識別B店",
    });

    expect(seeded.shopId).toBe(seeded.primaryShopId);
    expect(seeded.organizationId).toBe(seeded.primaryOrganizationId);
    const snapshot = await t.run(async (ctx) => ({
      primaryShop: await ctx.db.get(seeded.primaryShopId),
      secondaryShop: await ctx.db.get(seeded.secondaryShopId),
      ownerPerson: await ctx.db.get(seeded.ownerPersonId),
      primaryMarkerPerson: await ctx.db.get(seeded.primaryMarkerPersonId),
      primaryMarkerStaff: await ctx.db.get(seeded.primaryMarkerStaffId),
      secondaryMarkerPerson: await ctx.db.get(seeded.secondaryMarkerPersonId),
      secondaryMarkerStaff: await ctx.db.get(seeded.secondaryMarkerStaffId),
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique(),
    }));
    expect(snapshot.primaryShop).toMatchObject({
      organizationId: seeded.organizationId,
      operatingStatus: "active",
      name: "識別A店",
    });
    expect(snapshot.secondaryShop).toMatchObject({
      organizationId: seeded.organizationId,
      operatingStatus: "active",
      name: "識別B店",
    });
    expect(snapshot.ownerPerson).toMatchObject({ userId: seeded.userId, status: "active" });
    expect(snapshot.primaryMarkerStaff).toMatchObject({
      shopId: seeded.primaryShopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.primaryMarkerPersonId,
    });
    expect(snapshot.secondaryMarkerStaff).toMatchObject({
      shopId: seeded.secondaryShopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.secondaryMarkerPersonId,
    });
    expect(snapshot.primaryMarkerPerson).toMatchObject({ organizationId: seeded.organizationId, status: "active" });
    expect(snapshot.secondaryMarkerPerson).toMatchObject({ organizationId: seeded.organizationId, status: "active" });
    expect(snapshot.billing).toMatchObject({ state: { kind: "complimentary", plan: "business" } });
  });

  it("3 actor seedをowner起点で再実行可能にresetし、別ownerのgraphは残す", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const args: MultiActorSeedArgs = {
      ownerManagerAuthTokenIdentifier: testAuthTokenIdentifier("multi_actor_owner"),
      ownerManagerEmail: "multi-actor-owner@example.com",
      actorBManagerAuthTokenIdentifier: testAuthTokenIdentifier("multi_actor_b"),
      actorBManagerEmail: "multi-actor-b@example.com",
      actorCManagerAuthTokenIdentifier: testAuthTokenIdentifier("multi_actor_c"),
      actorCManagerEmail: "multi-actor-c@example.com",
      personRemovalAssignments: { today: "2026-07-22", future: "2026-07-23" },
    };
    const seeded = await t.mutation(seedMultiActorOrganizationScenarioRef, args);
    const personRemovalRecruitmentId = seeded.personRemovalRecruitmentId;

    const before = await t.run(async (ctx) => ({
      primaryPerson: await ctx.db.get(seeded.actorBPersonId),
      primaryMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.actorBUserId).eq("organizationId", seeded.primaryOrganizationId),
        )
        .collect(),
      alternateMember: await ctx.db.get(seeded.actorBAlternateMemberId),
      actorCMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", seeded.actorCUserId).eq("status", "active"))
        .collect(),
      personRemovalRecruitment: personRemovalRecruitmentId ? await ctx.db.get(personRemovalRecruitmentId) : null,
      personRemovalAssignments: personRemovalRecruitmentId
        ? await ctx.db
            .query("shiftAssignments")
            .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", personRemovalRecruitmentId))
            .collect()
        : [],
    }));
    expect(before.primaryPerson).toMatchObject({ emailNormalized: args.actorBManagerEmail });
    expect(before.primaryPerson).not.toHaveProperty("userId");
    expect(before.primaryMembers).toEqual([]);
    expect(before.alternateMember).toMatchObject({ userId: seeded.actorBUserId, status: "active" });
    expect(before.actorCMembers).toEqual([]);
    expect(seeded.personRemovalAssignmentCount).toBe(2);
    expect(before.personRemovalRecruitment).toMatchObject({
      shopId: seeded.primaryShopId,
      periodStart: "2026-07-22",
      periodEnd: "2026-07-23",
      status: "confirmed",
    });
    expect(before.personRemovalAssignments.map((assignment) => assignment.date)).toEqual(["2026-07-22", "2026-07-23"]);

    const targetGraph = await t.run(async (ctx) => {
      const now = Date.now();
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: seeded.primaryOrganizationId,
        email: "reset-target@example.com",
        emailNormalized: "reset-target@example.com",
        tokenDigest: "reset-target-digest",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: seeded.ownerMemberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      const outboxId = await ctx.db.insert("notificationOutbox", {
        organizationId: seeded.primaryOrganizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        channel: "email",
        status: "pending",
        dedupeKey: `email:e2e:reset-target:${invitationId}:1`,
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "sender@example.com",
          to: "reset-target@example.com",
          context: "e2e.resetTarget",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const auditEventId = await ctx.db.insert("organizationAuditEvents", {
        organizationId: seeded.primaryOrganizationId,
        actorUserId: seeded.ownerUserId,
        action: "e2e.resetTarget",
        occurredAt: now,
      });
      const organizationCleanupJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId: seeded.primaryOrganizationId,
        requestId: "e2e-reset-target-organization",
        status: "completed",
        phase: "organizationVerification",
        version: 2,
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      const shopCleanupJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId: seeded.primaryShopId,
        organizationId: seeded.primaryOrganizationId,
        requestId: "e2e-reset-target-shop",
        status: "queued",
        phase: "shopCore",
        version: 1,
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { invitationId, outboxId, auditEventId, organizationCleanupJobId, shopCleanupJobId };
    });

    const foreign = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        createdByUserId: seeded.actorBUserId,
        name: "別owner保持グループ",
        billingEmail: args.actorBManagerEmail,
        billingEmailNormalized: args.actorBManagerEmail,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: seeded.actorBUserId,
        name: "別owner管理者B",
        email: args.actorBManagerEmail,
        emailNormalized: args.actorBManagerEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId: seeded.actorBUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "別owner保持店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("shopMembers", {
        shopId,
        userId: seeded.actorBUserId,
        role: "manager",
        isDeleted: false,
      });
      const cleanupJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "e2e-reset-foreign-organization",
        status: "retrying",
        phase: "organizationCore",
        version: 1,
        attemptCount: 1,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { organizationId, personId, memberId, shopId, cleanupJobId };
    });

    const resetArgs = {
      ownerManagerAuthTokenIdentifier: args.ownerManagerAuthTokenIdentifier,
      actorBManagerAuthTokenIdentifier: args.actorBManagerAuthTokenIdentifier,
      actorCManagerAuthTokenIdentifier: args.actorCManagerAuthTokenIdentifier,
    };
    await expect(t.mutation(resetMultiActorOrganizationScenarioDataRef, resetArgs)).resolves.toEqual({ reset: true });
    await expect(t.mutation(resetMultiActorOrganizationScenarioDataRef, resetArgs)).resolves.toEqual({ reset: true });

    const after = await t.run(async (ctx) => ({
      primaryOrganization: await ctx.db.get(seeded.primaryOrganizationId),
      alternateOrganization: await ctx.db.get(seeded.alternateOrganizationId),
      primaryShop: await ctx.db.get(seeded.primaryShopId),
      secondaryShop: await ctx.db.get(seeded.secondaryShopId),
      alternateShop: await ctx.db.get(seeded.alternateShopId),
      actorBPrimaryStaff: await ctx.db.get(seeded.actorBPrimaryStaffId),
      targetInvitation: await ctx.db.get(targetGraph.invitationId),
      targetOutbox: await ctx.db.get(targetGraph.outboxId),
      targetAuditEvent: await ctx.db.get(targetGraph.auditEventId),
      targetOrganizationCleanupJob: await ctx.db.get(targetGraph.organizationCleanupJobId),
      targetShopCleanupJob: await ctx.db.get(targetGraph.shopCleanupJobId),
      primaryBilling: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.primaryOrganizationId))
        .collect(),
      alternateBilling: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.alternateOrganizationId))
        .collect(),
      actorC: await ctx.db.get(seeded.actorCUserId),
      actorB: await ctx.db.get(seeded.actorBUserId),
      foreignOrganization: await ctx.db.get(foreign.organizationId),
      foreignPerson: await ctx.db.get(foreign.personId),
      foreignMember: await ctx.db.get(foreign.memberId),
      foreignShop: await ctx.db.get(foreign.shopId),
      foreignCleanupJob: await ctx.db.get(foreign.cleanupJobId),
    }));
    expect(after).toMatchObject({
      primaryOrganization: null,
      alternateOrganization: null,
      primaryShop: null,
      secondaryShop: null,
      alternateShop: null,
      actorBPrimaryStaff: null,
      targetInvitation: null,
      targetOutbox: null,
      targetAuditEvent: null,
      targetOrganizationCleanupJob: null,
      targetShopCleanupJob: null,
      primaryBilling: [],
      alternateBilling: [],
      actorC: null,
      actorB: expect.objectContaining({ emailNormalized: args.actorBManagerEmail }),
      foreignOrganization: expect.objectContaining({ name: "別owner保持グループ" }),
      foreignPerson: expect.objectContaining({ userId: seeded.actorBUserId }),
      foreignMember: expect.objectContaining({ userId: seeded.actorBUserId }),
      foreignShop: expect.objectContaining({ name: "別owner保持店舗" }),
      foreignCleanupJob: expect.objectContaining({ organizationId: foreign.organizationId, status: "retrying" }),
    });
  });

  it("legacy店舗resetでshop scopeのcleanup jobを次シナリオへ残さない", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const subject = "legacy_cleanup_job_reset";
    const ids = await t.run(async (ctx) => {
      const base = await seedManagerShop(ctx, {
        subject,
        email: "legacy-cleanup-reset@example.com",
        shopName: "旧店舗cleanup reset",
      });
      const now = Date.now();
      const cleanupJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId: base.shopId,
        requestId: "e2e-reset-legacy-shop",
        status: "actionRequired",
        phase: "shopVerification",
        version: 5,
        attemptCount: 8,
        nextRunAt: now,
        lastErrorCode: "test_cleanup_failure",
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, cleanupJobId };
    });

    await expect(
      t.mutation(internal.testing.resetManagerScenarioData, {
        managerAuthTokenIdentifier: testAuthTokenIdentifier(subject),
      }),
    ).resolves.toEqual({ reset: true });

    const remaining = await t.run(async (ctx) => ({
      shop: await ctx.db.get(ids.shopId),
      cleanupJob: await ctx.db.get(ids.cleanupJobId),
    }));
    expect(remaining).toEqual({ shop: null, cleanupJob: null });
  });

  it("Free交代と複数グループの専用seedはAの2グループと既存スタッフBを作り再実行で回収する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const args: FreeManagerMultiOrganizationSeedArgs = {
      actorAManagerAuthTokenIdentifier: testAuthTokenIdentifier("free_multi_actor_a"),
      actorAManagerEmail: "free-multi-a@example.com",
      actorBManagerAuthTokenIdentifier: testAuthTokenIdentifier("free_multi_actor_b"),
      actorBManagerEmail: "free-multi-b@example.com",
      actorCManagerAuthTokenIdentifier: testAuthTokenIdentifier("free_multi_actor_c"),
      targetOrganizationName: "Free交代fixtureグループ",
      targetShopName: "Free交代fixture店舗",
      actorBName: "後任スタッフB",
      alternateOrganizationName: "A継続fixtureグループ",
      alternateShopName: "A継続fixture店舗",
    };
    const first = await t.mutation(seedFreeManagerMultiOrganizationScenarioRef, args);

    const firstSnapshot = await t.run(async (ctx) => {
      const targetMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", first.targetOrganizationId).eq("status", "active"),
        )
        .collect();
      const targetPeople = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", first.targetOrganizationId).eq("status", "active"),
        )
        .collect();
      const targetShops = await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", first.targetOrganizationId))
        .collect();
      const targetStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", first.targetShopId).eq("isDeleted", false))
        .collect();
      const alternateMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", first.alternateOrganizationId).eq("status", "active"),
        )
        .collect();
      const alternateShops = await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", first.alternateOrganizationId))
        .collect();
      const alternateStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", first.alternateShopId).eq("isDeleted", false))
        .collect();
      return {
        targetOrganization: await ctx.db.get(first.targetOrganizationId),
        targetBilling: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", first.targetOrganizationId))
          .unique(),
        targetMembers,
        targetPeople,
        targetShops,
        targetStaffs,
        actorBPerson: await ctx.db.get(first.actorBTargetPersonId),
        alternateOrganization: await ctx.db.get(first.alternateOrganizationId),
        alternateBilling: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", first.alternateOrganizationId))
          .unique(),
        alternateMembers,
        alternateShops,
        alternateStaffs,
      };
    });

    expect(firstSnapshot.targetOrganization).toMatchObject({
      createdByUserId: first.actorAUserId,
      name: args.targetOrganizationName,
      isDeleted: false,
    });
    expect(firstSnapshot.targetBilling).toMatchObject({
      state: { kind: "active", plan: "free" },
      freeManagerPersonId: first.actorATargetPersonId,
      freeShopId: first.targetShopId,
    });
    expect(firstSnapshot.targetMembers.map((member) => member._id)).toEqual([first.actorATargetMemberId]);
    expect(firstSnapshot.targetPeople.map((person) => person._id).sort()).toEqual(
      [first.actorATargetPersonId, first.actorBTargetPersonId].sort(),
    );
    expect(firstSnapshot.targetShops.map((shop) => shop._id)).toEqual([first.targetShopId]);
    expect(firstSnapshot.targetStaffs.map((staff) => staff._id).sort()).toEqual(
      [first.actorATargetStaffId, first.actorBTargetStaffId].sort(),
    );
    expect(firstSnapshot.actorBPerson).toMatchObject({
      organizationId: first.targetOrganizationId,
      name: args.actorBName,
      emailNormalized: args.actorBManagerEmail,
      status: "active",
    });
    expect(firstSnapshot.actorBPerson).not.toHaveProperty("userId");
    expect(firstSnapshot.alternateOrganization).toMatchObject({
      createdByUserId: first.actorAUserId,
      name: args.alternateOrganizationName,
      isDeleted: false,
    });
    expect(firstSnapshot.alternateBilling).toMatchObject({
      state: { kind: "active", plan: "free" },
      freeManagerPersonId: first.actorAAlternatePersonId,
      freeShopId: first.alternateShopId,
    });
    expect(firstSnapshot.alternateMembers.map((member) => member._id)).toEqual([first.actorAAlternateMemberId]);
    expect(firstSnapshot.alternateShops.map((shop) => shop._id)).toEqual([first.alternateShopId]);
    expect(firstSnapshot.alternateStaffs.map((staff) => staff._id)).toEqual([first.actorAAlternateStaffId]);

    const second = await t.mutation(seedFreeManagerMultiOrganizationScenarioRef, args);
    const afterReseed = await t.run(async (ctx) => ({
      firstTargetOrganization: await ctx.db.get(first.targetOrganizationId),
      firstTargetShop: await ctx.db.get(first.targetShopId),
      firstAlternateOrganization: await ctx.db.get(first.alternateOrganizationId),
      firstAlternateShop: await ctx.db.get(first.alternateShopId),
      secondTargetOrganization: await ctx.db.get(second.targetOrganizationId),
      secondAlternateOrganization: await ctx.db.get(second.alternateOrganizationId),
      actorAActiveMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", second.actorAUserId).eq("status", "active"))
        .collect(),
    }));
    expect(afterReseed).toMatchObject({
      firstTargetOrganization: null,
      firstTargetShop: null,
      firstAlternateOrganization: null,
      firstAlternateShop: null,
      secondTargetOrganization: expect.objectContaining({ name: args.targetOrganizationName }),
      secondAlternateOrganization: expect.objectContaining({ name: args.alternateOrganizationName }),
    });
    expect(afterReseed.actorAActiveMembers.map((member) => member.organizationId).sort()).toEqual(
      [second.targetOrganizationId, second.alternateOrganizationId].sort(),
    );

    await expect(
      t.mutation(resetMultiActorOrganizationScenarioDataRef, {
        ownerManagerAuthTokenIdentifier: args.actorAManagerAuthTokenIdentifier,
        actorBManagerAuthTokenIdentifier: args.actorBManagerAuthTokenIdentifier,
        actorCManagerAuthTokenIdentifier: args.actorCManagerAuthTokenIdentifier,
      }),
    ).resolves.toEqual({ reset: true });
    const afterReset = await t.run(async (ctx) => ({
      targetOrganization: await ctx.db.get(second.targetOrganizationId),
      targetShop: await ctx.db.get(second.targetShopId),
      alternateOrganization: await ctx.db.get(second.alternateOrganizationId),
      alternateShop: await ctx.db.get(second.alternateShopId),
      actorA: await ctx.db.get(second.actorAUserId),
    }));
    expect(afterReset).toEqual({
      targetOrganization: null,
      targetShop: null,
      alternateOrganization: null,
      alternateShop: null,
      actorA: null,
    });
  });

  it("organization通知probeはPIIとtokenを返さず、organization-scope CTAを検証する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "e2e-test-signing-secret-that-is-long-enough");
    const t = convexTest(schema, modules);
    const seeded = await t.mutation(seedMultiShopOrganizationScenarioRef, {
      managerAuthTokenIdentifier: testAuthTokenIdentifier("organization_probe_owner"),
      managerEmail: "organization-probe-owner@example.com",
    });
    const fixture = await t.run(async (ctx) => {
      const inviter = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", seeded.organizationId),
        )
        .unique();
      if (!inviter) throw new Error("inviter was not seeded");
      const now = Date.now();
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: seeded.organizationId,
        email: "sensitive-invitee@example.com",
        emailNormalized: "sensitive-invitee@example.com",
        invitedName: "機密招待先",
        tokenDigest: "pending",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: inviter._id,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      const token = await deriveInvitationToken({
        invitationId,
        version: 1,
        signingSecret: "e2e-test-signing-secret-that-is-long-enough",
      });
      const tokenDigest = await digestInvitationToken(token);
      await ctx.db.patch(invitationId, { tokenDigest });
      const invitationDedupeKey = `email:e2e:sensitive-invitee@example.com:${invitationId}:1`;
      await ctx.db.insert("notificationOutbox", {
        organizationId: seeded.organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        channel: "email",
        status: "pending",
        dedupeKey: invitationDedupeKey,
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "sender@example.com",
          to: "sensitive-invitee@example.com",
          context: "organizationInvitation.enqueueManagerInvitation",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        organizationId: seeded.organizationId,
        shopId: seeded.primaryShopId,
        purpose: "business",
        channel: "email",
        status: "pending",
        dedupeKey: `email:e2e:shop-cta:${seeded.primaryShopId}`,
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "organization-probe-owner@example.com",
          subject: "店舗CTA",
          html: `<a href="https://app.example.com/dashboard?shop=${seeded.primaryShopId}">店舗</a>`,
          context: "e2e.shopCta",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        organizationId: seeded.organizationId,
        userId: seeded.userId,
        purpose: "business",
        channel: "email",
        status: "pending",
        dedupeKey: `email:e2e:organization-invitation-linked:${invitationId}:1`,
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "organization-probe-owner@example.com",
          subject: "管理者連携完了",
          html: `<a href="https://app.example.com/settings?shop=${seeded.secondaryShopId}">設定</a>`,
          context: "organizationInvitation.linked",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        organizationId: seeded.organizationId,
        purpose: "business",
        channel: "email",
        status: "pending",
        dedupeKey: `email:e2e:invalid-organization-cta:${invitationId}:1`,
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "organization-probe-owner@example.com",
          subject: "不正CTA",
          html: '<a href="https://app.example.com/settings?shop=not-a-convex-id">設定</a>',
          context: "organizationInvitation.invalidCta",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const unrelatedOrganizationId = await ctx.db.insert("organizations", {
        name: "無関係グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      return {
        invitationId,
        token,
        tokenDigest,
        unrelatedOrganizationId,
        dedupeKeyFingerprint: `sha256:${await digestInvitationToken(invitationDedupeKey)}`,
        recipientUserFingerprint: `sha256:${await digestInvitationToken(seeded.userId)}`,
      };
    });

    const probe = await t.query(getOrganizationNotificationProbeRef, {
      organizationId: seeded.organizationId,
      organizationInvitationId: fixture.invitationId,
      notificationContext: "organizationInvitation.enqueueManagerInvitation",
    });
    expect(probe).toEqual({
      outbox: [
        {
          organizationId: seeded.organizationId,
          organizationInvitationId: fixture.invitationId,
          purpose: "business",
          channel: "email",
          status: "pending",
          notificationContext: "organizationInvitation.enqueueManagerInvitation",
          dedupeKey: fixture.dedupeKeyFingerprint,
          attemptCount: 0,
          deliverySuppressed: true,
          recipientUserFingerprint: null,
          invitationVersionMatchesTarget: true,
          hasRecognizedCta: true,
          ctaTokenMatchesTarget: null,
          ctaShopMatchesTarget: null,
        },
      ],
      duplicateDedupeKeyCount: 0,
    });
    const redacted = JSON.stringify(probe);
    expect(redacted).not.toContain("sensitive-invitee@example.com");
    expect(redacted).not.toContain("機密招待先");
    expect(redacted).not.toContain(fixture.token);
    expect(redacted).not.toContain("<a href=");

    const acceptanceProbe = await t.query(getOrganizationNotificationProbeRef, {
      organizationId: seeded.organizationId,
      expectedShopId: seeded.secondaryShopId,
      notificationContext: "organizationInvitation.linked",
    });
    expect(acceptanceProbe.outbox).toEqual([
      expect.objectContaining({
        hasRecognizedCta: true,
        ctaShopMatchesTarget: true,
        recipientUserFingerprint: fixture.recipientUserFingerprint,
        invitationVersionMatchesTarget: null,
      }),
    ]);
    expect(JSON.stringify(acceptanceProbe)).not.toContain(seeded.userId);
    const wrongShopAcceptanceProbe = await t.query(getOrganizationNotificationProbeRef, {
      organizationId: seeded.organizationId,
      expectedShopId: seeded.primaryShopId,
      notificationContext: "organizationInvitation.linked",
    });
    expect(wrongShopAcceptanceProbe.outbox).toEqual([
      expect.objectContaining({ hasRecognizedCta: true, ctaShopMatchesTarget: false }),
    ]);
    const invalidCtaProbe = await t.query(getOrganizationNotificationProbeRef, {
      organizationId: seeded.organizationId,
      notificationContext: "organizationInvitation.invalidCta",
    });
    expect(invalidCtaProbe.outbox).toEqual([
      expect.objectContaining({ hasRecognizedCta: true, ctaShopMatchesTarget: false }),
    ]);
    const shopCtaProbe = await t.query(internal.testing.getNotificationProbe, {
      shopId: seeded.primaryShopId,
      notificationContext: "e2e.shopCta",
    });
    expect(shopCtaProbe.outbox).toEqual([
      expect.objectContaining({ hasRecognizedCta: true, ctaShopMatchesTarget: true }),
    ]);

    await expect(
      t.query(getManagerInvitationTokenProbeRef, {
        organizationId: seeded.organizationId,
        invitationId: fixture.invitationId,
      }),
    ).resolves.toEqual({
      token: fixture.token,
      invitationId: fixture.invitationId,
      version: 1,
      status: "issued",
      expiresAt: expect.any(Number),
    });
    await expect(
      t.query(getManagerInvitationTokenProbeRef, {
        organizationId: fixture.unrelatedOrganizationId,
        invitationId: fixture.invitationId,
      }),
    ).resolves.toEqual({ token: null, invitationId: null, version: null, status: null, expiresAt: null });

    await t.run(async (ctx) => ctx.db.patch(fixture.invitationId, { tokenDigest: "invalid-digest" }));
    await expect(
      t.query(getManagerInvitationTokenProbeRef, {
        organizationId: seeded.organizationId,
        invitationId: fixture.invitationId,
      }),
    ).resolves.toEqual({ token: null, invitationId: null, version: null, status: null, expiresAt: null });
    await t.run(async (ctx) => ctx.db.patch(fixture.invitationId, { tokenDigest: fixture.tokenDigest }));
  });

  it("raw招待token helperはE2E無効時に拒否する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const seeded = await t.mutation(seedMultiShopOrganizationScenarioRef, {
      managerAuthTokenIdentifier: testAuthTokenIdentifier("disabled_token_probe_owner"),
      managerEmail: "disabled-token-probe-owner@example.com",
    });
    const invitationId = await t.run(async (ctx) => {
      const inviter = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", seeded.organizationId),
        )
        .unique();
      if (!inviter) throw new Error("inviter was not seeded");
      const now = Date.now();
      return await ctx.db.insert("organizationInvitations", {
        organizationId: seeded.organizationId,
        email: "disabled@example.com",
        emailNormalized: "disabled@example.com",
        tokenDigest: "unused",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: inviter._id,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
    });
    vi.stubEnv("E2E_TESTING_ENABLED", "");

    await expect(
      t.query(getManagerInvitationTokenProbeRef, {
        organizationId: seeded.organizationId,
        invitationId,
      }),
    ).rejects.toThrow("E2E testing helpers are disabled");
    await expect(
      t.query(getOrganizationNotificationProbeRef, { organizationId: seeded.organizationId }),
    ).rejects.toThrow("E2E testing helpers are disabled");
    await expect(
      t.mutation(triggerStaffRegistrationManagerDigestScenarioRef, { shopId: seeded.secondaryShopId }),
    ).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("E2E preflightは招待署名秘密値の設定有無だけを返す", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "");
    const t = convexTest(schema, modules);
    await expect(t.query(internal.testing.getE2ESafetyState, {})).resolves.toMatchObject({
      helpersEnabled: true,
      organizationInvitationSigningSecretConfigured: false,
    });

    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "preflight-test-secret-that-is-long-enough");
    await expect(t.query(internal.testing.getE2ESafetyState, {})).resolves.toMatchObject({
      helpersEnabled: true,
      organizationInvitationSigningSecretConfigured: true,
    });
  });
});
