export type LoginMethodState = "googleOnly" | "passwordOnly" | "googleAndPassword";

export type LoginMethodsEmailSnapshot = {
  id: string;
  emailAddress: string;
  verificationStatus: string | null;
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
  emailAddress: string;
  verificationStatus: "verified" | "unverified";
};

export type LoginMethodsGoogleAccountViewModel = {
  id: string;
  emailAddress: string;
  status: "connected" | "needsReconnection";
  canDisconnect: boolean;
  disconnectUnavailableReason: string | null;
};

export type LoginMethodsViewModel = {
  status: "ready" | "unavailable";
  methodState: LoginMethodState | null;
  google: {
    accounts: LoginMethodsGoogleAccountViewModel[];
    canConnect: boolean;
    canReconnect: boolean;
  };
  emailPassword: {
    primaryEmail: LoginMethodsEmailViewModel | null;
    canChangeLoginEmail: boolean;
    canChangePassword: boolean;
    canSetPassword: boolean;
  };
};

export type LoginMethodsCardState = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
};

export type LoginEmailChangeDialogState =
  | { isOpen: false }
  | {
      isOpen: true;
      step: "input" | "verification";
      currentEmailAddress: string;
      targetEmailAddressId: string | null;
      targetEmailAddress: string | null;
    };

export type LoginMethodsController = {
  viewModel: LoginMethodsViewModel;
  isLoaded: boolean;
  googleState: LoginMethodsCardState;
  emailPasswordState: LoginMethodsCardState;
  emailChangeDialog: LoginEmailChangeDialogState;
  reload: () => Promise<unknown>;
  prepareGoogleDisconnect: (externalAccountId: string) => Promise<boolean | undefined>;
  disconnectGoogle: (externalAccountId: string) => Promise<unknown>;
  openLoginEmailChange: () => void;
  closeLoginEmailChangeDialog: (force?: boolean) => void;
  backToLoginEmailInput: () => void;
  startLoginEmailChange: (email: string) => Promise<unknown>;
  verifyLoginEmailCode: (code: string) => Promise<unknown>;
  resendLoginEmailCode: () => Promise<unknown>;
};
