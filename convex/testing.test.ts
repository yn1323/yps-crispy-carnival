import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { seedManagerShop, testAuthTokenIdentifier } from "./_test/seed";
import { modules, schema } from "./_test/setup.test-helper";

describe("E2E testing helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects clearAllTables when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.clearAllTables, {})).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("allows clearAllTables when E2E testing helpers are enabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authTokenIdentifier: "manager_test",
        name: "Test Manager",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
    });

    await expect(t.mutation(internal.testing.clearAllTables, {})).resolves.toEqual(
      expect.objectContaining({ cleared: expect.arrayContaining(["users"]) }),
    );
    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it("rejects direct seed helpers when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.seedSubmitTestData, {})).rejects.toThrow(
      "E2E testing helpers are disabled",
    );
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
      await seedManagerShop(ctx, {
        subject: "manager_backend_audit",
        email: "audited@example.com",
        shopName: "E2E監査対象店舗",
      });
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
      unexpectedUnresolvedFailureInboxCount: 0,
      duplicateActiveDedupeKeyCount: 0,
    });
  });
});
