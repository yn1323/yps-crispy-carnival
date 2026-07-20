import { recordOrganizationAuditEvent } from "../organization/audit";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingSourceShop: "complimentary_business_missing_source_shop",
  sourceShopOrganizationMismatch: "complimentary_business_source_shop_organization_mismatch",
  ambiguousSourceOrganization: "complimentary_business_ambiguous_source_organization",
  existingBillingState: "complimentary_business_existing_billing_state",
  ambiguousBillingStates: "complimentary_business_ambiguous_billing_states",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/** 旧店舗モデルから移行した事業者へ、課金なしのPro権限を一度だけ付与する。 */
export const migration = migrations.define({
  table: "organizations",
  migrateOne: async (ctx, organization) => {
    const sourceShopId = organization.migrationSourceShopId;
    if (!sourceShopId) return;

    const sourceShop = await ctx.db.get(sourceShopId);
    if (!sourceShop) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: organization._id,
        sourceType: "shop",
        sourceId: sourceShopId,
        code: CONFLICT_CODES.missingSourceShop,
      });
      return;
    }

    if (sourceShop.organizationId !== organization._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: organization._id,
        sourceType: "shop",
        sourceId: sourceShopId,
        code: CONFLICT_CODES.sourceShopOrganizationMismatch,
      });
      return;
    }

    const sourceOrganizations = await ctx.db
      .query("organizations")
      .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", sourceShopId))
      .take(2);
    if (sourceOrganizations.length !== 1 || sourceOrganizations[0]._id !== organization._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: organization._id,
        sourceType: "shop",
        sourceId: sourceShopId,
        code: CONFLICT_CODES.ambiguousSourceOrganization,
      });
      return;
    }

    const billingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
      .take(2);
    if (billingStates.length > 1) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: organization._id,
        sourceType: "shop",
        sourceId: sourceShopId,
        code: CONFLICT_CODES.ambiguousBillingStates,
      });
      return;
    }

    const existingBillingState = billingStates[0];
    if (existingBillingState && existingBillingState.state.kind !== "complimentary") {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: organization._id,
        sourceType: "shop",
        sourceId: sourceShopId,
        code: CONFLICT_CODES.existingBillingState,
      });
      return;
    }

    if (!existingBillingState) {
      const now = Date.now();
      const billingStateId = await ctx.db.insert("organizationBillingStates", {
        organizationId: organization._id,
        state: { kind: "complimentary", plan: "pro" },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      const correlationId = `${organization._id}:migration:m012:complimentary-business`;
      const existingAudits = await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
        .take(1);
      if (existingAudits.length === 0) {
        await recordOrganizationAuditEvent(ctx, {
          organizationId: organization._id,
          action: "organization.billing_state_changed",
          targetKind: "billing",
          targetId: billingStateId,
          toState: "complimentary.pro",
          correlationId,
          occurredAt: now,
        });
      }
    }

    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shop",
      sourceId: sourceShopId,
      codes: OWNED_CONFLICT_CODES,
    });
  },
});
