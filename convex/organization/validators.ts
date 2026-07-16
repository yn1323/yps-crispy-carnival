import { v } from "convex/values";

export const organizationShopOperatingStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
  v.literal("planSuspended"),
);

export const organizationPersonStatusValidator = v.union(v.literal("active"), v.literal("removed"));

export const organizationMemberStatusValidator = v.union(
  v.literal("active"),
  v.literal("readOnly"),
  v.literal("removed"),
);

export const organizationInvitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const organizationInvitationPurposeValidator = v.union(
  v.literal("managerAddition"),
  v.literal("freeManagerExchange"),
);

export const organizationPaidPlanValidator = v.union(v.literal("pro"), v.literal("business"));

export const organizationActivePlanValidator = v.union(v.literal("free"), v.literal("pro"), v.literal("business"));

export const organizationRestrictionReasonValidator = v.union(
  v.literal("trialFreeConditionsNotMet"),
  v.literal("freeConditionsNotMet"),
  v.literal("paymentGraceExpired"),
  v.literal("paymentActivationFailed"),
  v.literal("unexpectedCancellation"),
);

const organizationRestrictedBillingStateValidator = v.object({
  kind: v.literal("restricted"),
  reason: organizationRestrictionReasonValidator,
  previousPlan: v.optional(organizationActivePlanValidator),
  recoveryManagerPersonIds: v.array(v.id("organizationPeople")),
  previousActiveShopIds: v.array(v.id("shops")),
  restrictedAt: v.number(),
});

/**
 * 事業者単位の課金状態の正本。
 *
 * 状態固有の値を同じ union 内に閉じ込め、矛盾する状態の重複保存を防ぐ。
 */
export const organizationBillingStateValidator = v.union(
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
    fallback: v.union(v.literal("free"), v.literal("restricted")),
    restrictedFallbackState: v.optional(organizationRestrictedBillingStateValidator),
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("active"),
    plan: organizationActivePlanValidator,
  }),
  v.object({
    kind: v.literal("scheduledChange"),
    currentPlan: organizationPaidPlanValidator,
    targetPlan: v.union(v.literal("free"), v.literal("pro")),
    effectiveAt: v.number(),
  }),
  v.object({
    kind: v.literal("grace"),
    plan: organizationPaidPlanValidator,
    startedAt: v.number(),
    endsAt: v.number(),
  }),
  organizationRestrictedBillingStateValidator,
);
