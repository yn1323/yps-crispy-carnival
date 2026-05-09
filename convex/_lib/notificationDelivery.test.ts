import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";
import { isDryRunOwnerEmail, isNotificationDeliverySuppressed } from "./notificationDelivery";

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

describe("isDryRunOwnerEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches NOTIFICATION_DRY_RUN_USER_EMAILS entries as case-insensitive substrings after trimming", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "testtest, Test2@example.com ");

    expect(isDryRunOwnerEmail(" testtest ")).toBe(true);
    expect(isDryRunOwnerEmail(" testtest@example.com ")).toBe(true);
    expect(isDryRunOwnerEmail(" TEST2@example.com ")).toBe(true);
  });

  it("matches owner email domains listed in NOTIFICATION_DRY_RUN_USER_EMAILS", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com,example.net");

    expect(isDryRunOwnerEmail("manager@example.com")).toBe(true);
  });

  it("matches owner email domains with an @ prefix", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "@example.com");

    expect(isDryRunOwnerEmail("manager@example.com")).toBe(true);
  });

  it("does not match owner emails outside NOTIFICATION_DRY_RUN_USER_EMAILS", () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "testtest,test2");

    expect(isDryRunOwnerEmail("manager@example.com")).toBe(false);
  });
});

describe("isNotificationDeliverySuppressedForShop", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when the shop owner's users.email domain is configured for dry-run", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com,test2");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "owner_1",
        name: "Owner",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      return await ctx.db.insert("shops", {
        name: "Shop",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "owner_1",
        isDeleted: false,
      });
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });

  it("returns false when the shop owner's users.email is not configured for dry-run", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "testtest,test2");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "owner_2",
        name: "Owner",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      return await ctx.db.insert("shops", {
        name: "Shop",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "owner_2",
        isDeleted: false,
      });
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(false);
  });
});

describe("E2E owner seed email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores the provided E2E owner email on users.email but keeps the manager staff email unchanged", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.testing.seedLineLinkScenario, {
      ownerId: "owner_e2e",
      ownerEmail: "testtest",
    });

    const stored = await t.run(async (ctx) => {
      const owner = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "owner_e2e"))
        .first();
      const staff = await ctx.db.get(result.staffId);
      return { ownerEmail: owner?.email, staffEmail: staff?.email };
    });

    expect(stored).toEqual({ ownerEmail: "testtest", staffEmail: "tanaka@example.com" });
  });
});
