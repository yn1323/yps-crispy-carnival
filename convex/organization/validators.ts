import { v } from "convex/values";

export const organizationShopOperatingStatusValidator = v.union(v.literal("active"), v.literal("archived"));

export const organizationPersonStatusValidator = v.union(v.literal("active"), v.literal("removed"));

export const organizationMemberStatusValidator = v.union(v.literal("active"), v.literal("removed"));

export const organizationInvitationStatusValidator = v.union(
  v.literal("issued"),
  v.literal("linked"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const planIdVersionValidator = v.literal(2);

export const organizationLegacyPaidPlanValidator = v.union(v.literal("pro"), v.literal("business"));

export const organizationLegacyActivePlanValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("business"),
);

export const organizationPaidPlanValidator = v.union(v.literal("standard"), v.literal("pro"));

export const organizationActivePlanValidator = v.union(v.literal("free"), v.literal("standard"), v.literal("pro"));

/**
 * 事業者単位の課金状態の正本。
 *
 * 状態固有の値を同じ union 内に閉じ込め、矛盾する状態の重複保存を防ぐ。
 */
export const organizationLegacyBillingStateValidator = v.union(
  v.object({
    kind: v.literal("trial"),
    trialEndsAt: v.number(),
    selectedPaidPlan: v.optional(organizationLegacyPaidPlanValidator),
  }),
  v.object({
    kind: v.literal("initialPaymentPending"),
    plan: organizationLegacyPaidPlanValidator,
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("pendingActivation"),
    plan: organizationLegacyPaidPlanValidator,
    fallback: v.union(v.literal("free"), v.literal("pro")),
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("active"),
    plan: organizationLegacyActivePlanValidator,
  }),
  v.object({
    kind: v.literal("complimentary"),
    plan: v.literal("business"),
  }),
  v.union(
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("pro"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      // 既存のFree変更予約は未設定のまま互換維持し、新しい解約予約だけtrueを保存する。
      restrictAtPeriodEnd: v.optional(v.literal(true)),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("business"),
      targetPlan: v.literal("pro"),
      effectiveAt: v.number(),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      currentPlan: v.literal("business"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      // 既存のFree変更予約は未設定のまま互換維持し、新しい解約予約だけtrueを保存する。
      restrictAtPeriodEnd: v.optional(v.literal(true)),
    }),
  ),
  v.object({
    kind: v.literal("grace"),
    plan: organizationLegacyPaidPlanValidator,
    targetPlan: v.optional(organizationLegacyPaidPlanValidator),
    startedAt: v.number(),
    endsAt: v.number(),
  }),
);

/**
 * plan ID切替後に新規保存するv2 state。
 *
 * TODO[narrow]: m042〜m047とAnalytics再構築が全deploymentで完了し、
 * billing_compatibility_narrow_readinessを含む全readinessでlegacy／conflictが0件になった後に、
 * planIdVersionとorganizationLegacyBillingStateValidatorを削除する。
 */
export const organizationCanonicalBillingStateValidator = v.union(
  v.object({
    kind: v.literal("trial"),
    planIdVersion: planIdVersionValidator,
    trialEndsAt: v.number(),
    selectedPaidPlan: v.optional(organizationPaidPlanValidator),
  }),
  v.object({
    kind: v.literal("initialPaymentPending"),
    planIdVersion: planIdVersionValidator,
    plan: organizationPaidPlanValidator,
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("pendingActivation"),
    planIdVersion: planIdVersionValidator,
    plan: organizationPaidPlanValidator,
    fallback: v.union(v.literal("free"), v.literal("standard"), v.literal("pro")),
    startedAt: v.number(),
  }),
  v.object({
    kind: v.literal("active"),
    planIdVersion: planIdVersionValidator,
    plan: organizationActivePlanValidator,
  }),
  v.object({
    kind: v.literal("complimentary"),
    planIdVersion: planIdVersionValidator,
    plan: v.literal("pro"),
  }),
  v.union(
    v.object({
      kind: v.literal("scheduledChange"),
      planIdVersion: planIdVersionValidator,
      currentPlan: v.literal("standard"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      restrictAtPeriodEnd: v.optional(v.literal(true)),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      planIdVersion: planIdVersionValidator,
      currentPlan: v.literal("pro"),
      targetPlan: v.literal("standard"),
      effectiveAt: v.number(),
    }),
    v.object({
      kind: v.literal("scheduledChange"),
      planIdVersion: planIdVersionValidator,
      currentPlan: v.literal("pro"),
      targetPlan: v.literal("free"),
      effectiveAt: v.number(),
      restrictAtPeriodEnd: v.optional(v.literal(true)),
    }),
  ),
  v.object({
    kind: v.literal("grace"),
    planIdVersion: planIdVersionValidator,
    plan: organizationPaidPlanValidator,
    targetPlan: v.optional(organizationPaidPlanValidator),
    startedAt: v.number(),
    endsAt: v.number(),
  }),
);

export const organizationBillingStateValidator = v.union(
  organizationLegacyBillingStateValidator,
  organizationCanonicalBillingStateValidator,
);
