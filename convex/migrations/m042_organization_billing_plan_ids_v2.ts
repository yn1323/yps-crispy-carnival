import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { canonicalizeOrganizationBillingState } from "../organizationBilling/policy";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganization: "billing_plan_ids_v2_missing_organization",
  ambiguousBillingStates: "billing_plan_ids_v2_ambiguous_billing_states",
} as const;
const OBSOLETE_CONFLICT_CODES = [
  "billing_plan_ids_v2_unexpected_billing_state",
  "billing_plan_ids_v2_stripe_customer_evidence",
  "billing_plan_ids_v2_stripe_subscription_evidence",
  "billing_plan_ids_v2_stripe_operation_evidence",
  "billing_plan_ids_v2_stripe_webhook_evidence",
] as const;

const OWNED_CONFLICT_CODES = [...Object.values(CONFLICT_CODES), ...OBSOLETE_CONFLICT_CODES];
const AUDIT_SUFFIX = ":migration:m042:billing-plan-ids-v2";

/**
 * markerなしの全billing stateを、保存済みplan IDのversion契約に従ってv2へ切り替える。
 * 旧`pro`は`standard`、旧`business`は`pro`として意味を維持する。
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    const organizationId = billingState.organizationId;
    const state = billingState.state;

    if ("planIdVersion" in state && state.planIdVersion === 2) {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organization",
        sourceId: organizationId,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }

    const organization = await ctx.db.get(organizationId);
    if (!organization) {
      await recordM042Conflict(ctx, {
        sourceId: organizationId,
        code: CONFLICT_CODES.missingOrganization,
      });
      return;
    }

    const billingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(2);
    if (billingStates.length !== 1 || billingStates[0]._id !== billingState._id) {
      await recordM042Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.ambiguousBillingStates,
      });
      return;
    }

    const now = Date.now();
    const canonicalState = canonicalizeOrganizationBillingState(state);
    await ctx.db.patch(billingState._id, {
      state: canonicalState,
      version: billingState.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: billingStateAuditLabel(state),
      toState: billingStateAuditLabel(canonicalState),
      correlationId: `${organizationId}${AUDIT_SUFFIX}`,
      occurredAt: now,
      // 内部IDだけの変更であり、利用者のplan変更ではない。
      suppressAnalyticsEvent: true,
    });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organization",
      sourceId: organizationId,
      codes: OWNED_CONFLICT_CODES,
      resolvedAt: now,
    });
  },
});

async function recordM042Conflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId?: Id<"organizations">;
    sourceId: string;
    code: (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];
  },
) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "organization",
    sourceId: args.sourceId,
    codes: OWNED_CONFLICT_CODES.filter((code) => code !== args.code),
  });
  await recordOrganizationMigrationConflict(ctx, {
    organizationId: args.organizationId,
    sourceType: "organization",
    sourceId: args.sourceId,
    code: args.code,
  });
}

function billingStateAuditLabel(state: Doc<"organizationBillingStates">["state"]) {
  switch (state.kind) {
    case "active":
    case "complimentary":
      return `${state.kind}.${state.plan}`;
    case "initialPaymentPending":
    case "grace":
      return `${state.kind}.${state.plan}`;
    case "pendingActivation":
      return `${state.kind}.${state.plan}.${state.fallback}`;
    case "scheduledChange":
      return `${state.kind}.${state.currentPlan}.${state.targetPlan}`;
    case "trial":
      return state.selectedPaidPlan ? `${state.kind}.${state.selectedPaidPlan}` : state.kind;
  }
}
