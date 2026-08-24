import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganization: "billing_plan_ids_v2_missing_organization",
  ambiguousBillingStates: "billing_plan_ids_v2_ambiguous_billing_states",
  unexpectedBillingState: "billing_plan_ids_v2_unexpected_billing_state",
  stripeCustomerEvidence: "billing_plan_ids_v2_stripe_customer_evidence",
  stripeSubscriptionEvidence: "billing_plan_ids_v2_stripe_subscription_evidence",
  stripeOperationEvidence: "billing_plan_ids_v2_stripe_operation_evidence",
  stripeWebhookEvidence: "billing_plan_ids_v2_stripe_webhook_evidence",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);
const AUDIT_SUFFIX = ":migration:m042:billing-plan-ids-v2";

type M042ConflictCode = (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];

/**
 * ダークローンチ中の支払い不要Proだけを、canonical plan IDへ切り替える。
 *
 * Production前提である`complimentary.business`以外は推測移行せず、事前readinessで停止する。
 * Stripeの痕跡または一意でないbilling stateがある組織も、書き換えずconflictへ残す。
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    const organizationId = billingState.organizationId;
    const state = billingState.state;

    if (
      state.kind === "complimentary" &&
      "planIdVersion" in state &&
      state.planIdVersion === 2 &&
      state.plan === "pro"
    ) {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organization",
        sourceId: organizationId,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }

    if (!(state.kind === "complimentary" && !("planIdVersion" in state) && state.plan === "business")) {
      await recordM042Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.unexpectedBillingState,
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

    const stripeConflict = await findStripeEvidenceConflict(ctx, organizationId);
    if (stripeConflict) {
      await recordM042Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: stripeConflict,
      });
      return;
    }

    const now = Date.now();
    await ctx.db.patch(billingState._id, {
      state: { kind: "complimentary", planIdVersion: 2, plan: "pro" },
      version: billingState.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "complimentary.business",
      toState: "complimentary.pro",
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

async function findStripeEvidenceConflict(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
): Promise<M042ConflictCode | undefined> {
  const customer = await ctx.db
    .query("organizationStripeCustomers")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .first();
  if (customer) return CONFLICT_CODES.stripeCustomerEvidence;

  const subscription = await ctx.db
    .query("organizationStripeSubscriptions")
    .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
    .first();
  if (subscription) return CONFLICT_CODES.stripeSubscriptionEvidence;

  const operation = await ctx.db
    .query("organizationStripeOperations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
    .first();
  if (operation) return CONFLICT_CODES.stripeOperationEvidence;

  const webhook = await ctx.db
    .query("stripeWebhookEvents")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .first();
  if (webhook) return CONFLICT_CODES.stripeWebhookEvidence;

  return undefined;
}

async function recordM042Conflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId?: Id<"organizations">;
    sourceId: string;
    code: M042ConflictCode;
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
