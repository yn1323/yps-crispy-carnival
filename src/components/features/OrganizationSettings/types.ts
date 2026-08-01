import type { ShopFormData } from "@/src/components/features/ShopForm";
import type { OrganizationSettingsFeatures } from "@/src/domains/featureVisibility";
import type { OrganizationContextModel } from "./OrganizationContext/script";

export type OrganizationSettingsTab = "people" | "shops" | "billing" | "settings";

export type OrganizationPersonView = {
  id: string;
  name: string;
  email: string | null;
  managerRole: "active" | "readOnly" | "none";
  isStaff: boolean;
  // TODO[narrow]: 対応queryの全deployment反映と旧frontendのdrain後にrequired化する。
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
  | "expired"
  | "revoked"
  | "accepted"
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
  // TODO[narrow]: billing viewの全deployment反映と旧DTO callerのdrain後に削除する。
  | "scheduledFree"
  | "migrationPending";

export type BillingUsageView = {
  current: number;
  max: number;
  // TODO[narrow]: billing viewの全deployment反映と旧frontendのdrain後にrequired化する。
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
  // TODO[narrow]: billing viewの全deployment反映と旧frontendのdrain後にrequired化する。
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

/**
 * ダークローンチ中に公開している導線。サーバー側の判定結果をそのまま受け取る。
 *
 * 可否（`can*`）とは別に持つ。可否は「上限に達したので理由を出す」を表し、
 * こちらは「未公開なので何も出さない」を表す。
 */
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
  features: OrganizationSettingsFeatures;
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
  | "features"
> & {
  // TODO[narrow]: 対応backendの全deployment反映と旧frontend互換期間終了後にrequired化する。
  features?: OrganizationSettingsFeatures;
};
