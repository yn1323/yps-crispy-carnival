import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  canonicalPlanWithoutVersion: "stripe_operation_plan_ids_v2_canonical_plan_without_version",
  legacyPlanWithVersion: "stripe_operation_plan_ids_v2_legacy_plan_with_version",
} as const;
const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/** Stripe operation snapshotのsource/target plan IDを保存済みmarkerの意味に従ってv2へ揃える。 */
export const migration = migrations.define({
  table: "organizationStripeOperations",
  migrateOne: async (ctx, operation) => {
    const sourceId = String(operation._id);
    const plans = [operation.sourcePlan, operation.targetPlan];
    if (operation.planIdVersion === 2) {
      if (plans.includes("business")) {
        await recordConflict(ctx, {
          organizationId: operation.organizationId,
          sourceId,
          code: CONFLICT_CODES.legacyPlanWithVersion,
        });
        return;
      }
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organizationStripeOperation",
        sourceId,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }
    if (plans.includes("standard")) {
      await recordConflict(ctx, {
        organizationId: operation.organizationId,
        sourceId,
        code: CONFLICT_CODES.canonicalPlanWithoutVersion,
      });
      return;
    }

    await ctx.db.patch(operation._id, {
      sourcePlan: canonicalizeLegacyPaidPlan(operation.sourcePlan),
      targetPlan: canonicalizeLegacyTarget(operation.targetPlan),
      planIdVersion: 2,
    });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organizationStripeOperation",
      sourceId,
      codes: OWNED_CONFLICT_CODES,
    });
  },
});

function canonicalizeLegacyPaidPlan(plan: "standard" | "pro" | "business" | undefined) {
  if (plan === undefined || plan === "standard") return plan;
  return plan === "pro" ? ("standard" as const) : ("pro" as const);
}

function canonicalizeLegacyTarget(plan: "free" | "standard" | "pro" | "business" | undefined) {
  if (plan === undefined || plan === "free" || plan === "standard") return plan;
  return plan === "pro" ? ("standard" as const) : ("pro" as const);
}

async function recordConflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    sourceId: string;
    code: (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];
  },
) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "organizationStripeOperation",
    sourceId: args.sourceId,
    codes: OWNED_CONFLICT_CODES.filter((code) => code !== args.code),
  });
  await recordOrganizationMigrationConflict(ctx, {
    organizationId: args.organizationId,
    sourceType: "organizationStripeOperation",
    sourceId: args.sourceId,
    code: args.code,
  });
}
