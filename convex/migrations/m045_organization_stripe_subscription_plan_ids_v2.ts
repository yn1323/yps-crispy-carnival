import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const SUBSCRIPTION_CONFLICT_CODES = {
  canonicalPlanWithoutVersion: "stripe_subscription_plan_ids_v2_canonical_plan_without_version",
  legacyPlanWithVersion: "stripe_subscription_plan_ids_v2_legacy_plan_with_version",
} as const;

const SUBSCRIPTION_CODES = Object.values(SUBSCRIPTION_CONFLICT_CODES);

/** Stripe Subscription snapshotのplan IDを、保存済みmarkerの意味に従ってv2へ揃える。 */
export const migration = migrations.define({
  table: "organizationStripeSubscriptions",
  migrateOne: async (ctx, subscription) => {
    const sourceId = String(subscription._id);
    if (subscription.planIdVersion === 2) {
      if (subscription.plan === "business") {
        await recordConflict(ctx, {
          organizationId: subscription.organizationId,
          sourceType: "organizationStripeSubscription",
          sourceId,
          code: SUBSCRIPTION_CONFLICT_CODES.legacyPlanWithVersion,
          ownedCodes: SUBSCRIPTION_CODES,
        });
        return;
      }
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organizationStripeSubscription",
        sourceId,
        codes: SUBSCRIPTION_CODES,
      });
      return;
    }
    if (subscription.plan === "standard") {
      await recordConflict(ctx, {
        organizationId: subscription.organizationId,
        sourceType: "organizationStripeSubscription",
        sourceId,
        code: SUBSCRIPTION_CONFLICT_CODES.canonicalPlanWithoutVersion,
        ownedCodes: SUBSCRIPTION_CODES,
      });
      return;
    }

    await ctx.db.patch(subscription._id, {
      plan: subscription.plan === undefined ? undefined : subscription.plan === "pro" ? "standard" : "pro",
      planIdVersion: 2,
    });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organizationStripeSubscription",
      sourceId,
      codes: SUBSCRIPTION_CODES,
    });
  },
});

async function recordConflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    sourceType: "organizationStripeSubscription";
    sourceId: string;
    code: string;
    ownedCodes: readonly string[];
  },
) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    codes: args.ownedCodes.filter((code) => code !== args.code),
  });
  await recordOrganizationMigrationConflict(ctx, args);
}
