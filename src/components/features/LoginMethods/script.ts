import type {
  LoginMethodState,
  LoginMethodsEmailSnapshot,
  LoginMethodsEmailViewModel,
  LoginMethodsExternalAccountSnapshot,
  LoginMethodsUserSnapshot,
  LoginMethodsViewModel,
} from "./types";

const EMAIL_PASSWORD_REQUIRED_REASON = "確認済みメールアドレスとパスワードを設定してから操作してください。";

export function buildLoginMethodsViewModel(snapshot: LoginMethodsUserSnapshot): LoginMethodsViewModel {
  const verifiedEmails = snapshot.emailAddresses.filter(isVerifiedEmail);
  const googleAccounts = snapshot.externalAccounts.filter((account) => account.provider === "google");
  const verifiedGoogleAccounts = googleAccounts.filter((account) => account.verificationStatus === "verified");
  const hasEmailPasswordMethod = snapshot.passwordEnabled && verifiedEmails.length > 0;
  const methodState = deriveLoginMethodState(hasEmailPasswordMethod, verifiedGoogleAccounts.length > 0);
  const primaryEmail = snapshot.emailAddresses.find((email) => email.id === snapshot.primaryEmailAddressId);
  const hasVerifiedPrimaryEmail = primaryEmail ? isVerifiedEmail(primaryEmail) : false;

  const toEmailViewModel = (email: LoginMethodsEmailSnapshot): LoginMethodsEmailViewModel => {
    const verified = isVerifiedEmail(email);

    return {
      id: email.id,
      emailAddress: email.emailAddress,
      verificationStatus: verified ? "verified" : "unverified",
    };
  };

  return {
    status: methodState ? "ready" : "unavailable",
    methodState,
    google: {
      accounts: googleAccounts.map((account) => {
        const connected = account.verificationStatus === "verified";
        const canDisconnect = connected && hasEmailPasswordMethod;

        return {
          id: account.id,
          emailAddress: account.emailAddress,
          status: connected ? "connected" : "needsReconnection",
          canDisconnect,
          disconnectUnavailableReason: canDisconnect
            ? null
            : connected
              ? EMAIL_PASSWORD_REQUIRED_REASON
              : "Googleとの接続を再確認してください。",
        };
      }),
      canConnect: hasEmailPasswordMethod && googleAccounts.length === 0,
      canReconnect:
        hasEmailPasswordMethod && googleAccounts.length === 1 && isRetryableGoogleAccount(googleAccounts[0]),
    },
    emailPassword: {
      primaryEmail: primaryEmail ? toEmailViewModel(primaryEmail) : null,
      canChangeLoginEmail: hasVerifiedPrimaryEmail,
      canSetPassword: !snapshot.passwordEnabled && verifiedEmails.length > 0,
    },
  };
}

function deriveLoginMethodState(hasEmailPasswordMethod: boolean, hasVerifiedGoogle: boolean): LoginMethodState | null {
  if (hasEmailPasswordMethod && hasVerifiedGoogle) return "googleAndPassword";
  if (hasEmailPasswordMethod) return "passwordOnly";
  if (hasVerifiedGoogle) return "googleOnly";
  return null;
}

function isVerifiedEmail(email: LoginMethodsEmailSnapshot): boolean {
  return email.verificationStatus === "verified";
}

function isRetryableGoogleAccount(account: LoginMethodsExternalAccountSnapshot | undefined): boolean {
  return account?.verificationStatus === "unverified" || account?.verificationStatus === "failed";
}
