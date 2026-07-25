import type { ShopFormData } from "@/src/components/features/ShopForm";
import type { OrganizationContextModel } from "./OrganizationContext/script";

export type OrganizationSettingsTab = "people" | "shops" | "billing" | "settings";

export type OrganizationPersonView = {
  id: string;
  name: string;
  email: string | null;
  managerRole: "active" | "readOnly" | "none";
  isStaff: boolean;
  isLineConnected?: boolean;
  hasManagerInvitation?: boolean;
  shopNames: string[];
  shopIds: string[];
  canRemoveManagerRole: boolean;
  managerRoleRemovalDisabledReason?: string;
  canRemove: boolean;
  removeDisabledReason?: string;
};

export type ManagerInvitationStatus =
  | "pending"
  | "issued"
  | "expired"
  | "revoked"
  | "accepted"
  | "linked"
  | "sendFailed"
  | "limitReached"
  | "conflict";

export type ManagerInvitationView = {
  id: string;
  email: string;
  status: ManagerInvitationStatus;
  statusDetail?: string;
  expiresAt?: string;
  canResend: boolean;
  canRevoke: boolean;
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
  | "pro"
  | "business"
  | "initialPaymentPending"
  | "pendingActivation"
  | "grace"
  | "restricted"
  | "scheduledChange"
  // Widen中の旧DTOを表示し続けるための互換値。新runtimeはscheduledChangeを返す。
  | "scheduledFree"
  | "migrationPending";

export type BillingUsageView = {
  current: number;
  max: number;
  pendingInvitations?: number;
};

export type BillingPlan = "trial" | "free" | "pro" | "business";
export type BillingProductPlan = Exclude<BillingPlan, "trial">;
export type PaidBillingPlan = Exclude<BillingProductPlan, "free">;

export type BillingPlanPrice = {
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
};

export type BillingPlanPriceState =
  | { status: "loading" }
  | { status: "available"; value: BillingPlanPrice }
  | { status: "unavailable"; reason: string }
  | { status: "error" };

export type BillingPlanPrices = Record<PaidBillingPlan, BillingPlanPriceState>;

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
  limitPlan?: "free" | "pro";
  requiredReductions?: BillingRequiredReductions;
  peopleUsage: BillingUsageView;
  shopUsage: BillingUsageView;
  managerUsage: BillingUsageView;
  nextEvent?: {
    label: string;
    date: string;
  };
  blockedReason?: string;
  billingEmail: string;
  previousPlan?: BillingPlan;
  canManagePlan: boolean;
  canUpdatePaymentMethod: boolean;
  canUpdateBillingEmail: boolean;
  canScheduleFree: boolean;
  managePlanDisabledReason?: string;
  paymentMethodDisabledReason?: string;
  billingEmailDisabledReason?: string;
};

export type OrganizationSettingsActions = {
  onSelectOrganization: (shopId: string) => void;
  onUpdateOrganizationName: () => void;
  onInviteManager: () => void;
  onOpenUser: (personId: string, visibleUserCount: number) => void;
  onAddShop: () => void;
  onOpenShop: (shopId: string) => void;
  onManagePlan: (targetPlan: BillingProductPlan) => void;
  onRetryPlanPrice: (targetPlan: PaidBillingPlan) => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenBillingDocuments: () => void;
  onDeleteOrganization: () => void;
  onCreateOrganization: () => void;
};

export type OrganizationSettingsViewProps = {
  organizationContext: OrganizationContextModel;
  organizationId?: string;
  organizationUpdatedAt?: number;
  organizationName: string;
  people: OrganizationPersonView[];
  managerInvitations: ManagerInvitationView[];
  shops: OrganizationShopView[];
  billing: OrganizationBillingView;
  planPrices: BillingPlanPrices;
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  inviteManagerDisabledReason?: string;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  canAddShop: boolean;
  addShopDisabledReason?: string;
  canDeleteOrganization: boolean;
  deleteOrganizationDisabledReason?: string;
  canCreateOrganization: boolean;
  createOrganizationDisabledReason?: string;
  actions: OrganizationSettingsActions;
  defaultTab?: OrganizationSettingsTab;
  onTabChange?: (tab: OrganizationSettingsTab) => void;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
};

export type OrganizationSettingsData = Omit<
  OrganizationSettingsViewProps,
  | "organizationContext"
  | "planPrices"
  | "actions"
  | "defaultTab"
  | "onTabChange"
  | "initialVisibleUserCount"
  | "focusedPersonId"
  | "onVisibleUserCountChange"
>;
