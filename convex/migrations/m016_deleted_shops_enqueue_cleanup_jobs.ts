import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { migrations } from "./index";

/** 既存の削除済み店舗へ、決定的なkeyでaccess失効jobを一件だけ作る。 */
export const migration = migrations.define({
  table: "shops",
  batchSize: 50,
  migrateOne: async (ctx, shop) => {
    if (!shop.isDeleted) return;
    if (shop.organizationId) {
      const organization = await ctx.db.get(shop.organizationId);
      if (organization?.isDeleted) return;
    }
    await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId: shop._id,
      ...(shop.organizationId ? { organizationId: shop.organizationId } : {}),
      requestId: `migration:m016:${shop._id}`,
    });
  },
});
