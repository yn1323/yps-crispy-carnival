import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationMembership,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT } from "../constants";
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
      const seeded = await seedOrganizationManagerShop(ctx, {
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
      const seeded = await seedOrganizationManagerShop(ctx, {
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

  it.each(["allowlisted-first", "real-first"] as const)(
    "mixed managersでは挿入順が%sでもdry-runにしない",
    async (order) => {
      vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: `manager_mixed_primary_${order}`,
          email: order === "allowlisted-first" ? "preview@test.example" : "owner@real.example",
          shopName: "Mixed managers",
        });
        const secondUserId = await seedUser(
          ctx,
          `manager_mixed_secondary_${order}`,
          order === "allowlisted-first" ? "owner@real.example" : "preview@test.example",
        );
        await seedOrganizationMembership(ctx, { userId: secondUserId, shopId: seeded.shopId });
        return seeded.shopId;
      });

      await expect(
        t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
      ).resolves.toBe(false);
    },
  );

  it("active manager全員がallowlistに一致するとdry-runにする", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_all_allowlisted_primary",
        email: "preview-1@test.example",
      });
      const secondUserId = await seedUser(ctx, "manager_all_allowlisted_secondary", "preview-2@test.example");
      await seedOrganizationMembership(ctx, { userId: secondUserId, shopId: seeded.shopId });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });

  it("m010処理途中はcanonical所属がない旧managerだけを通知判定へ補う", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_partial_primary",
        email: "preview-primary@test.example",
      });
      const legacyUserId = await seedUser(ctx, "manager_partial_legacy", "preview-legacy@test.example");
      await seedLegacyShopMembership(ctx, { userId: legacyUserId, shopId: seeded.shopId });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });

  it("active managerが走査上限を超える場合は全員allowlistでもdry-runにしない", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_overflow_primary",
        email: "preview-primary@test.example",
      });
      for (let index = 1; index <= NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT; index += 1) {
        const userId = await seedUser(ctx, `manager_overflow_${index}`, `preview-${index}@test.example`);
        await seedOrganizationMembership(ctx, { userId, shopId: seeded.shopId });
      }
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(false);
  });

  it("削除済みmanagerを除いたactive manager全員がallowlistならdry-runにする", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_removed_primary",
        email: "preview@test.example",
      });
      const removedUserId = await seedUser(ctx, "manager_removed_secondary", "owner@real.example");
      await seedOrganizationMembership(ctx, { userId: removedUserId, shopId: seeded.shopId, isDeleted: true });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });

  it("active managerがいない店舗はdry-runにしない", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_none",
        email: "preview@test.example",
        membershipDeleted: true,
      });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(false);
  });

  it("canonical所属がremovedならactiveな旧所属が残っていてもdry-run managerとして復活させない", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@test.example");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "manager_canonical_removed",
        email: "preview@test.example",
        shopName: "Canonical removed manager",
      });
      await ctx.db.patch(seeded.memberId, { status: "removed", updatedAt: Date.now() });
      await seedLegacyShopMembership(ctx, { userId: seeded.userId, shopId: seeded.shopId });
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

  it("stores the provided E2E manager email on both the owner user and canonical manager staff", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://e2e-test.convex.cloud");
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

    expect(stored).toEqual({ managerEmail: "e2e-user-1@test.com", staffEmail: "e2e-user-1@test.com" });
  });
});
