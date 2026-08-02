import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingScope: "notification_outbox_missing_scope",
  danglingOrganization: "notification_outbox_dangling_organization",
  danglingShop: "notification_outbox_dangling_shop",
  shopMissingOrganization: "notification_outbox_shop_missing_organization",
  shopDanglingOrganization: "notification_outbox_shop_dangling_organization",
  shopOrganizationMismatch: "notification_outbox_shop_organization_mismatch",
} as const;
const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/**
 * Widen前のshop-scoped Outboxへ、店舗が現在参照するorganizationIdだけを補完する。
 *
 * 既存organizationIdとの矛盾やdangling参照はtenant scopeを推測せず、PIIを持たないconflictへ残す。
 * enqueue時点のsnapshotであるorganizationBillingVersionAtEnqueueは現在値から復元しない。
 */
export const migration = migrations.define({
  table: "notificationOutbox",
  batchSize: 50,
  migrateOne: async (ctx, outbox) => {
    const storedOrganization = outbox.organizationId ? await ctx.db.get(outbox.organizationId) : null;
    const shop = outbox.shopId ? await ctx.db.get(outbox.shopId) : null;
    const shopOrganization = shop?.organizationId ? await ctx.db.get(shop.organizationId) : null;
    const conflictCodes: string[] = [];

    if (!outbox.organizationId && !outbox.shopId) {
      conflictCodes.push(CONFLICT_CODES.missingScope);
    }
    if (outbox.organizationId && !storedOrganization) {
      conflictCodes.push(CONFLICT_CODES.danglingOrganization);
    }
    if (outbox.shopId && !shop) {
      conflictCodes.push(CONFLICT_CODES.danglingShop);
    }
    if (shop && !shop.organizationId) {
      conflictCodes.push(CONFLICT_CODES.shopMissingOrganization);
    }
    if (shop?.organizationId && !shopOrganization) {
      conflictCodes.push(CONFLICT_CODES.shopDanglingOrganization);
    }
    if (outbox.organizationId && shop?.organizationId && outbox.organizationId !== shop.organizationId) {
      conflictCodes.push(CONFLICT_CODES.shopOrganizationMismatch);
    }

    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "notificationOutbox",
      sourceId: outbox._id,
      codes: OWNED_CONFLICT_CODES,
    });
    for (const code of conflictCodes) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: storedOrganization?._id,
        sourceType: "notificationOutbox",
        sourceId: outbox._id,
        code,
      });
    }

    if (conflictCodes.length > 0 || outbox.organizationId || !shopOrganization) return;
    return { organizationId: shopOrganization._id };
  },
});
