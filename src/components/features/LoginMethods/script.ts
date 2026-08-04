import type {
  LoginMethodState,
  LoginMethodsEmailSnapshot,
  LoginMethodsEmailViewModel,
  LoginMethodsUserSnapshot,
  LoginMethodsViewModel,
} from "./types";

const EMAIL_PASSWORD_REQUIRED_REASON = "確認済みメールアドレスとパスワードを設定してから操作してください。";

export function buildLoginMethodsViewModel(snapshot: LoginMethodsUserSnapshot): LoginMethodsViewModel {
  const verifiedEmails = snapshot.emailAddresses.filter(isVerifiedEmail);
  const unverifiedEmails = snapshot.emailAddresses.filter((email) => !isVerifiedEmail(email));
  const googleAccounts = snapshot.externalAccounts.filter((account) => account.provider === "google");
  const verifiedGoogleAccounts = googleAccounts.filter((account) => account.verificationStatus === "verified");
  const hasEmailPasswordMethod = snapshot.passwordEnabled && verifiedEmails.length > 0;
  const methodState = deriveLoginMethodState(hasEmailPasswordMethod, verifiedGoogleAccounts.length > 0);
  const hasVerifiedPrimaryEmail = verifiedEmails.some((email) => email.id === snapshot.primaryEmailAddressId);

  const toEmailViewModel = (email: LoginMethodsEmailSnapshot): LoginMethodsEmailViewModel => {
    const isPrimary = email.id === snapshot.primaryEmailAddressId;
    const verified = isVerifiedEmail(email);

    return {
      id: email.id,
      maskedEmail: email.emailAddress,
      verificationStatus: verified ? "verified" : "unverified",
      isPrimary,
      loginEmailChangeAction: hasVerifiedPrimaryEmail && !isPrimary ? (verified ? "switch" : "verify") : null,
    };
  };

  const verifiedEmailViewModels = verifiedEmails.map(toEmailViewModel);
  const unverifiedEmailViewModels = unverifiedEmails.map(toEmailViewModel);

  return {
    status: methodState ? "ready" : "unavailable",
    methodState,
    google: {
      accounts: googleAccounts.map((account) => {
        const connected = account.verificationStatus === "verified";
        const canDisconnect = connected && hasEmailPasswordMethod;

        return {
          id: account.id,
          maskedEmail: account.emailAddress,
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
      connectUnavailableReason:
        googleAccounts.length > 0
          ? "Googleはすでに登録されています。"
          : hasEmailPasswordMethod
            ? null
            : EMAIL_PASSWORD_REQUIRED_REASON,
      canReconnect: googleAccounts.some((account) => account.verificationStatus !== "verified"),
    },
    emailPassword: {
      passwordEnabled: snapshot.passwordEnabled,
      primaryEmail: verifiedEmailViewModels.find((email) => email.isPrimary) ?? null,
      verifiedEmails: verifiedEmailViewModels,
      unverifiedEmails: unverifiedEmailViewModels,
      canChangeLoginEmail: hasVerifiedPrimaryEmail,
      loginEmailChangeUnavailableReason: hasVerifiedPrimaryEmail
        ? null
        : "現在のログイン用メールアドレスを確認できません。",
      canSetPassword: !snapshot.passwordEnabled && verifiedEmails.length > 0,
      canChangePassword: hasEmailPasswordMethod,
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
