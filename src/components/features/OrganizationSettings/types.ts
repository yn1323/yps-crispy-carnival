export type OrganizationPersonView = {
  id: string;
  name: string;
  email: string | null;
  managerRole: "active" | "readOnly" | "none";
  isStaff: boolean;
  shopNames: string[];
  currentShopStaffId: string | null;
  canRemoveFromCurrentShop: boolean;
  removeFromCurrentShopDisabledReason?: string;
  canRemoveManagerRole: boolean;
  managerRoleRemovalDisabledReason?: string;
  countsTowardPeopleLimit: boolean;
  futureAssignments?: Array<{
    date: string;
    startTime: string;
    endTime: string;
    shopName: string;
    periodStart: string;
    periodEnd: string;
  }>;
  hasMoreFutureAssignments?: boolean;
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
  status: "active" | "archived" | "planSuspended";
  isFreeRetainedShop: boolean;
  canArchive: boolean;
  canReactivate: boolean;
  actionDisabledReason?: string;
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
  canScheduleFree: boolean;
  managePlanDisabledReason?: string;
  paymentMethodDisabledReason?: string;
  billingEmailDisabledReason?: string;
};

export type FreeSelectionSummary = {
  selectedManagerId: string | null;
  selectedManagerName: string | null;
  selectedShopId: string | null;
  selectedShopName: string | null;
  managerCandidates: Array<{ id: string; name: string; projectedPeopleCount: number }>;
  shopCandidates: Array<{ id: string; name: string }>;
  projectedPeopleCount: number;
  readOnlyManagerNames: string[];
  suspendedShopNames: string[];
  isComplete: boolean;
  incompleteReason?: string;
};

export type OrganizationSettingsActions = {
  onUpdateOrganizationName: () => void;
  onInviteManager: () => void;
  onRemovePersonFromCurrentShop: (personId: string) => void;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
  onResendInvitation: (invitationId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
  onAddShop: () => void;
  onArchiveShop: (shopId: string) => void;
  onReactivateShop: (shopId: string) => void;
  onManagePlan: () => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenInvoice: (invoiceId: string) => void;
  onSaveFreeSelection: (managerPersonId: string | null, shopId: string | null) => void | Promise<void>;
};

export type OrganizationSettingsViewProps = {
  organizationName: string;
  currentShopName: string;
  people: OrganizationPersonView[];
  managerInvitations: ManagerInvitationView[];
  shops: OrganizationShopView[];
  billing: OrganizationBillingView;
  freeSelection: FreeSelectionSummary;
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  inviteManagerDisabledReason?: string;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  canAddShop: boolean;
  addShopDisabledReason?: string;
  actions: OrganizationSettingsActions;
  defaultTab?: "people" | "shops" | "billing";
};

export type OrganizationSettingsData = Omit<OrganizationSettingsViewProps, "actions" | "defaultTab">;
