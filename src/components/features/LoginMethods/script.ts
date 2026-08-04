import type {
  LoginMethodCapabilities,
  LoginMethodsEmailSnapshot,
  LoginMethodsEmailViewModel,
  LoginMethodsUserSnapshot,
  LoginMethodsViewModel,
} from "./types";

// 既存のStory移行が完了するまで公開位置だけを維持し、設定の解釈はcapabilities.tsへ集約する。
export { DISABLED_LOGIN_METHOD_CAPABILITIES, LOGIN_METHOD_CAPABILITIES } from "./capabilities";

const LAST_LOGIN_METHOD_REASON = "ほかのログイン方法を設定してから操作してください。";
const EXPERIMENT_REQUIRED_REASON = "この操作は、安全性の確認が完了するまで利用できません。";
const LINKED_EMAIL_REASON = "Googleと接続中のため、メールアドレスだけを削除できません。";
const PRIMARY_EMAIL_REASON = "現在のログイン設定を安全に確認できないため、このメールは削除できません。";

export function hasGmailEmailAddress(viewModel: LoginMethodsViewModel): boolean {
  return [...viewModel.emailPassword.verifiedEmails, ...viewModel.emailPassword.unverifiedEmails].some((email) =>
    email.maskedEmail.trim().toLowerCase().endsWith("@gmail.com"),
  );
}

export function buildLoginMethodsViewModel(
  snapshot: LoginMethodsUserSnapshot,
  capabilities: LoginMethodCapabilities,
): LoginMethodsViewModel {
  const verifiedEmails = snapshot.emailAddresses.filter(isVerifiedEmail);
  const unverifiedEmails = snapshot.emailAddresses.filter((email) => !isVerifiedEmail(email));
  const googleAccounts = snapshot.externalAccounts.filter((account) => account.provider === "google");
  const verifiedGoogleAccounts = googleAccounts.filter((account) => account.verificationStatus === "verified");
  const hasPasswordMethod = snapshot.passwordEnabled && verifiedEmails.length > 0;
  const hasSafeGoogleFallback = snapshot.passwordEnabled && verifiedEmails.some((email) => email.linkedTo.length === 0);
  const availableMethodCount = verifiedGoogleAccounts.length + (hasPasswordMethod ? 1 : 0);
  const methodsAreKnown = (!snapshot.passwordEnabled || verifiedEmails.length > 0) && availableMethodCount > 0;
  const hasVerifiedPrimaryEmail = verifiedEmails.some((email) => email.id === snapshot.primaryEmailAddressId);
  const canChangeLoginEmail = methodsAreKnown && hasPasswordMethod && hasVerifiedPrimaryEmail;
  const canReplaceGoogle =
    methodsAreKnown &&
    verifiedGoogleAccounts.length === 1 &&
    capabilities.replaceGoogleAccount &&
    capabilities.setPassword &&
    capabilities.disconnectGoogle &&
    capabilities.connectGoogle;

  const toEmailViewModel = (email: LoginMethodsEmailSnapshot): LoginMethodsEmailViewModel => {
    const isPrimary = email.id === snapshot.primaryEmailAddressId;
    const isLinked = email.linkedTo.length > 0;
    const verified = isVerifiedEmail(email);
    const hasVerifiedEmailAfterRemoval = verifiedEmails.some((candidate) => candidate.id !== email.id);
    const preservesLoginMethod =
      !verified || !snapshot.passwordEnabled || hasVerifiedEmailAfterRemoval || verifiedGoogleAccounts.length > 0;
    const canRemove =
      methodsAreKnown && capabilities.removeEmailAddress && !isLinked && !isPrimary && preservesLoginMethod;
    const loginEmailChangeAction = canChangeLoginEmail && !isPrimary ? (verified ? "switch" : "verify") : null;

    return {
      id: email.id,
      maskedEmail: email.emailAddress,
      verificationStatus: verified ? "verified" : "unverified",
      isPrimary,
      isLinked,
      loginEmailChangeAction,
      canRemove,
      removeUnavailableReason: canRemove
        ? null
        : !capabilities.removeEmailAddress
          ? EXPERIMENT_REQUIRED_REASON
          : isLinked
            ? LINKED_EMAIL_REASON
            : isPrimary
              ? PRIMARY_EMAIL_REASON
              : !preservesLoginMethod
                ? LAST_LOGIN_METHOD_REASON
                : "現在の状態を確認できないため、このメールは削除できません。",
    };
  };

  const verifiedEmailViewModels = verifiedEmails.map(toEmailViewModel);
  const unverifiedEmailViewModels = unverifiedEmails.map(toEmailViewModel);

  return {
    status: methodsAreKnown ? "ready" : "unavailable",
    google: {
      accounts: googleAccounts.map((account) => {
        const connected = account.verificationStatus === "verified";
        const canDisconnect = connected && methodsAreKnown && capabilities.disconnectGoogle && hasSafeGoogleFallback;

        return {
          id: account.id,
          maskedEmail: account.emailAddress,
          status: connected ? "connected" : "needsReconnection",
          canDisconnect,
          disconnectUnavailableReason: canDisconnect
            ? null
            : !connected
              ? "Googleとの接続を再確認してください。"
              : !capabilities.disconnectGoogle
                ? EXPERIMENT_REQUIRED_REASON
                : !hasSafeGoogleFallback
                  ? "Googleと接続していない確認済みメールアドレスとパスワードを設定してから操作してください。"
                  : LAST_LOGIN_METHOD_REASON,
        };
      }),
      canConnect: methodsAreKnown && capabilities.connectGoogle && googleAccounts.length === 0,
      connectUnavailableReason: capabilities.connectGoogle
        ? googleAccounts.length > 0
          ? "Googleはすでに登録されています。"
          : methodsAreKnown
            ? null
            : "現在のログイン方法を確認できません。"
        : EXPERIMENT_REQUIRED_REASON,
      canReconnect:
        capabilities.reconnectGoogle && googleAccounts.some((account) => account.verificationStatus !== "verified"),
      canReplace: canReplaceGoogle,
      replaceUnavailableReason: canReplaceGoogle
        ? null
        : capabilities.replaceGoogleAccount
          ? "Googleアカウントの変更に必要な操作を現在は利用できません。"
          : EXPERIMENT_REQUIRED_REASON,
    },
    emailPassword: {
      passwordEnabled: snapshot.passwordEnabled,
      primaryEmail: verifiedEmailViewModels.find((email) => email.isPrimary) ?? null,
      verifiedEmails: verifiedEmailViewModels,
      unverifiedEmails: unverifiedEmailViewModels,
      canChangeLoginEmail,
      loginEmailChangeUnavailableReason: canChangeLoginEmail
        ? null
        : !hasPasswordMethod
          ? "メールアドレスとパスワードを設定してから操作してください。"
          : "現在のログイン用メールアドレスを確認できません。",
      canSetPassword: !snapshot.passwordEnabled && methodsAreKnown && capabilities.setPassword,
      canChangePassword: snapshot.passwordEnabled && methodsAreKnown && capabilities.changePassword,
      canRemovePassword:
        snapshot.passwordEnabled && methodsAreKnown && capabilities.removePassword && verifiedGoogleAccounts.length > 0,
      passwordRemovalUnavailableReason: !snapshot.passwordEnabled
        ? null
        : !capabilities.removePassword
          ? EXPERIMENT_REQUIRED_REASON
          : verifiedGoogleAccounts.length === 0
            ? LAST_LOGIN_METHOD_REASON
            : methodsAreKnown
              ? null
              : "現在のログイン方法を確認できません。",
    },
  };
}

function isVerifiedEmail(email: LoginMethodsEmailSnapshot): boolean {
  return email.verificationStatus === "verified";
}
