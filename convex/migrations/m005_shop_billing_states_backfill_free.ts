import { migrations } from "./index";

export const migration = migrations.define({
  table: "shops",
  migrateOne: async (ctx, shop) => {
    const existing = await ctx.db
      .query("shopBillingStates")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .first();
    if (existing) return;

    const now = Date.now();
    await ctx.db.insert("shopBillingStates", {
      shopId: shop._id,
      planKey: "free",
      source: "system",
      createdAt: now,
      updatedAt: now,
    });
  },
});
