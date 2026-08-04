export type LoginMethodCapabilities = {
  connectGoogle: boolean;
  reconnectGoogle: boolean;
  disconnectGoogle: boolean;
  setPassword: boolean;
  changePassword: boolean;
  removePassword: boolean;
  removeEmailAddress: boolean;
  replaceGoogleAccount: boolean;
};

export type PendingLoginMethodRemovalKind = "google" | "password";

export type LoginMethodsEmailSnapshot = {
  id: string;
  emailAddress: string;
  verificationStatus: string | null;
  linkedTo: readonly { id: string; type: string }[];
};

export type LoginMethodsExternalAccountSnapshot = {
  id: string;
  provider: string;
  emailAddress: string;
  verificationStatus: string | null;
};

export type LoginMethodsUserSnapshot = {
  primaryEmailAddressId: string | null;
  passwordEnabled: boolean;
  emailAddresses: readonly LoginMethodsEmailSnapshot[];
  externalAccounts: readonly LoginMethodsExternalAccountSnapshot[];
};

export type LoginMethodsEmailViewModel = {
  id: string;
  maskedEmail: string;
  verificationStatus: "verified" | "unverified";
  isPrimary: boolean;
  isLinked: boolean;
  loginEmailChangeAction: "verify" | "switch" | null;
  canRemove: boolean;
  removeUnavailableReason: string | null;
};

export type LoginMethodsGoogleAccountViewModel = {
  id: string;
  maskedEmail: string;
  status: "connected" | "needsReconnection";
  canDisconnect: boolean;
  disconnectUnavailableReason: string | null;
};

export type LoginMethodsViewModel = {
  status: "ready" | "unavailable";
  google: {
    accounts: LoginMethodsGoogleAccountViewModel[];
    canConnect: boolean;
    connectUnavailableReason: string | null;
    canReconnect: boolean;
    canReplace: boolean;
    replaceUnavailableReason: string | null;
  };
  emailPassword: {
    passwordEnabled: boolean;
    primaryEmail: LoginMethodsEmailViewModel | null;
    verifiedEmails: LoginMethodsEmailViewModel[];
    unverifiedEmails: LoginMethodsEmailViewModel[];
    canChangeLoginEmail: boolean;
    loginEmailChangeUnavailableReason: string | null;
    canSetPassword: boolean;
    canChangePassword: boolean;
    canRemovePassword: boolean;
    passwordRemovalUnavailableReason: string | null;
  };
};

export type LoginMethodsCardState = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
};

export type EmailPasswordDialogState = { isOpen: boolean };

export type LoginEmailChangeDialogState =
  | { isOpen: false }
  | {
      isOpen: true;
      step: "input" | "verification";
      currentMaskedEmail: string;
      targetEmailAddressId: string | null;
      targetMaskedEmail: string | null;
    };

export type LoginMethodsController = {
  viewModel: LoginMethodsViewModel;
  isLoaded: boolean;
  googleState: LoginMethodsCardState;
  emailPasswordState: LoginMethodsCardState;
  emailPasswordDialog: EmailPasswordDialogState;
  emailChangeDialog: LoginEmailChangeDialogState;
  reload: () => Promise<unknown>;
  reconnectGoogle: (externalAccountId: string) => Promise<unknown>;
  prepareGoogleDisconnect: (externalAccountId: string) => Promise<boolean | undefined>;
  preparePasswordRemoval: () => Promise<boolean | undefined>;
  disconnectGoogle: (externalAccountId: string) => Promise<unknown>;
  openPasswordChange: () => void;
  closeEmailPasswordDialog: (force?: boolean) => void;
  updatePassword: (values: {
    currentPassword?: string;
    newPassword: string;
    signOutOfOtherSessions: boolean;
  }) => Promise<unknown>;
  removePassword: (currentPassword?: string) => Promise<unknown>;
  removeEmailAddress: (emailAddressId: string) => Promise<unknown>;
  openLoginEmailChange: () => void;
  continueLoginEmailChange: (emailAddressId: string) => Promise<unknown>;
  closeLoginEmailChangeDialog: (force?: boolean) => void;
  backToLoginEmailInput: () => void;
  startLoginEmailChange: (email: string) => Promise<unknown>;
  verifyLoginEmailCode: (code: string) => Promise<unknown>;
  resendLoginEmailCode: () => Promise<unknown>;
  confirmLoginEmailChange: () => Promise<unknown>;
};
