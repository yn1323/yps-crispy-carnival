import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganization: "billing_to_complimentary_business_missing_organization",
  ambiguousBillingStates: "billing_to_complimentary_business_ambiguous_billing_states",
  stripeMappingEvidence: "billing_to_complimentary_business_stripe_mapping_evidence",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);
const AUDIT_SUFFIX = ":migration:m022:to-complimentary-business";

type M022ConflictCode = (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];

/**
 * ダークローンチの支払い制限に合わせ、全グループの課金状態を支払い不要Businessへ寄せる。
 *
 * 支払い不要BusinessはStripe objectを作らない隔離契約を既に持つため、
 * 新しい課金状態を増やさずに支払い経路を閉じられる。
 *
 * Productionは`v0.0.63`時点で組織モデル以前のコードが載っており、Stripe関連tableが存在しない。
 * 照合すべき痕跡は原理的に0件だが、動作確認で行が残りうるdevelopのために、
 * Stripe CustomerまたはSubscriptionが対応するグループだけはconflictへ残す。
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    if (billingState.state.kind === "complimentary" && billingState.state.plan === "business") return;

    const organizationId = billingState.organizationId;
    const organization = await ctx.db.get(organizationId);
    if (!organization) {
      await recordM022Conflict(ctx, {
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
      await recordM022Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.ambiguousBillingStates,
      });
      return;
    }

    if (await hasStripeMapping(ctx, organizationId)) {
      await recordM022Conflict(ctx, {
        organizationId,
        sourceId: organizationId,
        code: CONFLICT_CODES.stripeMappingEvidence,
      });
      return;
    }

    const now = Date.now();
    await ctx.db.patch(billingState._id, {
      state: { kind: "complimentary", plan: "business" },
      // Free選択の結果は支払い不要Businessで意味を持たない。
      // 残すと、支払いを開けてFreeへ戻したときに古い選択が復活する。
      freeManagerPersonId: undefined,
      freeShopId: undefined,
      version: billingState.version + 1,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: describeBillingState(billingState.state),
      toState: "complimentary.business",
      correlationId: `${organizationId}${AUDIT_SUFFIX}`,
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

/** 監査へ残す移行前の状態。planを持つ状態だけ`kind.plan`で表す。 */
function describeBillingState(state: Doc<"organizationBillingStates">["state"]): string {
  switch (state.kind) {
    case "active":
    case "complimentary":
    case "initialPaymentPending":
    case "pendingActivation":
    case "grace":
      return `${state.kind}.${state.plan}`;
    case "scheduledChange":
      return `scheduledChange.${state.currentPlan}`;
    default:
      return state.kind;
  }
}

async function hasStripeMapping(ctx: Pick<MutationCtx, "db">, organizationId: Id<"organizations">): Promise<boolean> {
  const customer = await ctx.db
    .query("organizationStripeCustomers")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .first();
  if (customer) return true;

  const subscription = await ctx.db
    .query("organizationStripeSubscriptions")
    .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
    .first();
  return subscription !== null;
}

async function recordM022Conflict(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId?: Id<"organizations">;
    sourceId: string;
    code: M022ConflictCode;
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
