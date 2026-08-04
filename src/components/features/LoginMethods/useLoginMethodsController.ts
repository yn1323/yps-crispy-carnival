import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { useEffect, useRef, useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import { buildLoginMethodsViewModel, DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import type {
  EmailPasswordDialogState,
  LoginMethodCapabilities,
  LoginMethodsCardState,
  LoginMethodsController,
} from "./types";

const OAUTH_RETURN_PATH = "/account/security?oauth=google";
const IDLE_STATE: LoginMethodsCardState = { status: "idle", message: null };
const LOADING_STATE: LoginMethodsCardState = { status: "loading", message: null };

type ControllerOptions = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  capabilities?: LoginMethodCapabilities;
  navigateToExternalVerification?: (url: string) => void;
  googleOAuthReturn?: boolean;
  onGoogleOAuthReturnHandled?: () => void;
};

export function useLoginMethodsController({
  isLoaded,
  user,
  capabilities = DISABLED_LOGIN_METHOD_CAPABILITIES,
  navigateToExternalVerification = (url) => window.location.assign(url),
  googleOAuthReturn = false,
  onGoogleOAuthReturnHandled,
}: ControllerOptions): LoginMethodsController {
  const googleOAuthReturnHandledRef = useRef(false);
  const [, setResourceRevision] = useState(0);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailPasswordDialog, setEmailPasswordDialog] = useState<EmailPasswordDialogState>({ isOpen: false });

  const viewModel = user
    ? buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(user), capabilities)
    : buildLoginMethodsViewModel(
        { primaryEmailAddressId: null, passwordEnabled: false, emailAddresses: [], externalAccounts: [] },
        DISABLED_LOGIN_METHOD_CAPABILITIES,
      );

  const reloadUser = async (): Promise<UserResource> => {
    if (!isLoaded || !user) throw new Error("Unauthenticated");
    await user.reload();
    setResourceRevision((current) => current + 1);
    return user;
  };

  const createExternalAccountWithReverification = useReverification(async () => {
    if (!user) throw new Error("Unauthenticated");
    return await user.createExternalAccount({ strategy: "oauth_google", redirectUrl: OAUTH_RETURN_PATH });
  });
  const reauthorizeExternalAccountWithReverification = useReverification(
    async (externalAccount: ExternalAccountResource) =>
      await externalAccount.reauthorize({ redirectUrl: OAUTH_RETURN_PATH }),
  );
  const destroyExternalAccountWithReverification = useReverification(
    async (externalAccount: ExternalAccountResource) => await externalAccount.destroy(),
  );
  const createEmailAddressWithReverification = useReverification(async (email: string) => {
    if (!user) throw new Error("Unauthenticated");
    return await user.createEmailAddress({ email });
  });
  const updatePasswordWithReverification = useReverification(
    async (params: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) => {
      if (!user) throw new Error("Unauthenticated");
      return await user.updatePassword(params);
    },
  );
  const removePasswordWithReverification = useReverification(async (currentPassword?: string) => {
    if (!user) throw new Error("Unauthenticated");
    return await user.removePassword({ currentPassword: emptyToUndefined(currentPassword) });
  });
  const destroyEmailAddressWithReverification = useReverification(
    async (emailAddress: EmailAddressResource) => await emailAddress.destroy(),
  );

  const { run: reload } = useSingleFlight(async () => {
    setGoogleState(LOADING_STATE);
    setEmailPasswordState(LOADING_STATE);
    try {
      await reloadUser();
      setGoogleState({ status: "success", message: "最新のGoogle連携を確認しました。" });
      setEmailPasswordState({ status: "success", message: "最新のメールとパスワードを確認しました。" });
      return true;
    } catch {
      const failure = cardError("ログイン方法を確認できませんでした。画面を再読み込みしてください。");
      setGoogleState(failure);
      setEmailPasswordState(failure);
      return false;
    }
  });

  const { run: settleGoogleOAuthReturn } = useSingleFlight(async () => {
    setGoogleState(LOADING_STATE);
    try {
      const currentUser = await reloadUser();
      const googleAccounts = currentUser.externalAccounts.filter((account) => account.provider === "google");
      if (googleAccounts.some((account) => account.verification?.status === "verified")) {
        setGoogleState({ status: "success", message: "Google連携を確認しました。" });
        return true;
      }
      setGoogleState(
        cardError(
          googleAccounts.length > 0
            ? "Google連携の確認が完了していません。再接続するか、最新の状態を読み込んでください。"
            : "Google連携が完了していません。もう一度お試しください。",
        ),
      );
      return false;
    } catch {
      setGoogleState(cardError("Google連携を確認できませんでした。最新の状態を読み込んでください。"));
      return false;
    }
  });

  useEffect(() => {
    if (!googleOAuthReturn) {
      googleOAuthReturnHandledRef.current = false;
      return;
    }
    if (!isLoaded || !user || googleOAuthReturnHandledRef.current) return;

    googleOAuthReturnHandledRef.current = true;
    void settleGoogleOAuthReturn().finally(() => onGoogleOAuthReturnHandled?.());
  }, [googleOAuthReturn, isLoaded, onGoogleOAuthReturnHandled, settleGoogleOAuthReturn, user]);

  const { run: runGoogleOperation } = useSingleFlight(
    async (operation: "connect" | "reconnect" | "prepareDisconnect" | "disconnect", externalAccountId?: string) => {
      setGoogleState(LOADING_STATE);
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);

        if (operation === "connect") {
          if (!freshViewModel.google.canConnect) {
            setGoogleState(cardError(freshViewModel.google.connectUnavailableReason ?? "Googleを連携できません。"));
            return false;
          }
          const created = await createExternalAccountWithReverification();
          if (created == null) {
            setGoogleState(IDLE_STATE);
            return false;
          }
          const redirectUrl = created.verification?.externalVerificationRedirectURL?.toString();
          if (!redirectUrl) {
            setGoogleState(cardError("Googleの確認画面を開けませんでした。もう一度お試しください。"));
            return false;
          }
          navigateToExternalVerification(redirectUrl);
          return true;
        }

        if (!externalAccountId) return false;
        const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
        if (freshAccount?.provider !== "google") {
          setGoogleState(cardError("Google連携の状態が変わりました。もう一度読み込んでください。"));
          return false;
        }

        if (operation === "reconnect") {
          if (!freshViewModel.google.canReconnect || freshAccount.verification?.status === "verified") {
            setGoogleState(cardError("このGoogle連携は再確認できません。最新の状態を読み込んでください。"));
            return false;
          }
          const reauthorized = await reauthorizeExternalAccountWithReverification(freshAccount);
          if (reauthorized == null) {
            setGoogleState(IDLE_STATE);
            return false;
          }
          const redirectUrl = reauthorized.verification?.externalVerificationRedirectURL?.toString();
          if (!redirectUrl) {
            setGoogleState(cardError("Googleの確認画面を開けませんでした。もう一度お試しください。"));
            return false;
          }
          navigateToExternalVerification(redirectUrl);
          return true;
        }

        const accountViewModel = freshViewModel.google.accounts.find((account) => account.id === externalAccountId);
        if (!accountViewModel?.canDisconnect) {
          setGoogleState(cardError(accountViewModel?.disconnectUnavailableReason ?? "Googleを解除できません。"));
          return false;
        }
        if (operation === "prepareDisconnect") {
          setGoogleState({ status: "success", message: "Google連携の最新の状態を確認しました。" });
          return true;
        }
        const destroyed = await destroyExternalAccountWithReverification(freshAccount);
        if (destroyed === null) {
          setGoogleState(IDLE_STATE);
          return false;
        }
        await reloadUser();
        if (currentUser.externalAccounts.some((account) => account.id === externalAccountId)) {
          setGoogleState(cardError("Google連携を解除できませんでした。最新の状態を確認してください。"));
          return false;
        }
        setGoogleState({ status: "success", message: "Google連携を解除しました。" });
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setGoogleState(IDLE_STATE);
          return false;
        }
        try {
          const currentUser = await reloadUser();
          if (
            operation === "disconnect" &&
            externalAccountId &&
            !currentUser.externalAccounts.some((account) => account.id === externalAccountId)
          ) {
            setGoogleState({ status: "success", message: "Google連携を解除しました。" });
            return true;
          }
        } catch {
          // 失敗後もresource再取得を試し、providerの生errorは画面へ出さない。
        }
        setGoogleState(cardError(getClerkErrorMessage(error)));
        return false;
      }
    },
  );

  const { run: runEmailPasswordOperation } = useSingleFlight(
    async (
      operation:
        | "startEmail"
        | "continueEmail"
        | "verifyEmail"
        | "resendEmail"
        | "updatePassword"
        | "removePassword"
        | "removeEmail",
      payload?: string | { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean },
    ) => {
      setEmailPasswordState(LOADING_STATE);
      let passwordWasEnabledBeforeUpdate: boolean | null = null;
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);

        if (operation === "startEmail") {
          if (!freshViewModel.emailPassword.canSetPassword || typeof payload !== "string") {
            setEmailPasswordState(cardError("メールアドレスとパスワードを設定できません。"));
            return false;
          }
          const parsed = requiredEmailSchema.safeParse(payload);
          if (!parsed.success) {
            setEmailPasswordState(cardError(parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。"));
            return false;
          }
          const normalizedEmail = normalizeEmail(parsed.data);
          let target = findEmailAddress(currentUser, null, normalizedEmail);
          if (!target) {
            const created = await createEmailAddressWithReverification(normalizedEmail);
            if (created == null) {
              setEmailPasswordState(IDLE_STATE);
              return false;
            }
            await reloadUser();
            target = findEmailAddress(currentUser, created.id, normalizedEmail);
          }
          if (!target) {
            setEmailPasswordState(cardError("追加したメールアドレスを確認できません。もう一度お試しください。"));
            return false;
          }
          if (target.verification?.status === "verified") {
            setEmailPasswordDialog({
              isOpen: true,
              step: "password",
              targetEmailAddressId: target.id,
              targetMaskedEmail: maskEmailAddress(target.emailAddress),
              passwordMode: "set",
            });
            setEmailPasswordState({ status: "success", message: "確認済みのメールアドレスを使用します。" });
          } else {
            await target.prepareVerification({ strategy: "email_code" });
            setEmailPasswordDialog({
              isOpen: true,
              step: "verification",
              targetEmailAddressId: target.id,
              targetMaskedEmail: maskEmailAddress(target.emailAddress),
              passwordMode: "set",
            });
            setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          }
          return true;
        }

        if (operation === "continueEmail") {
          if (!freshViewModel.emailPassword.canSetPassword || typeof payload !== "string") {
            setEmailPasswordState(cardError("メール確認を再開できません。最新の状態を読み込んでください。"));
            return false;
          }
          const target = findEmailAddress(currentUser, payload);
          if (!target) {
            setEmailPasswordState(cardError("メールアドレスの状態が変わりました。最新の状態を確認してください。"));
            return false;
          }
          if (target.verification?.status === "verified") {
            setEmailPasswordDialog({
              isOpen: true,
              step: "password",
              targetEmailAddressId: target.id,
              targetMaskedEmail: maskEmailAddress(target.emailAddress),
              passwordMode: "set",
            });
            setEmailPasswordState({ status: "success", message: "メールアドレスは確認済みです。" });
            return true;
          }
          await target.prepareVerification({ strategy: "email_code" });
          setEmailPasswordDialog({
            isOpen: true,
            step: "verification",
            targetEmailAddressId: target.id,
            targetMaskedEmail: maskEmailAddress(target.emailAddress),
            passwordMode: "set",
          });
          setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          return true;
        }

        if (operation === "verifyEmail" || operation === "resendEmail") {
          const target = resolveDialogEmailAddress(currentUser, emailPasswordDialog);
          if (!target) {
            setEmailPasswordState(cardError("確認中のメールアドレスを取得できません。最初からやり直してください。"));
            return false;
          }
          if (operation === "resendEmail") {
            await target.prepareVerification({ strategy: "email_code" });
            setEmailPasswordState({ status: "success", message: "新しい確認コードを送りました。" });
            return true;
          }
          if (typeof payload !== "string" || !payload.trim()) {
            setEmailPasswordState(cardError("確認コードを入力してください。"));
            return false;
          }
          const verifiedResource = await target.attemptVerification({ code: payload.trim() });
          await reloadUser();
          const verified = findEmailAddress(currentUser, verifiedResource.id, normalizeEmail(target.emailAddress));
          if (verified?.verification?.status !== "verified") {
            setEmailPasswordState(cardError("メールアドレスを確認できませんでした。もう一度お試しください。"));
            return false;
          }
          setEmailPasswordDialog({
            isOpen: true,
            step: "password",
            targetEmailAddressId: verified.id,
            targetMaskedEmail: maskEmailAddress(verified.emailAddress),
            passwordMode: "set",
          });
          setEmailPasswordState({ status: "success", message: "メールアドレスを確認しました。" });
          return true;
        }

        if (operation === "updatePassword") {
          if (typeof payload === "string" || !payload) return false;
          const isChange = currentUser.passwordEnabled;
          passwordWasEnabledBeforeUpdate = isChange;
          const canUpdate = isChange
            ? freshViewModel.emailPassword.canChangePassword
            : freshViewModel.emailPassword.canSetPassword;
          if (!canUpdate) {
            setEmailPasswordState(cardError("パスワードを設定・変更できません。最新の状態を確認してください。"));
            return false;
          }
          const updated = await updatePasswordWithReverification({
            currentPassword: emptyToUndefined(payload.currentPassword),
            newPassword: payload.newPassword,
            signOutOfOtherSessions: payload.signOutOfOtherSessions,
          });
          if (updated == null) {
            setEmailPasswordState(IDLE_STATE);
            return false;
          }
          await reloadUser();
          if (!currentUser.passwordEnabled) {
            setEmailPasswordState(cardError("パスワードの設定を確認できませんでした。もう一度お試しください。"));
            return false;
          }
          setEmailPasswordDialog({ isOpen: false });
          setEmailPasswordState({
            status: "success",
            message: isChange ? "パスワードを変更しました。" : "メールアドレスとパスワードを設定しました。",
          });
          return true;
        }

        if (operation === "removePassword") {
          if (!freshViewModel.emailPassword.canRemovePassword) {
            setEmailPasswordState(
              cardError(
                freshViewModel.emailPassword.passwordRemovalUnavailableReason ?? "パスワードを削除できません。",
              ),
            );
            return false;
          }
          const removed = await removePasswordWithReverification(typeof payload === "string" ? payload : undefined);
          if (removed == null) {
            setEmailPasswordState(IDLE_STATE);
            return false;
          }
          await reloadUser();
          if (currentUser.passwordEnabled) {
            setEmailPasswordState(cardError("パスワードを削除できませんでした。最新の状態を確認してください。"));
            return false;
          }
          setEmailPasswordState({ status: "success", message: "パスワードを削除しました。" });
          return true;
        }

        if (typeof payload !== "string") return false;
        const emailViewModel = [
          ...freshViewModel.emailPassword.verifiedEmails,
          ...freshViewModel.emailPassword.unverifiedEmails,
        ].find((email) => email.id === payload);
        if (!emailViewModel?.canRemove) {
          setEmailPasswordState(
            cardError(emailViewModel?.removeUnavailableReason ?? "メールアドレスを削除できません。"),
          );
          return false;
        }
        const freshEmail = findEmailAddress(currentUser, payload);
        if (!freshEmail) {
          setEmailPasswordState(cardError("メールアドレスの状態が変わりました。最新の状態を確認してください。"));
          return false;
        }
        const destroyed = await destroyEmailAddressWithReverification(freshEmail);
        if (destroyed === null) {
          setEmailPasswordState(IDLE_STATE);
          return false;
        }
        await reloadUser();
        if (currentUser.emailAddresses.some((email) => email.id === payload)) {
          setEmailPasswordState(cardError("メールアドレスを削除できませんでした。最新の状態を確認してください。"));
          return false;
        }
        setEmailPasswordState({ status: "success", message: "メールアドレスを削除しました。" });
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setEmailPasswordState(IDLE_STATE);
          return false;
        }
        try {
          const currentUser = await reloadUser();
          if (
            operation === "updatePassword" &&
            passwordWasEnabledBeforeUpdate === false &&
            currentUser.passwordEnabled
          ) {
            setEmailPasswordDialog({ isOpen: false });
            setEmailPasswordState({ status: "success", message: "メールアドレスとパスワードを設定しました。" });
            return true;
          }
          if (operation === "removePassword" && !currentUser.passwordEnabled) {
            setEmailPasswordState({ status: "success", message: "パスワードを削除しました。" });
            return true;
          }
          if (
            operation === "removeEmail" &&
            typeof payload === "string" &&
            !currentUser.emailAddresses.some((email) => email.id === payload)
          ) {
            setEmailPasswordState({ status: "success", message: "メールアドレスを削除しました。" });
            return true;
          }
          if (operation === "verifyEmail") {
            const target = resolveDialogEmailAddress(currentUser, emailPasswordDialog);
            if (target?.verification?.status === "verified") {
              setEmailPasswordDialog({
                isOpen: true,
                step: "password",
                targetEmailAddressId: target.id,
                targetMaskedEmail: maskEmailAddress(target.emailAddress),
                passwordMode: "set",
              });
              setEmailPasswordState({ status: "success", message: "メールアドレスを確認しました。" });
              return true;
            }
          }
        } catch {
          // 部分成功を失敗として巻き戻さず、次のrenderで最新resourceを表示する。
        }
        setEmailPasswordState(cardError(getClerkErrorMessage(error)));
        return false;
      }
    },
  );

  return {
    viewModel,
    isLoaded,
    googleState,
    emailPasswordState,
    emailPasswordDialog,
    reload,
    connectGoogle: () => runGoogleOperation("connect"),
    reconnectGoogle: (externalAccountId) => runGoogleOperation("reconnect", externalAccountId),
    prepareGoogleDisconnect: (externalAccountId) => runGoogleOperation("prepareDisconnect", externalAccountId),
    disconnectGoogle: (externalAccountId) => runGoogleOperation("disconnect", externalAccountId),
    openEmailPasswordSetup: () => {
      if (!viewModel.emailPassword.canSetPassword) {
        setEmailPasswordState(cardError("メールアドレスとパスワードの設定は現在利用できません。"));
        return;
      }
      setEmailPasswordState(IDLE_STATE);
      setEmailPasswordDialog({
        isOpen: true,
        step: "email",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
        passwordMode: "set",
      });
    },
    continueEmailVerification: (emailAddressId) => runEmailPasswordOperation("continueEmail", emailAddressId),
    openPasswordChange: () => {
      if (!viewModel.emailPassword.canChangePassword) {
        setEmailPasswordState(cardError("パスワードの変更は現在利用できません。"));
        return;
      }
      setEmailPasswordState(IDLE_STATE);
      setEmailPasswordDialog({
        isOpen: true,
        step: "password",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
        passwordMode: "change",
      });
    },
    closeEmailPasswordDialog: () => {
      if (emailPasswordState.status === "loading") return;
      setEmailPasswordDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
    },
    startEmailVerification: (email) => runEmailPasswordOperation("startEmail", email),
    verifyEmailCode: (code) => runEmailPasswordOperation("verifyEmail", code),
    resendEmailCode: () => runEmailPasswordOperation("resendEmail"),
    updatePassword: (values) => runEmailPasswordOperation("updatePassword", values),
    removePassword: (currentPassword) => runEmailPasswordOperation("removePassword", currentPassword),
    removeEmailAddress: (emailAddressId) => runEmailPasswordOperation("removeEmail", emailAddressId),
  };
}

function findEmailAddress(user: UserResource, id: string | null, normalizedEmail?: string) {
  if (id) {
    const byId = user.emailAddresses.find((emailAddress) => emailAddress.id === id);
    if (byId) return byId;
  }
  if (!normalizedEmail) return undefined;
  return user.emailAddresses.find((emailAddress) => normalizeEmail(emailAddress.emailAddress) === normalizedEmail);
}

function resolveDialogEmailAddress(user: UserResource, dialog: EmailPasswordDialogState) {
  if (!dialog.isOpen || !dialog.targetEmailAddressId) return undefined;
  return findEmailAddress(user, dialog.targetEmailAddressId);
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cardError(message: string): LoginMethodsCardState {
  return { status: "error", message };
}
