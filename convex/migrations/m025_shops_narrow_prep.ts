import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ORGANIZATION_NAME_SUFFIX } from "../constants";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const OWNED_CONFLICT_CODES = ["ambiguous_migration_source_organization", "dangling_organization_id"] as const;
const BILLING_CONFLICT_CODES = [
  "narrow_prep_ambiguous_source_organization",
  "narrow_prep_ambiguous_billing_states",
  "narrow_prep_existing_organization_missing_billing_state",
  "narrow_prep_stripe_mapping_evidence",
] as const;

const historicalComplimentaryBusinessState = () =>
  ({ kind: "complimentary", plan: "business" }) as unknown as Doc<"organizationBillingStates">["state"];

/**
 * 既存店舗を一店舗一事業者で移行する。
 *
 * 旧 shopBillingStates は移行先プランを決める根拠に使わない。
 * 既存利用者の初期請求連絡先はプロダクト判断前に推測せず、未設定のままWidenを継続する。
 */
export async function migrateShopToOrganization(ctx: Pick<MutationCtx, "db">, shop: Doc<"shops">) {
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
      if (shop.operatingStatus === undefined) await ctx.db.patch(shop._id, { operatingStatus: initialOperatingStatus });
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "shop",
        sourceId: shop._id,
        codes: OWNED_CONFLICT_CODES,
      });
      return { organizationId: organization._id, created: false } as const;
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
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shop",
      sourceId: shop._id,
      codes: OWNED_CONFLICT_CODES,
    });
    return { organizationId: existingOrganization._id, created: false } as const;
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
    name: `${shop.name}${ORGANIZATION_NAME_SUFFIX}`,
    isDeleted: shop.isDeleted,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(shop._id, {
    organizationId,
    ...(shop.operatingStatus === undefined ? { operatingStatus: initialOperatingStatus } : {}),
  });
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "shop",
    sourceId: shop._id,
    codes: OWNED_CONFLICT_CODES,
  });
  return { organizationId, created: true } as const;
}

async function ensureLateMigratedOrganizationBilling(
  ctx: MutationCtx,
  shopId: Doc<"shops">["_id"],
  createdOrganizationId: Doc<"organizations">["_id"] | null,
) {
  const shop = await ctx.db.get(shopId);
  if (!shop?.organizationId) return;
  const organizationId = shop.organizationId;
  const organization = await ctx.db.get(organizationId);
  if (!organization || organization.migrationSourceShopId !== shopId) return;

  const sourceOrganizations = await ctx.db
    .query("organizations")
    .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", shopId))
    .take(2);
  if (sourceOrganizations.length !== 1 || sourceOrganizations[0]._id !== organizationId) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shop",
      sourceId: shopId,
      code: "narrow_prep_ambiguous_source_organization",
    });
    return;
  }

  const billingStates = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(2);
  if (billingStates.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shop",
      sourceId: shopId,
      code: "narrow_prep_ambiguous_billing_states",
    });
    return;
  }
  // 一意な既存stateは、その後の正規課金遷移を含むcanonical authorityとして保全する。
  if (billingStates.length === 1) {
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shop",
      sourceId: shopId,
      codes: BILLING_CONFLICT_CODES,
    });
    return;
  }
  if (createdOrganizationId !== organizationId) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shop",
      sourceId: shopId,
      code: "narrow_prep_existing_organization_missing_billing_state",
    });
    return;
  }

  const [stripeCustomers, stripeSubscriptions] = await Promise.all([
    ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(1),
    ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
      .take(1),
  ]);
  if (stripeCustomers.length > 0 || stripeSubscriptions.length > 0) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shop",
      sourceId: shopId,
      code: "narrow_prep_stripe_mapping_evidence",
    });
    return;
  }

  const now = Date.now();
  const billingStateId = await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: historicalComplimentaryBusinessState(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingStateId,
    toState: "complimentary.business",
    correlationId: `${organizationId}:migration:m025:complimentary-business`,
    occurredAt: now,
  });

  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "shop",
    sourceId: shopId,
    codes: BILLING_CONFLICT_CODES,
  });
}

async function repairLateLegacyShop(ctx: MutationCtx, shop: Doc<"shops">) {
  const result = await migrateShopToOrganization(ctx, shop);
  await ensureLateMigratedOrganizationBilling(ctx, shop._id, result?.created ? result.organizationId : null);
}

export const migration = migrations.define({
  table: "shops",
  migrateOne: repairLateLegacyShop,
});
