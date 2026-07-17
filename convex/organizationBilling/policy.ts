import type { Infer } from "convex/values";
import { jstMonthStartMs } from "../_lib/dateFormat";
import type { organizationBillingStateValidator } from "../organization/validators";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const PAYMENT_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

export const ORGANIZATION_PLAN_LIMITS = {
  trial: {
    maxPeople: 30,
    maxActiveShops: 5,
    maxActiveManagers: 5,
  },
  free: {
    maxPeople: 4,
    maxActiveShops: 1,
    maxActiveManagers: 1,
  },
  pro: {
    maxPeople: 15,
    maxActiveShops: 5,
    maxActiveManagers: 5,
  },
  business: {
    maxPeople: 30,
    maxActiveShops: 5,
    maxActiveManagers: 5,
  },
} as const;

export type OrganizationPlan = keyof typeof ORGANIZATION_PLAN_LIMITS;
export type OrganizationPlanLimits = (typeof ORGANIZATION_PLAN_LIMITS)[OrganizationPlan];
export type OrganizationBillingState = Infer<typeof organizationBillingStateValidator>;
export type RestrictedOrganizationBillingState = Extract<OrganizationBillingState, { kind: "restricted" }>;
export type VerifiedBillingTransitionCause = "stateUpdate" | "scheduledChangeCanceled";

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
  plan: "pro" | "business",
  firstFailureAt: number,
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
        (current.kind === "restricted" && next.fallback === "restricted") ||
        (current.kind === "pendingActivation" && current.plan === next.plan && current.fallback === next.fallback)
      );
    case "active":
      if (next.plan === "free") {
        return current.kind === "pendingActivation" && current.fallback === "free";
      }
      if (current.kind === "scheduledChange") {
        return cause === "scheduledChangeCanceled" && current.currentPlan === next.plan;
      }
      if (
        current.kind === "initialPaymentPending" ||
        current.kind === "pendingActivation" ||
        current.kind === "grace"
      ) {
        return current.plan === next.plan;
      }
      if (current.kind === "restricted") return true;
      if (current.kind !== "active") return false;
      if (current.plan === "free") return true;
      return current.plan === next.plan || (current.plan === "pro" && next.plan === "business");
    case "grace":
      return (
        ((current.kind === "active" && current.plan !== "free") || current.kind === "initialPaymentPending") &&
        current.plan === next.plan
      );
    case "scheduledChange":
      if (current.kind === "scheduledChange") {
        return (
          current.currentPlan === next.currentPlan &&
          current.targetPlan === next.targetPlan &&
          current.effectiveAt === next.effectiveAt
        );
      }
      if (current.kind !== "active" || current.plan === "free" || current.plan !== next.currentPlan) return false;
      return next.targetPlan === "free" || (current.plan === "business" && next.targetPlan === "pro");
    case "trial":
      return false;
    case "restricted":
      return current.kind === "pendingActivation" && current.fallback === "restricted";
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
  entitlementPlan: OrganizationPlan | null;
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
  switch (state.kind) {
    case "trial":
      return enabledPolicy("trial", state.trialEndsAt);
    case "initialPaymentPending":
      // 初回請求結果を待つ間は、選択済みの有料プランの権利を継続する。
      return enabledPolicy(state.plan, null);
    case "pendingActivation":
      // Freeからの契約開始は支払い成功までFree権利を維持し、有料機能だけを開放しない。
      if (state.fallback === "free") {
        return {
          ...freePolicy(),
          paidFeatureBlockReason: "paymentResultPending",
        };
      }
      // 契約制限中からの契約開始は、支払い成功まで制限と復旧権限を維持する。
      return restrictedPolicy();
    case "active":
      return state.plan === "free" ? freePolicy() : enabledPolicy(state.plan, null);
    case "complimentary":
      return enabledPolicy("business", null);
    case "scheduledChange":
      // FreeまたはProへの変更予定は、期間終了まで現在の有料プランを維持する。
      return enabledPolicy(state.currentPlan, state.effectiveAt);
    case "grace":
      // 猶予中も元の有料プランを通常どおり利用できる。
      return enabledPolicy(state.plan, state.endsAt);
    case "restricted":
      return restrictedPolicy();
  }
}

function restrictedPolicy(): OrganizationBillingPolicy {
  return {
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

function enabledPolicy(plan: Exclude<OrganizationPlan, "free">, deadlineAt: number | null): OrganizationBillingPolicy {
  return {
    entitlementPlan: plan,
    limits: ORGANIZATION_PLAN_LIMITS[plan],
    canReadExistingData: true,
    canWriteBusinessData: true,
    businessWriteBlockReason: null,
    canUsePaidFeatures: true,
    paidFeatureBlockReason: null,
    allowedRecoveryCapabilities: NO_RECOVERY_CAPABILITIES,
    deadlineAt,
  };
}

function freePolicy(): OrganizationBillingPolicy {
  return {
    entitlementPlan: "free",
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
 * 事業者作成月とその翌月の末日を無料体験期間とし、翌々月1日00:00 JSTを返す。
 */
export function calculateTrialEndsAt(organizationCreatedAt: number): number {
  if (!Number.isFinite(organizationCreatedAt)) {
    throw new RangeError("organizationCreatedAt must be a finite timestamp");
  }

  const createdAtJst = new Date(organizationCreatedAt + JST_OFFSET_MS);
  return jstMonthStartMs(createdAtJst.getUTCFullYear(), createdAtJst.getUTCMonth() + 2);
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
