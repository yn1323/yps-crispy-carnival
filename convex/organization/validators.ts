import { v } from "convex/values";

// TODO[narrow]: shops.operatingStatusとlegacy event decoderの除去までschema互換のためだけに保持する。
export const organizationShopOperatingStatusValidator = v.union(v.literal("active"), v.literal("archived"));

export const organizationPersonStatusValidator = v.union(v.literal("active"), v.literal("removed"));

export const organizationMemberStatusValidator = v.union(v.literal("active"), v.literal("removed"));

export const organizationInvitationStatusValidator = v.union(
  v.literal("issued"),
  v.literal("linked"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const organizationPaidPlanValidator = v.union(v.literal("standard"), v.literal("pro"));

export const organizationActivePlanValidator = v.union(v.literal("free"), v.literal("standard"), v.literal("pro"));

export const organizationLastPlanChangeValidator = v.object({
  reason: v.literal("paymentFailed"),
  previousPlan: v.union(v.literal("trial"), organizationPaidPlanValidator),
  occurredAt: v.number(),
});

/**
 * 事業者単位の課金状態の正本。
 *
 * 状態固有の値を同じ union 内に閉じ込め、矛盾する状態の重複保存を防ぐ。
 */
export const organizationCanonicalBillingStateValidator = v.union(
  v.object({
    kind: v.literal("trial"),
    trialEndsAt: v.number(),
    selectedPaidPlan: v.optional(organizationPaidPlanValidator),
  }),
  v.object({
    kind: v.literal("initialPaymentPending"),
    plan: organizationPaidPlanValidator,
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("pendingActivation"),
    plan: organizationPaidPlanValidator,
    fallback: v.union(v.literal("free"), v.literal("standard")),
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("active"),
    plan: organizationActivePlanValidator,
  }),
  v.object({
    kind: v.literal("complimentary"),
    plan: v.literal("pro"),
  }),
  v.union(
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("standard"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      restrictAtPeriodEnd: v.literal(true),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("pro"),
      targetPlan: v.literal("standard"),
      effectiveAt: v.number(),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("pro"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      restrictAtPeriodEnd: v.literal(true),
    }),
  ),
  v.object({
    kind: v.literal("paymentTerminationPending"),
    previousPlan: v.union(v.literal("trial"), organizationPaidPlanValidator),
    startedAt: v.number(),
  }),
);

export const organizationBillingStateValidator = organizationCanonicalBillingStateValidator;
