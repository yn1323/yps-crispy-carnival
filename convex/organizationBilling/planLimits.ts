// 内部proは利用者向けStandardに対応する。
const PRO_PLAN_LIMITS = {
  maxPeople: 25,
  maxActiveShops: 5,
  maxActiveManagers: 5,
} as const;

// 内部businessは利用者向けProに対応する。
const BUSINESS_PLAN_LIMITS = {
  maxPeople: 50,
  maxActiveShops: 5,
  maxActiveManagers: 5,
} as const;

/**
 * Backend enforcementと画面表示が共有する、browser-safeなプラン上限契約。
 * 上限の適用可否と利用量の判定は、引き続きbackendのbilling policyを正本とする。
 */
export const ORGANIZATION_PLAN_LIMITS = {
  // Trialは表示上のライフサイクル名で、利用権限は内部business（表示名Pro）と同じ値を参照する。
  trial: BUSINESS_PLAN_LIMITS,
  free: {
    maxPeople: 5,
    maxActiveShops: 1,
    maxActiveManagers: 2,
  },
  pro: PRO_PLAN_LIMITS,
  business: BUSINESS_PLAN_LIMITS,
} as const;

export type OrganizationPlan = keyof typeof ORGANIZATION_PLAN_LIMITS;
export type OrganizationPaidPlan = "pro" | "business";
export type OrganizationEntitlementPlan = "free" | OrganizationPaidPlan;
export type OrganizationDisplayPlan = "trial" | OrganizationEntitlementPlan;
export type OrganizationPlanLimits = (typeof ORGANIZATION_PLAN_LIMITS)[OrganizationPlan];
