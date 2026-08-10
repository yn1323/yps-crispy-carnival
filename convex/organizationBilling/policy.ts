import type { Infer } from "convex/values";
import { getDebugTrialDurationDays } from "../_lib/config";
import { jstMonthStartMs } from "../_lib/dateFormat";
import type { organizationBillingStateValidator } from "../organization/validators";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PAYMENT_GRACE_PERIOD_MS = 14 * MS_PER_DAY;

const PRO_PLAN_LIMITS = {
  maxPeople: 20,
  maxActiveShops: 5,
  maxActiveManagers: 5,
} as const;

export const ORGANIZATION_PLAN_LIMITS = {
  // Trialは表示上のライフサイクル名で、利用権限はProと同じ値を参照する。
  trial: PRO_PLAN_LIMITS,
  free: {
    maxPeople: 5,
    maxActiveShops: 1,
    maxActiveManagers: 1,
  },
  pro: PRO_PLAN_LIMITS,
  business: {
    maxPeople: 40,
    maxActiveShops: 5,
    maxActiveManagers: 5,
  },
} as const;

export type OrganizationPlan = keyof typeof ORGANIZATION_PLAN_LIMITS;
export type OrganizationPaidPlan = "pro" | "business";
export type OrganizationEntitlementPlan = "free" | OrganizationPaidPlan;
export type OrganizationDisplayPlan = "trial" | OrganizationEntitlementPlan;
export type OrganizationPlanLimits = (typeof ORGANIZATION_PLAN_LIMITS)[OrganizationPlan];
export type OrganizationBillingState = Infer<typeof organizationBillingStateValidator>;
type PersistedRestrictedOrganizationBillingState = Extract<OrganizationBillingState, { kind: "restricted" }>;
export type RestrictedOrganizationBillingState = PersistedRestrictedOrganizationBillingState;
export type LegacyOrganizationBillingState =
  | Exclude<OrganizationBillingState, { kind: "complimentary" }>
  | { kind: "complimentary"; plan: "pro" | "business" };
/** m018だけが利用するBusiness→Pro履歴正規化後のshape。 */
export type CanonicalOrganizationBillingState =
  | Exclude<OrganizationBillingState, { kind: "complimentary" }>
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

function normalizeRestrictedState(
  state: PersistedRestrictedOrganizationBillingState,
): RestrictedOrganizationBillingState {
  const { previousPlan, ...rest } = state;
  return {
    ...rest,
    ...(previousPlan === undefined ? {} : { previousPlan: normalizeOrganizationActivePlan(previousPlan) }),
  };
}

/** m018用の履歴互換helper。BusinessをProへ畳む意味を変更しない。 */
export function normalizeOrganizationBillingState(
  state: LegacyOrganizationBillingState,
): CanonicalOrganizationBillingState {
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
          ? { restrictedFallbackState: normalizeRestrictedState(restrictedFallbackState) }
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
      return normalizeRestrictedState(state);
  }
}

export type OrganizationBillingPlanResolution = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
};

/** 通常runtime用。履歴migrationのBusiness→Pro正規化とは分離する。 */
export function resolveOrganizationBillingPlans(state: OrganizationBillingState): OrganizationBillingPlanResolution {
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
        // Trial由来の初回請求結果待ちはtargetがBusinessでもPro相当を維持する。
        entitlementPlan: "pro",
        displayPlan: state.plan,
        targetingPlan: state.plan,
      };
    case "pendingActivation": {
      if (state.fallback === "free") {
        return { paidPlan: state.plan, entitlementPlan: "free", displayPlan: "free", targetingPlan: "free" };
      }
      if (state.fallback === "pro") {
        return { paidPlan: state.plan, entitlementPlan: "pro", displayPlan: "pro", targetingPlan: "pro" };
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
        entitlementPlan: "business",
        displayPlan: "business",
        targetingPlan: "business",
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
          (state.previousPlan === "pro" || state.previousPlan === "business" ? state.previousPlan : null),
        entitlementPlan: null,
        displayPlan,
        targetingPlan: displayPlan,
      };
    }
  }
}

/** 通常runtimeで、表示中または変更先としてBusinessを参照する状態かを判定する。 */
export function billingStateReferencesBusinessPlan(state: OrganizationBillingState): boolean {
  const plans = resolveOrganizationBillingPlans(state);
  return plans.paidPlan === "business" || plans.targetingPlan === "business";
}

export function resolveRestrictedLimitPlan(state: RestrictedOrganizationBillingState): "free" | "pro" | null {
  if (state.limitPlan) return state.limitPlan;
  if (state.reason === "trialFreeConditionsNotMet" || state.reason === "freeConditionsNotMet") return "free";
  return null;
}

function resolveRestrictedDisplayPlan(state: RestrictedOrganizationBillingState): OrganizationDisplayPlan | null {
  return resolveRestrictedLimitPlan(state) ?? state.previousPlan ?? state.targetPlan ?? null;
}

export function hasLegacyBusinessBillingState(state: LegacyOrganizationBillingState): boolean {
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
  state: OrganizationBillingState,
): RestrictedOrganizationBillingState | null {
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
): Extract<OrganizationBillingState, { kind: "grace" }> {
  if (!Number.isSafeInteger(firstFailureAt) || firstFailureAt < 0) {
    throw new RangeError("firstFailureAt must be a non-negative safe integer timestamp");
  }
  const endsAt = firstFailureAt + PAYMENT_GRACE_PERIOD_MS;
  if (!Number.isSafeInteger(endsAt)) {
    throw new RangeError("payment grace deadline must be a safe integer timestamp");
  }
  return {
    kind: "grace",
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
  current: OrganizationBillingState,
  next: OrganizationBillingState,
  cause: VerifiedBillingTransitionCause = "stateUpdate",
): boolean {
  if (current.kind === "complimentary" || next.kind === "complimentary") return false;

  switch (next.kind) {
    case "initialPaymentPending":
      return (
        current.kind === "trial" && current.selectedPaidPlan !== undefined && current.selectedPaidPlan === next.plan
      );
    case "pendingActivation":
      return (
        (current.kind === "active" && current.plan === "free" && next.fallback === "free") ||
        (current.kind === "active" && current.plan === "pro" && next.plan === "business" && next.fallback === "pro") ||
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
          current.plan === next.plan || (cause === "paymentFailed" && current.fallback === "pro" && next.plan === "pro")
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
        return next.plan === "pro" && (next.targetPlan ?? next.plan) === current.plan;
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

export type OrganizationBillingPolicy = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
  limits: OrganizationPlanLimits | null;
  canReadExistingData: true;
  canWriteBusinessData: boolean;
  businessWriteBlockReason: BusinessWriteBlockReason | null;
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
export function deriveOrganizationBillingPolicy(state: OrganizationBillingState): OrganizationBillingPolicy {
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
      // ProからBusinessへの即時変更は支払い成功までPro権利を維持する。
      if (state.fallback === "pro") return enabledPolicy(plans, null);
      // 契約制限中からの契約開始は、支払い成功まで制限と復旧権限を維持する。
      return restrictedPolicy(plans);
    case "active":
      return state.plan === "free" ? freePolicy(null) : enabledPolicy(plans, null);
    case "complimentary":
      return enabledPolicy(plans, null);
    case "scheduledChange":
      // FreeまたはProへの変更予定は、期間終了まで現在の有料プランを維持する。
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

  if (usage.activeManagerCount !== 1) failures.push("activeManagerCount");
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
 * 通常は事業者作成日の2暦月後にあたる日付の00:00 JSTを返す。
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
    const createdDayStartAt = jstMonthStartMs(createdYear, createdMonth) + (createdAtJst.getUTCDate() - 1) * MS_PER_DAY;
    return createdDayStartAt + debugDurationDays * MS_PER_DAY;
  }

  const targetMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 2);
  const nextMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 3);
  const lastDayOfTargetMonth = (nextMonthStartAt - targetMonthStartAt) / MS_PER_DAY;
  const targetDay = Math.min(createdAtJst.getUTCDate(), lastDayOfTargetMonth);

  return targetMonthStartAt + (targetDay - 1) * MS_PER_DAY;
}

export function getOrganizationBillingStateDeadline(state: OrganizationBillingState): number | null {
  switch (state.kind) {
    case "trial":
      return state.trialEndsAt;
    case "scheduledChange":
      return state.effectiveAt;
    case "grace":
      return state.endsAt;
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
