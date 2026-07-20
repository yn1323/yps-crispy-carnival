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
  | "initialPaymentPending"
  | "pendingActivation"
  | "grace"
  | "restricted"
  | "scheduledFree"
  | "migrationPending";

export type BillingUsageView = {
  current: number;
  max: number;
};

export type OrganizationBillingView = {
  state: BillingDisplayState;
  currentPlan: "trial" | "free" | "pro" | null;
  isComplimentary: boolean;
  hasTrialContinuation: boolean;
  trialEndsAt?: number;
  stripeBillingAvailable: boolean;
  hasStripeCustomer: boolean;
  targetPlan?: "free" | "pro";
  peopleUsage: BillingUsageView;
  shopUsage: BillingUsageView;
  nextEvent?: {
    label: string;
    date: string;
  };
  blockedReason?: string;
  billingEmail: string;
  previousPlan?: "trial" | "free" | "pro";
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
  onManagePlan: () => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenBillingDocuments: () => void;
  onDeleteOrganization: () => void;
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
  | "actions"
  | "defaultTab"
  | "onTabChange"
  | "initialVisibleUserCount"
  | "focusedPersonId"
  | "onVisibleUserCountChange"
>;
