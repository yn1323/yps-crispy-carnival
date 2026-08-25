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
 * m047: runtime authorityではない旧店舗課金rowを、canonical組織課金stateとの対応確認後に物理削除する。
 * 対応を一意に確認できないrowは残し、既存のm028 conflict codeで運用判断へ回す。
 */
export const migration = migrations.define({
  table: "shopBillingStates",
  migrateOne: async (ctx, legacyBillingState) => {
    const sourceId = String(legacyBillingState.shopId);
    const shop = await ctx.db.get(legacyBillingState.shopId);
    if (!shop?.organizationId) {
      await recordConflict(ctx, {
        sourceId,
        code: CONFLICT_CODES.missingOrganizationShop,
      });
      return;
    }
    const organizationId = shop.organizationId;

    const billingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(2);
    if (billingStates.length === 0) {
      await recordConflict(ctx, {
        organizationId,
        sourceId,
        code: CONFLICT_CODES.missingCanonicalBillingState,
      });
      return;
    }
    if (billingStates.length > 1) {
      await recordConflict(ctx, {
        organizationId,
        sourceId,
        code: CONFLICT_CODES.ambiguousCanonicalBillingStates,
      });
      return;
    }

    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shop",
      sourceId,
      codes: OWNED_CONFLICT_CODES,
    });
    await ctx.db.delete(legacyBillingState._id);
  },
});

async function recordConflict(
  ctx: Parameters<typeof recordOrganizationMigrationConflict>[0],
  args: {
    organizationId?: Parameters<typeof recordOrganizationMigrationConflict>[1]["organizationId"];
    sourceId: string;
    code: (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];
  },
) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "shop",
    sourceId: args.sourceId,
    codes: OWNED_CONFLICT_CODES.filter((code) => code !== args.code),
  });
  await recordOrganizationMigrationConflict(ctx, {
    ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    sourceType: "shop",
    sourceId: args.sourceId,
    code: args.code,
  });
}
