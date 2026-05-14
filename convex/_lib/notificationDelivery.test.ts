import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { isDryRunManagerEmail, isNotificationDeliverySuppressed } from "./notificationDelivery";

describe("isNotificationDeliverySuppressed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not suppress delivery just because E2E testing helpers are enabled", () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");

    expect(isNotificationDeliverySuppressed()).toBe(false);
  });

  it.each(["dry-run", "disabled", "mock"])("suppresses delivery when NOTIFICATION_DELIVERY_MODE=%s", (mode) => {
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", mode);

    expect(isNotificationDeliverySuppressed()).toBe(true);
  });

  it("allows delivery when suppression envs are not set", () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "");

    expect(isNotificationDeliverySuppressed()).toBe(false);
  });

  it("suppresses delivery when the caller opts in", () => {
    expect(isNotificationDeliverySuppressed({ suppressDelivery: true })).toBe(true);
  });
});

describe("isDryRunManagerEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches NOTIFICATION_DRY_RUN_USER_EMAILS entries as case-insensitive substrings after trimming", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "e2e-user-1@test.com, Test2@example.com ");

    expect(isDryRunManagerEmail(" e2e-user-1@test.com ")).toBe(true);
    expect(isDryRunManagerEmail(" preview-e2e-user-1@test.com ")).toBe(true);
    expect(isDryRunManagerEmail(" TEST2@example.com ")).toBe(true);
  });

  it("matches manager email domains listed in NOTIFICATION_DRY_RUN_USER_EMAILS", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com,example.net");

    expect(isDryRunManagerEmail("manager@example.com")).toBe(true);
  });

  it("matches manager email domains with an @ prefix", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@example.com");

    expect(isDryRunManagerEmail("manager@example.com")).toBe(true);
  });

  it("does not match manager emails outside NOTIFICATION_DRY_RUN_USER_EMAILS", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "e2e-user-1@test.com,test2");

    expect(isDryRunManagerEmail("manager@example.com")).toBe(false);
  });
});

describe("isNotificationDeliverySuppressedForShop", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when the shop manager's users.email domain is configured for dry-run", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com,test2");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_1",
        email: "manager@example.com",
        shopName: "Shop",
      });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });

  it("returns false when the shop manager's users.email is not configured for dry-run", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "e2e-user-1@test.com,test2");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_2",
        email: "manager@example.com",
        shopName: "Shop",
      });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(false);
  });
});

describe("E2E manager seed email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores the provided E2E manager email on users.email but keeps the manager staff email unchanged", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.testing.seedLineLinkScenario, {
      managerAuthTokenIdentifier: "manager_e2e",
      managerEmail: "e2e-user-1@test.com",
    });

    const stored = await t.run(async (ctx) => {
      const manager = await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "manager_e2e"))
        .first();
      const staff = await ctx.db.get(result.staffId);
      return { managerEmail: manager?.email, staffEmail: staff?.email };
    });

    expect(stored).toEqual({ managerEmail: "e2e-user-1@test.com", staffEmail: "tanaka@example.com" });
  });
});
