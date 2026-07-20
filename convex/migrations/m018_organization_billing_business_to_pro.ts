import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleOrganizationBillingStateDeadline } from "../organizationBilling/deadline";
import { hasLegacyBusinessBillingState, normalizeOrganizationBillingState } from "../organizationBilling/policy";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const DUPLICATE_BILLING_STATES_CONFLICT = "billing_business_to_pro_ambiguous_billing_states";

/**
 * Collapses persisted Business variants into Pro while keeping validators wide
 * until the migration has completed in every deployment.
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    const organizationBillingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", billingState.organizationId))
      .take(2);
    if (organizationBillingStates.length !== 1 || organizationBillingStates[0]._id !== billingState._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: billingState.organizationId,
        sourceType: "organization",
        sourceId: billingState.organizationId,
        code: DUPLICATE_BILLING_STATES_CONFLICT,
      });
      return;
    }
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organization",
      sourceId: billingState.organizationId,
      codes: [DUPLICATE_BILLING_STATES_CONFLICT],
    });

    const normalizedState = normalizeOrganizationBillingState(billingState.state);
    const shouldNormalize = hasLegacyBusinessBillingState(billingState.state);
    const nextVersion = shouldNormalize ? billingState.version + 1 : billingState.version;

    if (shouldNormalize) {
      const updatedAt = Date.now();
      await ctx.db.patch(billingState._id, {
        state: normalizedState,
        version: nextVersion,
        updatedAt,
      });
      await cancelPendingLegacyBusinessBillingNotifications(ctx, billingState.organizationId, updatedAt);
      await scheduleOrganizationBillingStateDeadline(ctx, {
        organizationId: billingState.organizationId,
        state: normalizedState,
        version: nextVersion,
      });
    }

    if (
      normalizedState.kind === "restricted" &&
      (normalizedState.reason === "trialFreeConditionsNotMet" || normalizedState.reason === "freeConditionsNotMet")
    ) {
      await ctx.scheduler.runAfter(0, internal.organizationBilling.mutations.reconcileRestrictedFreeEligibility, {
        billingStateId: billingState._id,
        expectedVersion: nextVersion,
      });
    }
  },
});

async function cancelPendingLegacyBusinessBillingNotifications(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  updatedAt: number,
) {
  const jobs = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_organizationId_purpose_status", (q) =>
      q.eq("organizationId", organizationId).eq("purpose", "billing").eq("status", "pending"),
    )
    .take(100);
  for (const job of jobs) {
    if (
      job.payload.kind !== "email" ||
      !job.payload.context.startsWith("organizationBilling.") ||
      (!job.payload.subject.includes("Businessプラン") && !job.payload.html.includes("Businessプラン"))
    ) {
      continue;
    }
    await ctx.db.patch(job._id, {
      status: "cancelled",
      cancelledAt: updatedAt,
      cancelReason: "organization_billing_changed",
      updatedAt,
    });
    const histories = await ctx.db
      .query("notificationHistory")
      .withIndex("by_outboxId", (q) => q.eq("outboxId", job._id))
      .collect();
    for (const history of histories) {
      if (history.sendStatus === "queued") {
        await ctx.db.patch(history._id, { sendStatus: "cancelled", updatedAt });
      }
    }
  }
}
