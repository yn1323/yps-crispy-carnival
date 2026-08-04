export type LoginMethodCapabilities = {
  connectGoogle: boolean;
  reconnectGoogle: boolean;
  disconnectGoogle: boolean;
  setPassword: boolean;
  changePassword: boolean;
  removePassword: boolean;
  removeEmailAddress: boolean;
};

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
  };
  emailPassword: {
    passwordEnabled: boolean;
    verifiedEmails: LoginMethodsEmailViewModel[];
    unverifiedEmails: LoginMethodsEmailViewModel[];
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

export type EmailPasswordDialogState =
  | { isOpen: false }
  | {
      isOpen: true;
      step: "email" | "verification" | "password";
      targetEmailAddressId: string | null;
      targetMaskedEmail: string | null;
      passwordMode: "set" | "change";
    };

export type LoginMethodsController = {
  viewModel: LoginMethodsViewModel;
  isLoaded: boolean;
  googleState: LoginMethodsCardState;
  emailPasswordState: LoginMethodsCardState;
  emailPasswordDialog: EmailPasswordDialogState;
  reload: () => Promise<unknown>;
  connectGoogle: () => Promise<unknown>;
  reconnectGoogle: (externalAccountId: string) => Promise<unknown>;
  prepareGoogleDisconnect: (externalAccountId: string) => Promise<boolean | undefined>;
  disconnectGoogle: (externalAccountId: string) => Promise<unknown>;
  openEmailPasswordSetup: () => void;
  continueEmailVerification: (emailAddressId: string) => Promise<unknown>;
  openPasswordChange: () => void;
  closeEmailPasswordDialog: () => void;
  startEmailVerification: (email: string) => Promise<unknown>;
  verifyEmailCode: (code: string) => Promise<unknown>;
  resendEmailCode: () => Promise<unknown>;
  updatePassword: (values: {
    currentPassword?: string;
    newPassword: string;
    signOutOfOtherSessions: boolean;
  }) => Promise<unknown>;
  removePassword: (currentPassword?: string) => Promise<unknown>;
  removeEmailAddress: (emailAddressId: string) => Promise<unknown>;
};
