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
  | "scheduledFree"
  | "scheduledPro"
  | "migrationPending";

export type BillingUsageView = {
  current: number;
  max: number;
};

export type BillingInvoiceView = {
  id: string;
  issuedAt: string;
  status: "paid" | "open" | "void";
};

export type OrganizationBillingView = {
  state: BillingDisplayState;
  currentPlan: "trial" | "free" | "pro" | "business" | null;
  isComplimentary: boolean;
  targetPlan?: "free" | "pro" | "business";
  peopleUsage: BillingUsageView;
  shopUsage: BillingUsageView;
  nextEvent?: {
    label: string;
    date: string;
  };
  blockedReason?: string;
  paymentMethodLabel?: string;
  billingEmail: string;
  previousPlan?: "trial" | "free" | "pro" | "business";
  invoices: BillingInvoiceView[];
  canManagePlan: boolean;
  canUpdatePaymentMethod: boolean;
  canUpdateBillingEmail: boolean;
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
  onOpenShopSettings: (shopId: string) => void;
  onManagePlan: () => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenInvoice: (invoiceId: string) => void;
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
