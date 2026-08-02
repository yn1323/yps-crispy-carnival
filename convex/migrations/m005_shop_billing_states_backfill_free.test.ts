import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedLegacyShop } from "../_test/seed";

describe("m005_shop_billing_states_backfill_free", () => {
  it("既存店舗のfree課金状態を作り、既存行は上書きしない", async () => {
    const t = createConvexTestWithMigrations();
    const { freeShopId, premiumShopId } = await t.run(async (ctx) => {
      const freeShopId = await seedLegacyShop(ctx, "既存フリー店舗");
      const premiumShopId = await seedLegacyShop(ctx, "既存プレミアム店舗");
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
