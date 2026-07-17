import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import type { OrganizationContextModel } from "./OrganizationContext/script";

export type OrganizationSettingsTab = "people" | "shops" | "billing";

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
  staffCount: number;
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
  onUpdatePersonProfile: (personId: string, data: PersonProfileFormData) => Promise<boolean | undefined>;
  onAssignManager: (personId: string) => Promise<boolean | undefined>;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
  onAddShop: () => void;
  onOpenShop: (shopId: string) => void;
  onManagePlan: () => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export type OrganizationSettingsViewProps = {
  organizationContext: OrganizationContextModel;
  organizationName: string;
  people: OrganizationPersonView[];
  managerInvitations: ManagerInvitationView[];
  shops: OrganizationShopView[];
  billing: OrganizationBillingView;
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  inviteManagerDisabledReason?: string;
  isUpdatingPersonProfile?: boolean;
  isAssigningManager?: boolean;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  canAddShop: boolean;
  addShopDisabledReason?: string;
  actions: OrganizationSettingsActions;
  defaultTab?: OrganizationSettingsTab;
  onTabChange?: (tab: OrganizationSettingsTab) => void;
};

export type OrganizationSettingsData = Omit<
  OrganizationSettingsViewProps,
  "organizationContext" | "actions" | "defaultTab" | "onTabChange"
>;
