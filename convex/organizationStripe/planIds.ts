import { canonicalizeOrganizationPaidPlan } from "../organizationBilling/policy";

export type CanonicalStripePaidPlan = "standard" | "pro";
export type CanonicalStripeTargetPlan = "free" | CanonicalStripePaidPlan;
export type PersistedStripePaidPlan = CanonicalStripePaidPlan | "business";
export type PersistedStripeTargetPlan = "free" | PersistedStripePaidPlan;

/**
 * Widen中のStripe snapshotをruntime用のcanonical plan IDへ投影する。
 * markerなしのpro/businessだけをlegacyとして扱い、曖昧なstandardはfail closedにする。
 */
export function canonicalizeStripePaidPlan(plan: PersistedStripePaidPlan, planIdVersion?: 2): CanonicalStripePaidPlan {
  return canonicalizeOrganizationPaidPlan(plan, planIdVersion);
}

export function canonicalizeStripeTargetPlan(
  plan: PersistedStripeTargetPlan,
  planIdVersion?: 2,
): CanonicalStripeTargetPlan {
  return plan === "free" ? "free" : canonicalizeStripePaidPlan(plan, planIdVersion);
}
