import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganization: "billing_complimentary_pro_to_business_missing_organization",
  ambiguousBillingStates: "billing_complimentary_pro_to_business_ambiguous_billing_states",
  stripeCustomerEvidence: "billing_complimentary_pro_to_business_stripe_customer_evidence",
  stripeSubscriptionEvidence: "billing_complimentary_pro_to_business_stripe_subscription_evidence",
  stripeOperationEvidence: "billing_complimentary_pro_to_business_stripe_operation_evidence",
  stripeWebhookEvidence: "billing_complimentary_pro_to_business_stripe_webhook_evidence",
  billingNotificationEvidence: "billing_complimentary_pro_to_business_billing_notification_evidence",
  existingMigrationAudit: "billing_complimentary_pro_to_business_existing_migration_audit",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);
const NOTIFICATION_STATUSES = ["pending", "processing", "sent", "failed", "cancelled"] as const;
const AUDIT_SUFFIX = ":migration:m021:complimentary-pro-to-business";

type M021ConflictCode = (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];
type LegacyComplimentaryState = { kind: "complimentary"; plan: "pro" | "business" };

/**
 * Stripeと完全に分離された無償Proだけを、同じ無償契約のBusiness表記へ移す。
 * 有料契約の痕跡が一つでもあれば対象を推測せず、運用裁定可能なconflictで停止する。
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    // m021は完了済みの履歴だが、旧fixtureを使うMigration Testのため旧shapeの読み取りを保持する。
    const legacyState = billingState.state as typeof billingState.state | LegacyComplimentaryState;
    if (legacyState.kind !== "complimentary" || legacyState.plan !== "pro") return;

    const organizationId = billingState.organizationId;
    const organization = await ctx.db.get(organizationId);
    if (!organization) {
      await recordM021Conflict(ctx, {
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
      await recordM021Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.ambiguousBillingStates,
      });
      return;
    }

    const evidenceConflict = await findBillingEvidenceConflict(ctx, organizationId);
    if (evidenceConflict) {
      await recordM021Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: evidenceConflict,
      });
      return;
    }

    const correlationId = `${organizationId}${AUDIT_SUFFIX}`;
    const existingAudits = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .take(2);
    if (existingAudits.length > 0) {
      await recordM021Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.existingMigrationAudit,
      });
      return;
    }

    const now = Date.now();
    await ctx.db.patch(billingState._id, {
      state: { kind: "complimentary", plan: "business" },
      version: billingState.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "complimentary.pro",
      toState: "complimentary.business",
      correlationId,
      occurredAt: now,
    });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organization",
      sourceId: organizationId,
      codes: OWNED_CONFLICT_CODES,
      resolvedAt: now,
    });
  },
});

async function findBillingEvidenceConflict(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
): Promise<M021ConflictCode | undefined> {
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

  for (const status of NOTIFICATION_STATUSES) {
    const notification = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_organizationId_purpose_status", (q) =>
        q.eq("organizationId", organizationId).eq("purpose", "billing").eq("status", status),
      )
      .first();
    if (notification) return CONFLICT_CODES.billingNotificationEvidence;
  }
  return undefined;
}

async function recordM021Conflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId?: Id<"organizations">;
    sourceId: string;
    code: M021ConflictCode;
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
