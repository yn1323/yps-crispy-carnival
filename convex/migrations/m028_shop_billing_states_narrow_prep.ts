import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganizationShop: "legacy_billing_missing_organization_shop",
  missingCanonicalBillingState: "legacy_billing_missing_canonical_billing_state",
  ambiguousCanonicalBillingStates: "legacy_billing_ambiguous_canonical_billing_states",
} as const;
const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/**
 * 旧店舗課金rowを削除せず、canonical課金authorityとの対応だけを監査する。
 * 物理削除はreader/fallback撤去と全deployment readiness確認後の別migrationで行う。
 */
export const migration = migrations.define({
  table: "shopBillingStates",
  migrateOne: async (ctx, legacyBillingState) => {
    const shop = await ctx.db.get(legacyBillingState.shopId);
    if (!shop?.organizationId) {
      await recordOrganizationMigrationConflict(ctx, {
        sourceType: "shop",
        sourceId: legacyBillingState.shopId,
        code: CONFLICT_CODES.missingOrganizationShop,
      });
      return;
    }
    const organizationId = shop.organizationId;
    const organizationBillingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(2);
    if (organizationBillingStates.length === 0) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shop",
        sourceId: legacyBillingState.shopId,
        code: CONFLICT_CODES.missingCanonicalBillingState,
      });
      return;
    }
    if (organizationBillingStates.length > 1) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shop",
        sourceId: legacyBillingState.shopId,
        code: CONFLICT_CODES.ambiguousCanonicalBillingStates,
      });
      return;
    }
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shop",
      sourceId: legacyBillingState.shopId,
      codes: OWNED_CONFLICT_CODES,
    });
  },
});
