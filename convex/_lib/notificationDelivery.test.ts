import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  getNotificationDeliveryBehavior,
  isNotificationDeliveryFailureForced,
  isNotificationDeliverySuppressed,
  isNotificationProviderAccessSuppressed,
} from "./notificationDelivery";

describe("notificationDelivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("DEBUG_MODEだけでは通知動作を変更しない", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");

    expect(getNotificationDeliveryBehavior()).toBe("live");
    expect(isNotificationDeliverySuppressed()).toBe(false);
    expect(isNotificationDeliveryFailureForced()).toBe(false);
    expect(isNotificationProviderAccessSuppressed()).toBe(false);
  });

  it("dry-runは通知と付随するprovider参照を抑止する", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "dry-run");

    expect(getNotificationDeliveryBehavior()).toBe("dry-run");
    expect(isNotificationDeliverySuppressed()).toBe(true);
    expect(isNotificationDeliveryFailureForced()).toBe(false);
    expect(isNotificationProviderAccessSuppressed()).toBe(true);
  });

  it("明示suppressDeliveryはlive環境でもdry-runとして扱う", () => {
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");

    expect(getNotificationDeliveryBehavior({ suppressDelivery: true })).toBe("dry-run");
    expect(isNotificationDeliverySuppressed({ suppressDelivery: true })).toBe(true);
  });

  it("force-failureは明示suppressDeliveryより優先する", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "force-failure");

    expect(getNotificationDeliveryBehavior({ suppressDelivery: true })).toBe("force-failure");
    expect(isNotificationDeliverySuppressed({ suppressDelivery: true })).toBe(false);
    expect(isNotificationDeliveryFailureForced({ suppressDelivery: true })).toBe(true);
    expect(isNotificationProviderAccessSuppressed()).toBe(true);
  });

  it("店舗別queryもmanager emailを走査せずglobal dry-runだけを返す", async () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "dry-run");
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "notification_delivery_manager",
        email: "manager@real.example",
      });
      return seeded.shopId;
    });

    await expect(
      t.query(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, { shopId }),
    ).resolves.toBe(true);
  });
});

describe("E2E manager seed email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores the provided E2E manager email on both the owner user and canonical manager staff", async () => {
    vi.stubEnv("DEBUG_MODE", "true");
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
