import type { ShopFormData } from "@/src/components/features/ShopForm";

export type OrganizationPersonView = {
  id: string;
  name: string;
  email: string | null;
  managerRole: "active" | "none";
  isStaff: boolean;
  // TODO[narrow]: 対応queryの全deployment反映と旧frontendのdrain後にrequired化する。
  isLineConnected?: boolean;
  lineStatus?: "unlinked" | "linked_following" | "linked_unfollowed";
  hasManagerInvitation?: boolean;
  shopNames: string[];
  shopIds: string[];
  canRemoveManagerRole: boolean;
  managerRoleRemovalDisabledReason?: string;
  canRemove: boolean;
  removeDisabledReason?: string;
};

export type OrganizationShopView = {
  id: string;
  name: string;
  regularClosedDays: ShopFormData["regularClosedDays"];
  submissionPattern: ShopFormData["submissionPattern"];
  staffCount: number;
  canUpdateSettings: boolean;
  settingsDisabledReason?: string;
  canDelete: boolean;
  deleteDisabledReason?: string;
};

export type BillingDisplayState =
  | "trial"
  | "free"
  | "standard"
  | "pro"
  | "initialPaymentPending"
  | "pendingActivation"
  | "scheduledChange"
  | "migrationPending";

export type BillingUsageView = {
  current: number;
  max: number;
  // TODO[narrow]: billing viewの全deployment反映と旧frontendのdrain後にrequired化する。
  pendingInvitations?: number;
};

export type BillingPlan = "trial" | "free" | "standard" | "pro";
export type BillingProductPlan = Exclude<BillingPlan, "trial">;
export type PaidBillingPlan = Exclude<BillingProductPlan, "free">;

export type BillingPlanPrice = {
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  taxBehavior: "inclusive" | "exclusive";
};

export type BillingPlanPriceState =
  | { status: "loading" }
  | { status: "available"; value: BillingPlanPrice }
  | { status: "unavailable"; reason: string }
  | { status: "error" };

export type BillingPlanPrices = Record<PaidBillingPlan, BillingPlanPriceState>;

export type BillingPendingCheckoutStatus = "idle" | "checking" | "open" | "pending" | "unavailable";

export type BillingRequiredReductions = {
  people: number;
  shops: number;
  managers: number;
};

export type OrganizationBillingView = {
  state: BillingDisplayState;
  currentPlan: BillingPlan | null;
  isComplimentary: boolean;
  hasTrialContinuation: boolean;
  trialEndsAt?: number;
  stripeBillingAvailable: boolean;
  hasStripeCustomer: boolean;
  targetPlan?: BillingProductPlan;
  restrictAtPeriodEnd?: true;
  // TODO[narrow]: billing viewの全deployment反映と旧frontendのdrain後にrequired化する。
  requiredReductions?: BillingRequiredReductions;
  peopleUsage: BillingUsageView;
  shopUsage: BillingUsageView;
  managerUsage: BillingUsageView;
  nextEvent?: {
    label: string;
    date: string;
  };
  paymentFailure?: {
    terminationPending: boolean;
  };
  blockedReason?: string;
  billingEmail: string;
  canManagePlan: boolean;
  canUpdatePaymentMethod: boolean;
  canUpdateBillingEmail: boolean;
  canScheduleFree: boolean;
  managePlanDisabledReason?: string;
  paymentMethodDisabledReason?: string;
  billingEmailDisabledReason?: string;
};
