import type { Infer } from "convex/values";
import { getDebugTrialDurationDays } from "../_lib/config";
import { jstMonthStartMs } from "../_lib/dateFormat";
import { DAY_MS } from "../constants";
import type {
  organizationBillingStateValidator,
  organizationCanonicalBillingStateValidator,
  organizationLegacyBillingStateValidator,
} from "../organization/validators";
import {
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationDisplayPlan,
  type OrganizationEntitlementPlan,
  type OrganizationPaidPlan,
  type OrganizationPlan,
  type OrganizationPlanLimits,
} from "./planLimits";

export type {
  OrganizationDisplayPlan,
  OrganizationEntitlementPlan,
  OrganizationPaidPlan,
  OrganizationPlan,
  OrganizationPlanLimits,
} from "./planLimits";
export { ORGANIZATION_PLAN_LIMITS } from "./planLimits";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const PAYMENT_GRACE_PERIOD_MS = 14 * DAY_MS;
export type PersistedOrganizationBillingState = Infer<typeof organizationBillingStateValidator>;
export type LegacyOrganizationBillingState = Infer<typeof organizationLegacyBillingStateValidator>;
export type CanonicalOrganizationBillingState = Infer<typeof organizationCanonicalBillingStateValidator>;
/** Widen中に既存call siteが受け取る保存shape。semantic判定前にcanonicalizeする。 */
export type OrganizationBillingState = PersistedOrganizationBillingState;
type CanonicalRootRestrictedOrganizationBillingState = Extract<
  CanonicalOrganizationBillingState,
  { kind: "restricted" }
>;
/** root stateとpendingActivation内のfallbackの両方で使うsemantic restricted shape。 */
export type RestrictedOrganizationBillingState = Omit<
  CanonicalRootRestrictedOrganizationBillingState,
  "planIdVersion"
> & { planIdVersion?: 2 };
type LegacyRestrictedOrganizationBillingState = Extract<LegacyOrganizationBillingState, { kind: "restricted" }>;
type M018NormalizedOrganizationBillingState =
  | Exclude<LegacyOrganizationBillingState, { kind: "complimentary" }>
  | CanonicalOrganizationBillingState
  | { kind: "complimentary"; plan: "pro" };
export type VerifiedBillingTransitionCause = "stateUpdate" | "paymentFailed" | "scheduledChangeCanceled";

/** m018用の履歴互換helper。通常runtimeでは使用しない。 */
export function normalizeOrganizationPaidPlan(_plan: "pro" | "business"): "pro" {
  return "pro";
}

/** m018用の履歴互換helper。通常runtimeでは使用しない。 */
export function normalizeOrganizationActivePlan(plan: "free" | "pro" | "business"): "free" | "pro" {
  return plan === "free" ? "free" : "pro";
}

function normalizeM018RestrictedState(state: LegacyRestrictedOrganizationBillingState) {
  const { previousPlan, ...rest } = state;
  return {
    ...rest,
    ...(previousPlan === undefined ? {} : { previousPlan: normalizeOrganizationActivePlan(previousPlan) }),
  };
}

/** m018用の履歴互換helper。BusinessをProへ畳む意味を変更しない。 */
export function normalizeOrganizationBillingState(
  state: PersistedOrganizationBillingState,
): M018NormalizedOrganizationBillingState {
  if ("planIdVersion" in state) return state;
  switch (state.kind) {
    case "trial": {
      const { selectedPaidPlan, ...rest } = state;
      return {
        ...rest,
        ...(selectedPaidPlan === undefined
          ? {}
          : { selectedPaidPlan: normalizeOrganizationPaidPlan(selectedPaidPlan) }),
      };
    }
    case "initialPaymentPending":
      return { ...state, plan: normalizeOrganizationPaidPlan(state.plan) };
    case "pendingActivation": {
      const { plan, restrictedFallbackState, ...rest } = state;
      return {
        ...rest,
        plan: normalizeOrganizationPaidPlan(plan),
        ...(restrictedFallbackState
          ? { restrictedFallbackState: normalizeM018RestrictedState(restrictedFallbackState) }
          : {}),
      };
    }
    case "active":
      return { ...state, plan: normalizeOrganizationActivePlan(state.plan) };
    case "complimentary":
      return { kind: "complimentary", plan: "pro" };
    case "scheduledChange":
      return state.targetPlan === "pro"
        ? { kind: "active", plan: "pro" }
        : { ...state, currentPlan: "pro", targetPlan: "free" };
    case "grace":
      return { ...state, plan: normalizeOrganizationPaidPlan(state.plan) };
    case "restricted":
      return normalizeM018RestrictedState(state);
  }
}

export function canonicalizeOrganizationPaidPlan(
  plan: "standard" | "pro" | "business",
  planIdVersion?: 2,
): OrganizationPaidPlan {
  if (planIdVersion === 2) {
    if (plan === "business") throw new Error("billing_plan_id_version_invalid");
    return plan;
  }
  if (plan === "standard") throw new Error("billing_plan_id_version_missing");
  return plan === "pro" ? "standard" : "pro";
}

function canonicalizeLegacyActivePlan(plan: "free" | "pro" | "business"): OrganizationEntitlementPlan {
  return plan === "free" ? "free" : canonicalizeOrganizationPaidPlan(plan);
}

function canonicalizeLegacyRestrictedState(
  state: LegacyRestrictedOrganizationBillingState,
): RestrictedOrganizationBillingState {
  const { previousPlan, limitPlan, targetPlan, ...rest } = state;
  return {
    ...rest,
    ...(previousPlan === undefined ? {} : { previousPlan: canonicalizeLegacyActivePlan(previousPlan) }),
    ...(limitPlan === undefined
      ? {}
      : { limitPlan: limitPlan === "free" ? "free" : canonicalizeOrganizationPaidPlan(limitPlan) }),
    ...(targetPlan === undefined ? {} : { targetPlan: canonicalizeOrganizationPaidPlan(targetPlan) }),
  };
}

/**
 * Widen中のlegacy stateを、runtimeが扱うcanonical v2 stateへ投影する。
 * 保存値はm042が書き換えるまで変更せず、未versioned proをStandard、businessをProとして読む。
 */
export function canonicalizeOrganizationBillingState(
  state: PersistedOrganizationBillingState,
): CanonicalOrganizationBillingState {
  if ("planIdVersion" in state) return state;

  switch (state.kind) {
    case "trial": {
      const { selectedPaidPlan, ...rest } = state;
      return {
        ...rest,
        planIdVersion: 2,
        ...(selectedPaidPlan === undefined
          ? {}
          : { selectedPaidPlan: canonicalizeOrganizationPaidPlan(selectedPaidPlan) }),
      };
    }
    case "initialPaymentPending":
      return { ...state, planIdVersion: 2, plan: canonicalizeOrganizationPaidPlan(state.plan) };
    case "pendingActivation": {
      const { plan, fallback, restrictedFallbackState, ...rest } = state;
      return {
        ...rest,
        planIdVersion: 2,
        plan: canonicalizeOrganizationPaidPlan(plan),
        fallback: fallback === "pro" ? "standard" : fallback,
        ...(restrictedFallbackState
          ? { restrictedFallbackState: canonicalizeLegacyRestrictedState(restrictedFallbackState) }
          : {}),
      };
    }
    case "active":
      return { ...state, planIdVersion: 2, plan: canonicalizeLegacyActivePlan(state.plan) };
    case "complimentary":
      return { kind: "complimentary", planIdVersion: 2, plan: "pro" };
    case "scheduledChange":
      if (state.currentPlan === "pro") {
        return {
          ...state,
          planIdVersion: 2,
          currentPlan: "standard",
          targetPlan: "free",
        };
      }
      return state.targetPlan === "pro"
        ? {
            ...state,
            planIdVersion: 2,
            currentPlan: "pro",
            targetPlan: "standard",
          }
        : { ...state, planIdVersion: 2, currentPlan: "pro", targetPlan: "free" };
    case "grace": {
      const { plan, targetPlan, ...rest } = state;
      return {
        ...rest,
        planIdVersion: 2,
        plan: canonicalizeOrganizationPaidPlan(plan),
        ...(targetPlan === undefined ? {} : { targetPlan: canonicalizeOrganizationPaidPlan(targetPlan) }),
      };
    }
    case "restricted":
      return { ...canonicalizeLegacyRestrictedState(state), planIdVersion: 2 };
  }
}

export type OrganizationBillingPlanResolution = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
};

/** 通常runtime用。履歴migrationのBusiness→Pro正規化とは分離する。 */
export function resolveOrganizationBillingPlans(
  persistedState: PersistedOrganizationBillingState,
): OrganizationBillingPlanResolution {
  const state = canonicalizeOrganizationBillingState(persistedState);
  switch (state.kind) {
    case "trial":
      return {
        paidPlan: state.selectedPaidPlan ?? null,
        entitlementPlan: "pro",
        displayPlan: "trial",
        targetingPlan: "trial",
      };
    case "initialPaymentPending":
      return {
        paidPlan: state.plan,
        // 既存契約どおり、初回請求結果待ちはStandard相当を維持する。
        entitlementPlan: "standard",
        displayPlan: state.plan,
        targetingPlan: state.plan,
      };
    case "pendingActivation": {
      if (state.fallback === "free") {
        return { paidPlan: state.plan, entitlementPlan: "free", displayPlan: "free", targetingPlan: "free" };
      }
      if (state.fallback === "standard" || state.fallback === "pro") {
        return {
          paidPlan: state.plan,
          entitlementPlan: state.fallback,
          displayPlan: state.fallback,
          targetingPlan: state.fallback,
        };
      }
      const fallback = state.restrictedFallbackState
        ? resolveRestrictedDisplayPlan(state.restrictedFallbackState)
        : null;
      return { paidPlan: state.plan, entitlementPlan: null, displayPlan: fallback, targetingPlan: fallback };
    }
    case "active":
      return {
        paidPlan: state.plan === "free" ? null : state.plan,
        entitlementPlan: state.plan,
        displayPlan: state.plan,
        targetingPlan: state.plan,
      };
    case "complimentary":
      return {
        paidPlan: null,
        entitlementPlan: "pro",
        displayPlan: "pro",
        targetingPlan: "pro",
      };
    case "scheduledChange":
      return {
        paidPlan: state.currentPlan,
        entitlementPlan: state.currentPlan,
        displayPlan: state.currentPlan,
        targetingPlan: state.currentPlan,
      };
    case "grace":
      return {
        paidPlan: state.targetPlan ?? state.plan,
        entitlementPlan: state.plan,
        displayPlan: state.plan,
        targetingPlan: state.plan,
      };
    case "restricted": {
      const displayPlan = resolveRestrictedDisplayPlan(state);
      return {
        paidPlan:
          state.targetPlan ??
          (state.previousPlan === "standard" || state.previousPlan === "pro" ? state.previousPlan : null),
        entitlementPlan: null,
        displayPlan,
        targetingPlan: displayPlan,
      };
    }
  }
}

/** 通常runtimeで、表示中または変更先としてBusinessを参照する状態かを判定する。 */
export function billingStateReferencesBusinessPlan(state: PersistedOrganizationBillingState): boolean {
  return hasLegacyBusinessBillingState(state);
}

export function resolveRestrictedLimitPlan(
  state: RestrictedOrganizationBillingState,
): OrganizationEntitlementPlan | null {
  if (state.limitPlan) return state.limitPlan;
  if (state.reason === "trialFreeConditionsNotMet" || state.reason === "freeConditionsNotMet") return "free";
  return null;
}

/**
 * 現在の利用数へ適用するプランを、課金ライフサイクルとは独立して解決する。
 * legacy restrictedは保存済みのlimitPlanだけを利用し、現在プランを推測しない。
 */
export function resolveUsageLimitPlan(
  persistedState: PersistedOrganizationBillingState,
): OrganizationEntitlementPlan | null {
  const state = canonicalizeOrganizationBillingState(persistedState);
  switch (state.kind) {
    case "trial":
      return "pro";
    case "initialPaymentPending":
      return "standard";
    case "pendingActivation":
      if (state.fallback === "free" || state.fallback === "standard" || state.fallback === "pro") {
        return state.fallback;
      }
      return state.restrictedFallbackState ? resolveRestrictedLimitPlan(state.restrictedFallbackState) : null;
    case "active":
      return state.plan;
    case "complimentary":
      return "pro";
    case "scheduledChange":
      return state.currentPlan;
    case "grace":
      return state.plan;
    case "restricted":
      return resolveRestrictedLimitPlan(state);
  }
}

function resolveRestrictedDisplayPlan(state: RestrictedOrganizationBillingState): OrganizationDisplayPlan | null {
  return resolveRestrictedLimitPlan(state) ?? state.previousPlan ?? state.targetPlan ?? null;
}

export function hasLegacyBusinessBillingState(state: PersistedOrganizationBillingState): boolean {
  if ("planIdVersion" in state) return false;
  switch (state.kind) {
    case "trial":
      return state.selectedPaidPlan === "business";
    case "initialPaymentPending":
    case "grace":
      return state.plan === "business";
    case "pendingActivation":
      return state.plan === "business" || state.restrictedFallbackState?.previousPlan === "business";
    case "active":
      return state.plan === "business";
    case "complimentary":
      return state.plan === "business";
    case "scheduledChange": {
      // m018の旧判定式を、現在のdiscriminated unionで型絞り込みさせずそのまま維持する。
      const currentPlan: string = state.currentPlan;
      const targetPlan: string = state.targetPlan;
      return currentPlan === "business" || targetPlan === "pro";
    }
    case "restricted":
      return state.previousPlan === "business";
  }
}

/** 支払い結果待ちでも、契約制限中から開始した場合は元の復旧契約を維持する。 */
export function getEffectiveRestrictedBillingState(
  persistedState: PersistedOrganizationBillingState,
): RestrictedOrganizationBillingState | null {
  const state = canonicalizeOrganizationBillingState(persistedState);
  if (state.kind === "restricted") return state;
  if (state.kind === "pendingActivation" && state.fallback === "restricted") {
    return state.restrictedFallbackState ?? null;
  }
  return null;
}

/**
 * 検証済みの最初の支払い失敗時刻から、延長されない14日間の猶予を組み立てる。
 */
export function createPaymentGraceState(
  plan: OrganizationPaidPlan,
  firstFailureAt: number,
  targetPlan: OrganizationPaidPlan = plan,
): Extract<CanonicalOrganizationBillingState, { kind: "grace" }> {
  if (!Number.isSafeInteger(firstFailureAt) || firstFailureAt < 0) {
    throw new RangeError("firstFailureAt must be a non-negative safe integer timestamp");
  }
  const endsAt = firstFailureAt + PAYMENT_GRACE_PERIOD_MS;
  if (!Number.isSafeInteger(endsAt)) {
    throw new RangeError("payment grace deadline must be a safe integer timestamp");
  }
  return {
    kind: "grace",
    planIdVersion: 2,
    plan,
    ...(targetPlan === plan ? {} : { targetPlan }),
    startedAt: firstFailureAt,
    endsAt,
  };
}

/**
 * 検証済み課金結果の接続点で許可する状態遷移だけを列挙する。
 * Stripe等の到着順やクライアント状態を根拠に、業務状態を飛び越えさせない。
 */
export function isVerifiedBillingTransitionAllowed(
  persistedCurrent: PersistedOrganizationBillingState,
  persistedNext: PersistedOrganizationBillingState,
  cause: VerifiedBillingTransitionCause = "stateUpdate",
): boolean {
  const current = canonicalizeOrganizationBillingState(persistedCurrent);
  const next = canonicalizeOrganizationBillingState(persistedNext);
  if (current.kind === "complimentary" || next.kind === "complimentary") return false;

  switch (next.kind) {
    case "initialPaymentPending":
      return (
        current.kind === "trial" && current.selectedPaidPlan !== undefined && current.selectedPaidPlan === next.plan
      );
    case "pendingActivation":
      return (
        (current.kind === "active" && current.plan === "free" && next.fallback === "free") ||
        (current.kind === "active" &&
          current.plan === "standard" &&
          next.plan === "pro" &&
          next.fallback === "standard") ||
        (current.kind === "restricted" && next.fallback === "restricted") ||
        (current.kind === "pendingActivation" && current.plan === next.plan && current.fallback === next.fallback)
      );
    case "active":
      if (next.plan === "free") {
        return current.kind === "pendingActivation" && current.fallback === "free";
      }
      if (current.kind === "scheduledChange") {
        if (cause === "scheduledChangeCanceled") return current.currentPlan === next.plan;
        return current.targetPlan === next.plan;
      }
      if (current.kind === "initialPaymentPending") return current.plan === next.plan;
      if (current.kind === "pendingActivation") {
        return (
          current.plan === next.plan ||
          (cause === "paymentFailed" && current.fallback === "standard" && next.plan === "standard")
        );
      }
      if (current.kind === "grace") return (current.targetPlan ?? current.plan) === next.plan;
      if (current.kind === "restricted") {
        return (
          current.targetPlan === next.plan ||
          current.previousPlan === next.plan ||
          resolveRestrictedLimitPlan(current) === next.plan
        );
      }
      if (current.kind !== "active") return false;
      if (current.plan === "free") return true;
      return current.plan === next.plan;
    case "grace":
      if (current.kind === "active" && current.plan !== "free") return current.plan === next.plan;
      if (current.kind === "initialPaymentPending") {
        return next.plan === "standard" && (next.targetPlan ?? next.plan) === current.plan;
      }
      if (current.kind === "scheduledChange") {
        return current.currentPlan === next.plan && current.targetPlan === (next.targetPlan ?? next.plan);
      }
      return false;
    case "scheduledChange":
      if (current.kind === "scheduledChange") {
        return current.currentPlan === next.currentPlan && current.targetPlan === next.targetPlan;
      }
      return current.kind === "active" && current.plan === next.currentPlan;
    case "trial":
      return false;
    case "restricted":
      return (
        (current.kind === "pendingActivation" && current.fallback === "restricted") ||
        current.kind === "grace" ||
        current.kind === "scheduledChange"
      );
  }
}

export const RESTRICTED_RECOVERY_CAPABILITIES = [
  "startOrRestartPaidPlan",
  "updatePaymentMethod",
  "updateBillingEmail",
  "selectFreeManager",
  "selectFreeShop",
  "removeOrganizationPerson",
  "archiveShop",
] as const;

export type RecoveryCapability = (typeof RESTRICTED_RECOVERY_CAPABILITIES)[number];
export type BusinessWriteBlockReason = "paymentResultPending" | "restricted";
export type PaidFeatureBlockReason = "freePlan" | BusinessWriteBlockReason;
export type OrganizationAccessMode = "normal" | "limitRecoveryOnly" | "billingRecoveryOnly";
export type OrganizationAccessBlockReason = BusinessWriteBlockReason | "usageLimitExceeded";

export type OrganizationBillingPolicy = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
  limits: OrganizationPlanLimits | null;
  canReadExistingData: true;
  canWriteBusinessData: boolean;
  businessWriteBlockReason: BusinessWriteBlockReason | null;
  canManageManagers: boolean;
  canUsePaidFeatures: boolean;
  paidFeatureBlockReason: PaidFeatureBlockReason | null;
  allowedRecoveryCapabilities: readonly RecoveryCapability[];
  deadlineAt: number | null;
};

const NO_RECOVERY_CAPABILITIES: readonly RecoveryCapability[] = [];

/**
 * 課金状態だけから事業者全体の利用権限を導出する。
 *
 * 復旧操作は状態として許可される候補であり、呼び出し側で復旧担当者かを別途確認する。
 */
export function deriveOrganizationBillingPolicy(
  persistedState: PersistedOrganizationBillingState,
): OrganizationBillingPolicy {
  const state = canonicalizeOrganizationBillingState(persistedState);
  const plans = resolveOrganizationBillingPlans(state);
  switch (state.kind) {
    case "trial":
      return enabledPolicy(plans, state.trialEndsAt);
    case "initialPaymentPending":
      return enabledPolicy(plans, null);
    case "pendingActivation":
      // Freeからの契約開始は支払い成功までFree権利を維持し、有料機能だけを開放しない。
      if (state.fallback === "free") {
        return {
          ...freePolicy(plans.paidPlan),
          paidFeatureBlockReason: "paymentResultPending",
        };
      }
      // StandardからProへの即時変更は支払い成功までStandard権利を維持する。
      if (state.fallback === "standard" || state.fallback === "pro") return enabledPolicy(plans, null);
      // 契約制限中からの契約開始は、支払い成功まで制限と復旧権限を維持する。
      return restrictedPolicy(plans);
    case "active":
      return state.plan === "free" ? freePolicy(null) : enabledPolicy(plans, null);
    case "complimentary":
      return enabledPolicy(plans, null);
    case "scheduledChange":
      // FreeまたはStandardへの変更予定は、期間終了まで現在の有料プランを維持する。
      return enabledPolicy(plans, state.effectiveAt);
    case "grace":
      // 猶予中も元の有料プランを通常どおり利用できる。
      return enabledPolicy(plans, state.endsAt);
    case "restricted":
      return restrictedPolicy(plans);
  }
}

function restrictedPolicy(plans: OrganizationBillingPlanResolution): OrganizationBillingPolicy {
  return {
    ...plans,
    entitlementPlan: null,
    limits: null,
    canReadExistingData: true,
    canWriteBusinessData: false,
    businessWriteBlockReason: "restricted",
    canManageManagers: false,
    canUsePaidFeatures: false,
    paidFeatureBlockReason: "restricted",
    allowedRecoveryCapabilities: RESTRICTED_RECOVERY_CAPABILITIES,
    deadlineAt: null,
  };
}

function enabledPolicy(plans: OrganizationBillingPlanResolution, deadlineAt: number | null): OrganizationBillingPolicy {
  if (!plans.entitlementPlan) throw new Error("enabled_policy_requires_entitlement");
  return {
    ...plans,
    limits: ORGANIZATION_PLAN_LIMITS[plans.entitlementPlan],
    canReadExistingData: true,
    canWriteBusinessData: true,
    businessWriteBlockReason: null,
    canManageManagers: true,
    canUsePaidFeatures: true,
    paidFeatureBlockReason: null,
    allowedRecoveryCapabilities: NO_RECOVERY_CAPABILITIES,
    deadlineAt,
  };
}

function freePolicy(paidPlan: OrganizationPaidPlan | null): OrganizationBillingPolicy {
  return {
    paidPlan,
    entitlementPlan: "free",
    displayPlan: "free",
    targetingPlan: "free",
    limits: ORGANIZATION_PLAN_LIMITS.free,
    canReadExistingData: true,
    canWriteBusinessData: true,
    businessWriteBlockReason: null,
    canManageManagers: true,
    canUsePaidFeatures: false,
    paidFeatureBlockReason: "freePlan",
    allowedRecoveryCapabilities: NO_RECOVERY_CAPABILITIES,
    deadlineAt: null,
  };
}

export type OrganizationPersonUsageInput = {
  personId: string;
  isActiveInOrganization: boolean;
  isStaff: boolean;
  managerRole: "none" | "active" | "readOnly";
};

export type OrganizationUsageProjection = {
  currentPeopleCount: number;
  activeManagerCount: number;
  reservedPersonCount: number;
  projectedPeopleCount: number;
};

/**
 * 事業者内の人物をpersonIdで重複排除し、未承認招待などの予約枠を加えた利用人数を返す。
 */
export function projectOrganizationUsage(input: {
  people: readonly OrganizationPersonUsageInput[];
  reservedPersonCount?: number;
}): OrganizationUsageProjection {
  const reservedPersonCount = input.reservedPersonCount ?? 0;
  requireNonNegativeInteger(reservedPersonCount, "reservedPersonCount");

  const people = normalizeActivePeople(input.people);
  const currentPeopleCount = people.filter(countsTowardPeopleLimit).length;
  const activeManagerCount = people.filter((person) => person.isActiveManager).length;

  return {
    currentPeopleCount,
    activeManagerCount,
    reservedPersonCount,
    projectedPeopleCount: currentPeopleCount + reservedPersonCount,
  };
}

export type FreeUsageProjection = {
  currentPeopleCount: number;
  projectedPeopleCount: number;
  projectedActiveManagerCount: number;
  selectedManagerIsActive: boolean;
};

/**
 * Free移行後に選択者以外を閲覧のみにした時点の利用人数を投影する。
 * スタッフでもある元管理者は、閲覧のみになった後も利用人数へ含める。
 */
export function projectFreeUsage(
  peopleInput: readonly OrganizationPersonUsageInput[],
  selectedManagerPersonId: string | null,
): FreeUsageProjection {
  const people = normalizeActivePeople(peopleInput);
  const selectedManager = selectedManagerPersonId
    ? people.find((person) => person.personId === selectedManagerPersonId)
    : undefined;
  const selectedManagerIsActive = selectedManager?.isActiveManager === true;

  return {
    currentPeopleCount: people.filter(countsTowardPeopleLimit).length,
    projectedPeopleCount: people.filter(
      (person) => person.isStaff || (selectedManagerIsActive && person.personId === selectedManagerPersonId),
    ).length,
    projectedActiveManagerCount: selectedManagerIsActive ? 1 : 0,
    selectedManagerIsActive,
  };
}

type NormalizedPersonUsage = {
  personId: string;
  isStaff: boolean;
  isActiveManager: boolean;
};

function normalizeActivePeople(people: readonly OrganizationPersonUsageInput[]): NormalizedPersonUsage[] {
  const normalized = new Map<string, NormalizedPersonUsage>();

  for (const person of people) {
    if (!person.isActiveInOrganization) continue;

    const current = normalized.get(person.personId) ?? {
      personId: person.personId,
      isStaff: false,
      isActiveManager: false,
    };
    current.isStaff ||= person.isStaff;
    current.isActiveManager ||= person.managerRole === "active";
    normalized.set(person.personId, current);
  }

  return [...normalized.values()];
}

function countsTowardPeopleLimit(person: NormalizedPersonUsage): boolean {
  return person.isStaff || person.isActiveManager;
}

export type OrganizationUsageSnapshot = {
  peopleCount: number;
  activeShopCount: number;
  activeManagerCount: number;
};

export type PlanLimitViolation = "people" | "activeShops" | "activeManagers";

export type OrganizationUsageLimitViolation = {
  kind: PlanLimitViolation;
  current: number;
  max: number;
  excess: number;
  isLowerBound?: true;
};

export type OrganizationUsageLimitStatus =
  | {
      kind: "withinLimits";
      evaluatedPlan: OrganizationEntitlementPlan;
      usage: OrganizationUsageSnapshot;
      limits: OrganizationPlanLimits;
    }
  | {
      kind: "overLimit";
      evaluatedPlan: OrganizationEntitlementPlan;
      usage: OrganizationUsageSnapshot;
      limits: OrganizationPlanLimits;
      violations: OrganizationUsageLimitViolation[];
      unknownDimensions?: PlanLimitViolation[];
    }
  | {
      kind: "unknown";
      evaluatedPlan: OrganizationEntitlementPlan;
      observedUsage: OrganizationUsageSnapshot;
      limits: OrganizationPlanLimits;
      unknownDimensions: PlanLimitViolation[];
      knownViolations: OrganizationUsageLimitViolation[];
    };

export type OrganizationAccessPolicy = {
  billingPolicy: OrganizationBillingPolicy;
  usageLimitStatus: OrganizationUsageLimitStatus | null;
  accessMode: OrganizationAccessMode;
  canWriteBusinessData: boolean;
  businessWriteBlockReason: OrganizationAccessBlockReason | null;
};

/** 現在の利用実数と適用プランから、保存しない上限適合状態を導出する。 */
export function evaluateOrganizationUsageLimits(input: {
  plan: OrganizationEntitlementPlan;
  usage: OrganizationUsageSnapshot;
}): OrganizationUsageLimitStatus {
  validateUsageSnapshot(input.usage);
  const limits = ORGANIZATION_PLAN_LIMITS[input.plan];
  const violations: OrganizationUsageLimitViolation[] = [];

  if (input.usage.peopleCount > limits.maxPeople) {
    violations.push({
      kind: "people",
      current: input.usage.peopleCount,
      max: limits.maxPeople,
      excess: input.usage.peopleCount - limits.maxPeople,
    });
  }
  if (input.usage.activeShopCount > limits.maxActiveShops) {
    violations.push({
      kind: "activeShops",
      current: input.usage.activeShopCount,
      max: limits.maxActiveShops,
      excess: input.usage.activeShopCount - limits.maxActiveShops,
    });
  }
  if (input.usage.activeManagerCount > limits.maxActiveManagers) {
    violations.push({
      kind: "activeManagers",
      current: input.usage.activeManagerCount,
      max: limits.maxActiveManagers,
      excess: input.usage.activeManagerCount - limits.maxActiveManagers,
    });
  }

  const common = {
    evaluatedPlan: input.plan,
    usage: input.usage,
    limits,
  };
  return violations.length === 0 ? { kind: "withinLimits", ...common } : { kind: "overLimit", ...common, violations };
}

/** 課金上の拒否を優先し、その次に利用上限超過による整理専用状態を合成する。 */
export function deriveOrganizationAccessPolicy(input: {
  billingPolicy: OrganizationBillingPolicy;
  usageLimitStatus: OrganizationUsageLimitStatus | null;
}): OrganizationAccessPolicy {
  if (!input.billingPolicy.canWriteBusinessData) {
    return {
      ...input,
      accessMode: "billingRecoveryOnly",
      canWriteBusinessData: false,
      businessWriteBlockReason: input.billingPolicy.businessWriteBlockReason,
    };
  }

  if (input.usageLimitStatus?.kind === "overLimit" || input.usageLimitStatus?.kind === "unknown") {
    return {
      ...input,
      accessMode: "limitRecoveryOnly",
      canWriteBusinessData: false,
      businessWriteBlockReason: "usageLimitExceeded",
    };
  }

  return {
    ...input,
    accessMode: "normal",
    canWriteBusinessData: true,
    businessWriteBlockReason: null,
  };
}

export function evaluatePlanLimits(plan: OrganizationPlan, usage: OrganizationUsageSnapshot) {
  validateUsageSnapshot(usage);
  const limits = ORGANIZATION_PLAN_LIMITS[plan];
  const violations: PlanLimitViolation[] = [];

  if (usage.peopleCount > limits.maxPeople) violations.push("people");
  if (usage.activeShopCount > limits.maxActiveShops) violations.push("activeShops");
  if (usage.activeManagerCount > limits.maxActiveManagers) violations.push("activeManagers");

  return {
    withinLimits: violations.length === 0,
    violations,
    limits,
  };
}

export type FreeEligibilityFailure = "activeManagerCount" | "activeShopCount" | "peopleCount";

export function evaluateFreeEligibility(usage: OrganizationUsageSnapshot) {
  validateUsageSnapshot(usage);
  const failures: FreeEligibilityFailure[] = [];

  if (usage.activeManagerCount < 1 || usage.activeManagerCount > ORGANIZATION_PLAN_LIMITS.free.maxActiveManagers) {
    failures.push("activeManagerCount");
  }
  if (usage.activeShopCount > ORGANIZATION_PLAN_LIMITS.free.maxActiveShops) failures.push("activeShopCount");
  if (usage.peopleCount > ORGANIZATION_PLAN_LIMITS.free.maxPeople) failures.push("peopleCount");

  return {
    eligible: failures.length === 0,
    failures,
  };
}

function validateUsageSnapshot(usage: OrganizationUsageSnapshot): void {
  requireNonNegativeInteger(usage.peopleCount, "peopleCount");
  requireNonNegativeInteger(usage.activeShopCount, "activeShopCount");
  requireNonNegativeInteger(usage.activeManagerCount, "activeManagerCount");
}

function requireNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer`);
  }
}

/**
 * 通常は事業者作成日の3か月後にあたる日付の00:00 JSTを返す。
 * 対象deploymentへ開発用日数が設定されていれば、N暦日後の00:00 JSTを返す。
 */
export function calculateTrialEndsAt(organizationCreatedAt: number): number {
  if (!Number.isFinite(organizationCreatedAt)) {
    throw new RangeError("organizationCreatedAt must be a finite timestamp");
  }

  const createdAtJst = new Date(organizationCreatedAt + JST_OFFSET_MS);
  const createdYear = createdAtJst.getUTCFullYear();
  const createdMonth = createdAtJst.getUTCMonth();
  const debugDurationDays = getDebugTrialDurationDays();
  if (debugDurationDays !== undefined) {
    const createdDayStartAt = jstMonthStartMs(createdYear, createdMonth) + (createdAtJst.getUTCDate() - 1) * DAY_MS;
    return createdDayStartAt + debugDurationDays * DAY_MS;
  }

  const targetMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 3);
  const nextMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 4);
  const lastDayOfTargetMonth = (nextMonthStartAt - targetMonthStartAt) / DAY_MS;
  const targetDay = Math.min(createdAtJst.getUTCDate(), lastDayOfTargetMonth);

  return targetMonthStartAt + (targetDay - 1) * DAY_MS;
}

export function getOrganizationBillingStateDeadline(state: PersistedOrganizationBillingState): number | null {
  const canonicalState = canonicalizeOrganizationBillingState(state);
  switch (canonicalState.kind) {
    case "trial":
      return canonicalState.trialEndsAt;
    case "scheduledChange":
      return canonicalState.effectiveAt;
    case "grace":
      return canonicalState.endsAt;
    case "initialPaymentPending":
    case "pendingActivation":
    case "active":
    case "complimentary":
    case "restricted":
      return null;
  }
}

export type ScheduledTransitionDecision =
  | { shouldApply: true; reason: "due" }
  | { shouldApply: false; reason: "staleVersion" | "staleDeadline" | "notDue" };

/**
 * schedulerへ渡したversionと期限を現在値へ突き合わせ、古いjobを安全にno-opへする。
 */
export function decideScheduledTransition(input: {
  state: OrganizationBillingState;
  currentVersion: number;
  expectedVersion: number;
  expectedDeadlineAt: number;
  now: number;
}): ScheduledTransitionDecision {
  if (input.currentVersion !== input.expectedVersion) {
    return { shouldApply: false, reason: "staleVersion" };
  }

  const currentDeadlineAt = getOrganizationBillingStateDeadline(input.state);
  if (currentDeadlineAt !== input.expectedDeadlineAt) {
    return { shouldApply: false, reason: "staleDeadline" };
  }

  if (input.now < currentDeadlineAt) {
    return { shouldApply: false, reason: "notDue" };
  }

  return { shouldApply: true, reason: "due" };
}
