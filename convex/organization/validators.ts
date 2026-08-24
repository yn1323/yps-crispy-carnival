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
  // TODO[narrow]: Remove pending/accepted after m023 and invitation readiness have completed everywhere.
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("issued"),
  v.literal("linked"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const organizationInvitationPurposeValidator = v.union(
  v.literal("managerAddition"),
  v.literal("freeManagerExchange"),
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

export const organizationRestrictionReasonValidator = v.union(
  v.literal("trialEndedWithoutSubscription"),
  v.literal("scheduledCancellation"),
  v.literal("trialFreeConditionsNotMet"),
  v.literal("freeConditionsNotMet"),
  v.literal("paymentGraceExpired"),
  v.literal("paymentActivationFailed"),
  v.literal("unexpectedCancellation"),
  v.literal("planLimitExceeded"),
);

const organizationLegacyRestrictedBillingStateValidator = v.object({
  kind: v.literal("restricted"),
  reason: organizationRestrictionReasonValidator,
  previousPlan: v.optional(organizationLegacyActivePlanValidator),
  // TODO[narrow]: verifyOrganizationBillingStatesの全pageで欠損を確認し、必要なら新しいforward migrationで
  //   補完した後、reason別の必須条件へ分割する。planLimitExceededではlimitPlanを必須にする。
  limitPlan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  // grace/pendingからの有料復旧先。既存行は未設定を現在planとして解釈する。
  targetPlan: v.optional(organizationLegacyPaidPlanValidator),
  recoveryManagerPersonIds: v.array(v.id("organizationPeople")),
  previousActiveShopIds: v.array(v.id("shops")),
  restrictedAt: v.number(),
});

const organizationRestrictedBillingStateValidator = v.object({
  kind: v.literal("restricted"),
  reason: organizationRestrictionReasonValidator,
  previousPlan: v.optional(organizationActivePlanValidator),
  // TODO[narrow]: m042完走後のreadinessで全stateがplanIdVersion=2になったことを確認してから、
  //   legacy validatorと同時に移行注記を外す。
  limitPlan: v.optional(organizationActivePlanValidator),
  targetPlan: v.optional(organizationPaidPlanValidator),
  recoveryManagerPersonIds: v.array(v.id("organizationPeople")),
  previousActiveShopIds: v.array(v.id("shops")),
  restrictedAt: v.number(),
});

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
    fallback: v.union(v.literal("free"), v.literal("pro"), v.literal("restricted")),
    restrictedFallbackState: v.optional(organizationLegacyRestrictedBillingStateValidator),
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
  organizationLegacyRestrictedBillingStateValidator,
);

/**
 * plan ID切替後に新規保存するv2 state。
 *
 * TODO[narrow]: m042とAnalytics再構築が全deploymentで完了し、legacy stateが0件になった後に
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
    fallback: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("restricted")),
    restrictedFallbackState: v.optional(organizationRestrictedBillingStateValidator),
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
  organizationRestrictedBillingStateValidator.extend({
    planIdVersion: planIdVersionValidator,
  }),
);

export const organizationBillingStateValidator = v.union(
  organizationLegacyBillingStateValidator,
  organizationCanonicalBillingStateValidator,
);
