import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getShopBillingState, getShopEntitlements, requirePaidFeature } from "./service";

describe("billing/service", () => {
  it("課金状態行がない店舗はfreeとして扱う", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "課金未作成店舗");
      return await getShopBillingState(ctx, shopId);
    });

    expect(result).toMatchObject({
      planKey: "free",
      source: "system",
      createdAt: null,
      updatedAt: null,
    });
  });

  it("freeは有料機能を利用できない", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "フリー店舗");
      return await getShopEntitlements(ctx, shopId);
    });

    expect(result).toEqual({
      planKey: "free",
      planLabel: "フリー",
      canUsePaidFeatures: false,
      maxStaffCount: 10,
      isStaffLimitEnforced: false,
    });
  });

  it("standardとpremiumは有料機能を利用できる", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const standardShopId = await seedShop(ctx, "スタンダード店舗");
      const premiumShopId = await seedShop(ctx, "プレミアム店舗");
      const now = Date.now();
      await ctx.db.insert("shopBillingStates", {
        shopId: standardShopId,
        planKey: "standard",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("shopBillingStates", {
        shopId: premiumShopId,
        planKey: "premium",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });

      return {
        standard: await getShopEntitlements(ctx, standardShopId),
        premium: await getShopEntitlements(ctx, premiumShopId),
      };
    });

    expect(result.standard).toMatchObject({
      planKey: "standard",
      planLabel: "スタンダード",
      canUsePaidFeatures: true,
      maxStaffCount: 20,
      isStaffLimitEnforced: false,
    });
    expect(result.premium).toMatchObject({
      planKey: "premium",
      planLabel: "プレミアム",
      canUsePaidFeatures: true,
      maxStaffCount: 30,
      isStaffLimitEnforced: false,
    });
  });

  it("requirePaidFeatureはfreeで失敗し、有料プランで通る", async () => {
    const t = convexTest(schema, modules);
    const { freeShopId, paidShopId } = await t.run(async (ctx) => {
      const freeShopId = await seedShop(ctx, "フリー店舗");
      const paidShopId = await seedShop(ctx, "有料店舗");
      const now = Date.now();
      await ctx.db.insert("shopBillingStates", {
        shopId: paidShopId,
        planKey: "standard",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      return { freeShopId, paidShopId };
    });

    await expect(t.run((ctx) => requirePaidFeature(ctx, freeShopId))).rejects.toThrow(ConvexError);
    await expect(t.run((ctx) => requirePaidFeature(ctx, paidShopId))).resolves.toMatchObject({
      planKey: "standard",
      canUsePaidFeatures: true,
    });
  });

  it("既存店舗のfree課金状態をmigrationで作り、既存行は上書きしない", async () => {
    const t = convexTest(schema, modules);
    const { freeShopId, premiumShopId } = await t.run(async (ctx) => {
      const freeShopId = await seedShop(ctx, "既存フリー店舗");
      const premiumShopId = await seedShop(ctx, "既存プレミアム店舗");
      await ctx.db.insert("shopBillingStates", {
        shopId: premiumShopId,
        planKey: "premium",
        source: "manual",
        createdAt: 100,
        updatedAt: 200,
      });
      return { freeShopId, premiumShopId };
    });

    await t.mutation(internal.migrations.m005_shop_billing_states_backfill_free.migration, {
      cursor: null,
      dryRun: false,
    });

    const states = await t.run(async (ctx) => ({
      free: await ctx.db
        .query("shopBillingStates")
        .withIndex("by_shopId", (q) => q.eq("shopId", freeShopId))
        .unique(),
      premium: await ctx.db
        .query("shopBillingStates")
        .withIndex("by_shopId", (q) => q.eq("shopId", premiumShopId))
        .unique(),
    }));

    expect(states.free).toMatchObject({
      shopId: freeShopId,
      planKey: "free",
      source: "system",
    });
    expect(states.premium).toMatchObject({
      shopId: premiumShopId,
      planKey: "premium",
      source: "manual",
      createdAt: 100,
      updatedAt: 200,
    });
  });
});
