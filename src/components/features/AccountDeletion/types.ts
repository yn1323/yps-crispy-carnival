export type AccountDeletionErrorState = {
  message: string;
  showContactLink: boolean;
};

export type AccountDeletionAction = "accountOnly" | "leaveOrganization" | "deleteOrganization";

export type AccountDeletionBlockedReason =
  | "multipleOrganizations"
  | "billingContactTransferRequired"
  | "recoveryManagerTransferRequired"
  | "organizationDeletionUnavailable"
  | "tooManyAssociatedRecords"
  | "tooManyFutureAssignments"
  | "inconsistentAssociation"
  | "providerConfigurationUnavailable"
  | "deletionAlreadyRequested"
  | "unavailable";

type OrganizationPreview = {
  name: string;
  shopCount: number;
};

export type AccountDeletionReadyPreview =
  | {
      status: "ready";
      action: "accountOnly";
      previewFingerprint: string;
    }
  | {
      status: "ready";
      action: "leaveOrganization";
      previewFingerprint: string;
      organization: OrganizationPreview;
      futureAssignmentCount: number;
    }
  | {
      status: "ready";
      action: "deleteOrganization";
      previewFingerprint: string;
      organization: OrganizationPreview;
    };

export type AccountDeletionBlockedPreview = {
  status: "blocked";
  reason: AccountDeletionBlockedReason;
};

export type AccountDeletionPreview = AccountDeletionReadyPreview | AccountDeletionBlockedPreview;
