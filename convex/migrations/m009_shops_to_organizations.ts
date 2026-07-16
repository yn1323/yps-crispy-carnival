import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

/**
 * 既存店舗を一店舗一事業者で移行する。
 *
 * 旧 shopBillingStates は移行先プランを決める根拠に使わない。
 * 既存利用者の初期請求連絡先はプロダクト判断前に推測せず、未設定のままWidenを継続する。
 */
export const migration = migrations.define({
  table: "shops",
  migrateOne: async (ctx, shop) => {
    const initialOperatingStatus = shop.isDeleted ? ("archived" as const) : ("active" as const);

    if (shop.organizationId) {
      const organization = await ctx.db.get(shop.organizationId);
      if (organization) {
        const migrationSourceOrganizations = await ctx.db
          .query("organizations")
          .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", shop._id))
          .take(2);
        if (
          migrationSourceOrganizations.length > 1 ||
          (migrationSourceOrganizations[0] && migrationSourceOrganizations[0]._id !== organization._id)
        ) {
          await recordOrganizationMigrationConflict(ctx, {
            organizationId: organization._id,
            sourceType: "shop",
            sourceId: shop._id,
            code: "ambiguous_migration_source_organization",
          });
          return;
        }
        // canonical lifecycleは課金・運用mutationの正本。migrationは未設定だけを補完する。
        if (shop.operatingStatus === undefined)
          await ctx.db.patch(shop._id, { operatingStatus: initialOperatingStatus });
        await resolveOrganizationMigrationConflicts(ctx, { sourceType: "shop", sourceId: shop._id });
        return;
      }
      await recordOrganizationMigrationConflict(ctx, {
        sourceType: "shop",
        sourceId: shop._id,
        code: "dangling_organization_id",
      });
    }

    const existingOrganizations = await ctx.db
      .query("organizations")
      .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", shop._id))
      .take(2);
    if (existingOrganizations.length > 1) {
      await recordOrganizationMigrationConflict(ctx, {
        sourceType: "shop",
        sourceId: shop._id,
        code: "ambiguous_migration_source_organization",
      });
      return;
    }
    const existingOrganization = existingOrganizations[0] ?? null;
    if (existingOrganization) {
      await ctx.db.patch(shop._id, {
        organizationId: existingOrganization._id,
        ...(shop.operatingStatus === undefined ? { operatingStatus: initialOperatingStatus } : {}),
      });
      await resolveOrganizationMigrationConflicts(ctx, { sourceType: "shop", sourceId: shop._id });
      return;
    }

    let creator = null;
    const memberships = ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false));
    for await (const membership of memberships) {
      const user = await ctx.db.get(membership.userId);
      if (user && !user.isDeleted) {
        creator = user;
        break;
      }
    }

    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      createdByUserId: creator?._id,
      migrationSourceShopId: shop._id,
      name: shop.name,
      isDeleted: shop.isDeleted,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(shop._id, {
      organizationId,
      ...(shop.operatingStatus === undefined ? { operatingStatus: initialOperatingStatus } : {}),
    });
    await resolveOrganizationMigrationConflicts(ctx, { sourceType: "shop", sourceId: shop._id });
  },
});
