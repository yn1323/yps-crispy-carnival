import type { Infer } from "convex/values";
import { getDebugTrialDurationDays } from "../_lib/config";
import { jstMonthStartMs } from "../_lib/dateFormat";
import { DAY_MS } from "../constants";
import type { organizationBillingStateValidator } from "../organization/validators";
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

export type PersistedOrganizationBillingState = Infer<typeof organizationBillingStateValidator>;
export type CanonicalOrganizationBillingState = PersistedOrganizationBillingState;
export type OrganizationBillingState = PersistedOrganizationBillingState;
export type VerifiedBillingTransitionCause = "stateUpdate" | "activationFailed" | "scheduledChangeCanceled";

export type OrganizationBillingPlanResolution = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
};

/** 通常runtime用。履歴migrationのBusiness→Pro正規化とは分離する。 */
export function resolveOrganizationBillingPlans(
  state: PersistedOrganizationBillingState,
): OrganizationBillingPlanResolution {
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
        entitlementPlan: "free",
        displayPlan: "free",
        targetingPlan: "free",
      };
    case "pendingActivation":
      if (state.fallback === "free") {
        return { paidPlan: state.plan, entitlementPlan: "free", displayPlan: "free", targetingPlan: "free" };
      }
      return {
        paidPlan: state.plan,
        entitlementPlan: state.fallback,
        displayPlan: state.fallback,
        targetingPlan: state.fallback,
      };
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
    case "paymentTerminationPending":
      return {
        paidPlan: null,
        entitlementPlan: "free",
        displayPlan: "free",
        targetingPlan: "free",
      };
  }
}

/**
 * 現在の利用数へ適用するプランを、課金ライフサイクルとは独立して解決する。
 */
export function resolveUsageLimitPlan(state: PersistedOrganizationBillingState): OrganizationEntitlementPlan | null {
  switch (state.kind) {
    case "trial":
      return "pro";
    case "initialPaymentPending":
      return "free";
    case "pendingActivation":
      return state.fallback;
    case "active":
      return state.plan;
    case "complimentary":
      return "pro";
    case "scheduledChange":
      return state.currentPlan;
    case "paymentTerminationPending":
      return "free";
  }
}

/**
 * 検証済み課金結果の接続点で許可する状態遷移だけを列挙する。
 * Stripe等の到着順やクライアント状態を根拠に、業務状態を飛び越えさせない。
 */
export function isVerifiedBillingTransitionAllowed(
  current: PersistedOrganizationBillingState,
  next: PersistedOrganizationBillingState,
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
        (current.kind === "active" &&
          current.plan === "standard" &&
          next.plan === "pro" &&
          next.fallback === "standard") ||
        (current.kind === "pendingActivation" && current.plan === next.plan && current.fallback === next.fallback)
      );
    case "active":
      if (next.plan === "free") {
        return (
          (current.kind === "pendingActivation" && current.fallback === "free") ||
          current.kind === "paymentTerminationPending"
        );
      }
      if (current.kind === "scheduledChange") {
        if (cause === "scheduledChangeCanceled") return current.currentPlan === next.plan;
        return current.targetPlan === next.plan;
      }
      if (current.kind === "initialPaymentPending") return current.plan === next.plan;
      if (current.kind === "pendingActivation") {
        return (
          current.plan === next.plan ||
          (cause === "activationFailed" && current.fallback === "standard" && next.plan === "standard")
        );
      }
      if (current.kind !== "active") return false;
      if (current.plan === "free") return true;
      return current.plan === next.plan;
    case "scheduledChange":
      if (current.kind === "scheduledChange") {
        return current.currentPlan === next.currentPlan && current.targetPlan === next.targetPlan;
      }
      return current.kind === "active" && current.plan === next.currentPlan;
    case "paymentTerminationPending":
      if (current.kind === "paymentTerminationPending") {
        return current.previousPlan === next.previousPlan;
      }
      if (current.kind === "initialPaymentPending") return next.previousPlan === "trial";
      if (current.kind === "active") {
        return current.plan !== "free" && next.previousPlan === current.plan;
      }
      if (current.kind === "scheduledChange") {
        return next.previousPlan === current.currentPlan;
      }
      return false;
    case "trial":
      return false;
  }
}

export type BusinessWriteBlockReason = "paymentResultPending";
export type PaidFeatureBlockReason = "freePlan" | BusinessWriteBlockReason;
export type OrganizationAccessMode = "normal" | "limitRecoveryOnly";
export type OrganizationAccessBlockReason = BusinessWriteBlockReason | "usageLimitExceeded";

export type OrganizationBillingPolicy = {
  paidPlan: OrganizationPaidPlan | null;
  entitlementPlan: OrganizationEntitlementPlan | null;
  displayPlan: OrganizationDisplayPlan | null;
  targetingPlan: OrganizationDisplayPlan | null;
  limits: OrganizationPlanLimits | null;
  canReadExistingData: true;
  canWriteBusinessData: true;
  businessWriteBlockReason: BusinessWriteBlockReason | null;
  canManageManagers: boolean;
  canUsePaidFeatures: boolean;
  paidFeatureBlockReason: PaidFeatureBlockReason | null;
  deadlineAt: number | null;
};

/**
 * 課金状態だけから事業者全体の利用権限を導出する。
 */
export function deriveOrganizationBillingPolicy(state: PersistedOrganizationBillingState): OrganizationBillingPolicy {
  const plans = resolveOrganizationBillingPlans(state);
  switch (state.kind) {
    case "trial":
      return enabledPolicy(plans, state.trialEndsAt);
    case "initialPaymentPending":
      return freePolicy(plans.paidPlan);
    case "pendingActivation":
      // Freeからの契約開始は支払い成功までFree権利を維持し、有料機能だけを開放しない。
      if (state.fallback === "free") {
        return {
          ...freePolicy(plans.paidPlan),
          paidFeatureBlockReason: "paymentResultPending",
        };
      }
      // StandardからProへの即時変更は支払い成功までStandard権利を維持する。
      return enabledPolicy(plans, null);
    case "active":
      return state.plan === "free" ? freePolicy(null) : enabledPolicy(plans, null);
    case "complimentary":
      return enabledPolicy(plans, null);
    case "scheduledChange":
      // FreeまたはStandardへの変更予定は、期間終了まで現在の有料プランを維持する。
      return enabledPolicy(plans, state.effectiveAt);
    case "paymentTerminationPending":
      return freePolicy(null);
  }
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
    deadlineAt: null,
  };
}

export type OrganizationPersonUsageInput = {
  personId: string;
  isActiveInOrganization: boolean;
  isStaff: boolean;
  managerRole: "none" | "active";
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
 * Freeの管理者選択後の利用人数を投影する。
 * 管理者権限を外れてもスタッフ所属がある人物は利用人数へ含める。
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
  shopCount: number;
  activeManagerCount: number;
};

export type PlanLimitViolation = "people" | "shops" | "activeManagers";

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
  if (input.usage.shopCount > limits.maxShops) {
    violations.push({
      kind: "shops",
      current: input.usage.shopCount,
      max: limits.maxShops,
      excess: input.usage.shopCount - limits.maxShops,
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

/** 現在の利用数が上限内かどうかから、通常利用と上限整理専用状態を合成する。 */
export function deriveOrganizationAccessPolicy(input: {
  billingPolicy: OrganizationBillingPolicy;
  usageLimitStatus: OrganizationUsageLimitStatus | null;
}): OrganizationAccessPolicy {
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
  if (usage.shopCount > limits.maxShops) violations.push("shops");
  if (usage.activeManagerCount > limits.maxActiveManagers) violations.push("activeManagers");

  return {
    withinLimits: violations.length === 0,
    violations,
    limits,
  };
}

export type FreeEligibilityFailure = "activeManagerCount" | "shopCount" | "peopleCount";

export function evaluateFreeEligibility(usage: OrganizationUsageSnapshot) {
  validateUsageSnapshot(usage);
  const failures: FreeEligibilityFailure[] = [];

  if (usage.activeManagerCount < 1 || usage.activeManagerCount > ORGANIZATION_PLAN_LIMITS.free.maxActiveManagers) {
    failures.push("activeManagerCount");
  }
  if (usage.shopCount > ORGANIZATION_PLAN_LIMITS.free.maxShops) failures.push("shopCount");
  if (usage.peopleCount > ORGANIZATION_PLAN_LIMITS.free.maxPeople) failures.push("peopleCount");

  return {
    eligible: failures.length === 0,
    failures,
  };
}

function validateUsageSnapshot(usage: OrganizationUsageSnapshot): void {
  requireNonNegativeInteger(usage.peopleCount, "peopleCount");
  requireNonNegativeInteger(usage.shopCount, "shopCount");
  requireNonNegativeInteger(usage.activeManagerCount, "activeManagerCount");
}

function requireNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer`);
  }
}

/**
 * 通常は事業者作成日の2か月後にあたる日付の00:00 JSTを返す。
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

  const targetMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 2);
  const nextMonthStartAt = jstMonthStartMs(createdYear, createdMonth + 3);
  const lastDayOfTargetMonth = (nextMonthStartAt - targetMonthStartAt) / DAY_MS;
  const targetDay = Math.min(createdAtJst.getUTCDate(), lastDayOfTargetMonth);

  return targetMonthStartAt + (targetDay - 1) * DAY_MS;
}

export function getOrganizationBillingStateDeadline(state: PersistedOrganizationBillingState): number | null {
  switch (state.kind) {
    case "trial":
      return state.trialEndsAt;
    case "scheduledChange":
      return state.effectiveAt;
    case "initialPaymentPending":
    case "pendingActivation":
    case "active":
    case "complimentary":
    case "paymentTerminationPending":
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
