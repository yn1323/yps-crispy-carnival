const STANDARD_PLAN_LIMITS = {
  maxPeople: 25,
  maxShops: 5,
  maxActiveManagers: 5,
} as const;

const PRO_PLAN_LIMITS = {
  maxPeople: 50,
  maxShops: 5,
  maxActiveManagers: 5,
} as const;

/**
 * Backend enforcementと画面表示が共有する、browser-safeなプラン上限契約。
 * 上限の適用可否と利用量の判定は、引き続きbackendのbilling policyを正本とする。
 */
export const ORGANIZATION_PLAN_LIMITS = {
  // Trialは表示上のライフサイクル名で、利用権限はProと同じ値を参照する。
  trial: PRO_PLAN_LIMITS,
  free: {
    maxPeople: 5,
    maxShops: 1,
    maxActiveManagers: 2,
  },
  standard: STANDARD_PLAN_LIMITS,
  pro: PRO_PLAN_LIMITS,
} as const;

export type OrganizationPlan = keyof typeof ORGANIZATION_PLAN_LIMITS;
export type OrganizationPaidPlan = "standard" | "pro";
export type OrganizationEntitlementPlan = "free" | OrganizationPaidPlan;
export type OrganizationDisplayPlan = "trial" | OrganizationEntitlementPlan;
export type OrganizationPlanLimits = (typeof ORGANIZATION_PLAN_LIMITS)[OrganizationPlan];
