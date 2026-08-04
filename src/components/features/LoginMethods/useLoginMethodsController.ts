import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { UserResource } from "@clerk/shared/types";
import { useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import { getLoginMethodAccountErrorMessage } from "./loginMethodErrorPresentation";
import type { LoginMethodOnNeedsReverification } from "./reverificationTypes";
import { buildLoginMethodsViewModel, DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import type {
  EmailPasswordDialogState,
  LoginEmailChangeDialogState,
  LoginMethodCapabilities,
  LoginMethodsCardState,
  LoginMethodsController,
  LoginMethodsViewModel,
} from "./types";

const ACCOUNT_SECURITY_PATH = "/account/security";
const IDLE_STATE: LoginMethodsCardState = { status: "idle", message: null };
const LOADING_STATE: LoginMethodsCardState = { status: "loading", message: null };

type ControllerOptions = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  capabilities?: LoginMethodCapabilities;
  navigateToExternalVerification?: (url: string) => void;
  onNeedsReverification?: LoginMethodOnNeedsReverification;
  runOperation?: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
};

export function useLoginMethodsController({
  isLoaded,
  user,
  capabilities = DISABLED_LOGIN_METHOD_CAPABILITIES,
  navigateToExternalVerification = (url) => window.location.assign(url),
  onNeedsReverification,
  runOperation = async (operation) => operation(),
}: ControllerOptions): LoginMethodsController {
  const [, setResourceRevision] = useState(0);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailPasswordDialog, setEmailPasswordDialog] = useState<EmailPasswordDialogState>({ isOpen: false });
  const [emailChangeDialog, setEmailChangeDialog] = useState<LoginEmailChangeDialogState>({ isOpen: false });
  const showEmailChangeSuccess = () => {
    setEmailChangeDialog({ isOpen: false });
    setEmailPasswordState(IDLE_STATE);
    showSuccessToast({
      title: "メインのメールアドレスを変更しました",
      description: "以前のメールアドレスも登録されたままです。",
    });
  };

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

  const reverificationOptions = { onNeedsReverification };
  const reauthorizeExternalAccountWithReverification = useReverification(async (externalAccountId: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
    if (freshAccount?.provider !== "google") return { status: "unavailable" } as const;
    if (freshAccount.verification?.status === "verified") return { status: "alreadyConnected" } as const;
    if (!freshViewModel.google.canReconnect) return { status: "unavailable" } as const;
    const externalAccount = await freshAccount.reauthorize({ redirectUrl: ACCOUNT_SECURITY_PATH });
    return { status: "reauthorized", externalAccount } as const;
  }, reverificationOptions);
  const destroyExternalAccountWithReverification = useReverification(async (externalAccountId: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
    const accountViewModel = freshViewModel.google.accounts.find((account) => account.id === externalAccountId);
    if (freshAccount?.provider !== "google" || !accountViewModel?.canDisconnect) return "unavailable" as const;
    await freshAccount.destroy();
    return "removed" as const;
  }, reverificationOptions);
  const ensureEmailAddressWithReverification = useReverification(async (email: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    if (!freshViewModel.emailPassword.canChangeLoginEmail) return { status: "unavailable" } as const;
    const existing = findEmailAddress(currentUser, null, email);
    if (existing) return { status: "ready", emailAddressId: existing.id } as const;
    const created = await currentUser.createEmailAddress({ email });
    return { status: "ready", emailAddressId: created.id } as const;
  }, reverificationOptions);
  const updatePrimaryEmailWithReverification = useReverification(async (emailAddressId: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    const target = findEmailAddress(currentUser, emailAddressId);
    if (target?.verification?.status !== "verified") return "targetUnavailable" as const;
    if (currentUser.primaryEmailAddressId === target.id) return "alreadyPrimary" as const;
    if (!freshViewModel.emailPassword.canChangeLoginEmail) return "targetUnavailable" as const;
    await currentUser.update({ primaryEmailAddressId: target.id });
    return "updated" as const;
  }, reverificationOptions);
  const updatePasswordWithReverification = useReverification(
    async (params: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) => {
      const currentUser = await reloadUser();
      const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
      if (!currentUser.passwordEnabled || !freshViewModel.emailPassword.canChangePassword) {
        return "unavailable" as const;
      }
      await currentUser.updatePassword(params);
      return "updated" as const;
    },
    reverificationOptions,
  );
  const removePasswordWithReverification = useReverification(async (currentPassword?: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    if (!freshViewModel.emailPassword.canRemovePassword) return "unavailable" as const;
    await currentUser.removePassword({ currentPassword: emptyToUndefined(currentPassword) });
    return "removed" as const;
  }, reverificationOptions);
  const destroyEmailAddressWithReverification = useReverification(async (emailAddressId: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
    const emailViewModel = [
      ...freshViewModel.emailPassword.verifiedEmails,
      ...freshViewModel.emailPassword.unverifiedEmails,
    ].find((emailAddress) => emailAddress.id === emailAddressId);
    const freshEmail = findEmailAddress(currentUser, emailAddressId);
    if (!freshEmail || !emailViewModel?.canRemove) return "unavailable" as const;
    await freshEmail.destroy();
    return "removed" as const;
  }, reverificationOptions);

  const { run: reload } = useSingleFlight(async () => {
    setGoogleState(LOADING_STATE);
    setEmailPasswordState(LOADING_STATE);
    try {
      await reloadUser();
      setGoogleState(IDLE_STATE);
      setEmailPasswordState(IDLE_STATE);
      return true;
    } catch {
      const failure = cardError("ログイン方法を確認できませんでした。画面を再読み込みしてください。");
      setGoogleState(failure);
      setEmailPasswordState(failure);
      return false;
    }
  });

  const completeLoginEmailChange = async (
    currentUser: UserResource,
    freshViewModel: LoginMethodsViewModel,
    targetEmailAddressId: string,
  ): Promise<boolean> => {
    const target = findEmailAddress(currentUser, targetEmailAddressId);
    if (target?.verification?.status !== "verified") {
      setEmailPasswordState(cardError("変更先のメールアドレスを確認できません。最新の状態を読み込んでください。"));
      return false;
    }
    if (currentUser.primaryEmailAddressId === target.id) {
      showEmailChangeSuccess();
      return true;
    }
    if (!freshViewModel.emailPassword.canChangeLoginEmail) {
      setEmailPasswordState(cardError("変更先のメールアドレスを確認できません。最新の状態を読み込んでください。"));
      return false;
    }
    const updated = await updatePrimaryEmailWithReverification(target.id);
    if (updated == null) {
      setEmailPasswordState(IDLE_STATE);
      return false;
    }
    if (updated === "targetUnavailable") {
      setEmailPasswordState(
        cardError("変更先のメールアドレスの確認状態が変わりました。最新の状態を読み込んでください。"),
      );
      return false;
    }
    await reloadUser();
    if (currentUser.primaryEmailAddressId !== target.id) {
      setEmailPasswordState(cardError("変更結果を確認できません。最新の状態を読み込んでください。"));
      return false;
    }
    showEmailChangeSuccess();
    return true;
  };

  const { run: runGoogleOperation } = useSingleFlight(
    async (operation: "reconnect" | "prepareDisconnect" | "disconnect", externalAccountId?: string) => {
      setGoogleState(LOADING_STATE);
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);

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
          const reauthorization = await reauthorizeExternalAccountWithReverification(externalAccountId);
          if (reauthorization == null) {
            setGoogleState(IDLE_STATE);
            return false;
          }
          if (reauthorization.status === "alreadyConnected") {
            setGoogleState({ status: "success", message: googleConnectionSuccessMessage(currentUser) });
            return true;
          }
          if (reauthorization.status === "unavailable") {
            setGoogleState(cardError("Google連携の状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
          const redirectUrl = reauthorization.externalAccount.verification?.externalVerificationRedirectURL?.toString();
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
        const destroyed = await destroyExternalAccountWithReverification(externalAccountId);
        if (destroyed === null) {
          setGoogleState(IDLE_STATE);
          return false;
        }
        if (destroyed === "unavailable") {
          setGoogleState(cardError("Google連携の状態が変わりました。最新の状態を読み込んでください。"));
          return false;
        }
        await reloadUser();
        if (currentUser.externalAccounts.some((account) => account.id === externalAccountId)) {
          setGoogleState(cardError("Google連携を解除できませんでした。最新の状態を確認してください。"));
          return false;
        }
        if (!hasSafePasswordFallback(currentUser)) {
          setGoogleState(
            cardError(
              "Google連携は解除されましたが、代わりのログイン方法を確認できません。画面を再読み込みしてください。",
            ),
          );
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
            !currentUser.externalAccounts.some((account) => account.id === externalAccountId) &&
            hasSafePasswordFallback(currentUser)
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
        | "startLoginEmail"
        | "continueLoginEmail"
        | "verifyLoginEmail"
        | "resendLoginEmail"
        | "confirmLoginEmail"
        | "updatePassword"
        | "prepareRemovePassword"
        | "removePassword"
        | "removeEmail",
      payload?: string | { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean },
    ) => {
      setEmailPasswordState(LOADING_STATE);
      let primaryEmailTargetId: string | null = null;
      let loginEmailTargetId: string | null = null;
      let loginEmailTargetNormalized: string | null = null;
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);

        if (operation === "startLoginEmail") {
          if (!freshViewModel.emailPassword.canChangeLoginEmail || typeof payload !== "string") {
            setEmailPasswordState(
              cardError(
                freshViewModel.emailPassword.loginEmailChangeUnavailableReason ??
                  "ログイン用メールアドレスを変更できません。",
              ),
            );
            return false;
          }
          const parsed = requiredEmailSchema.safeParse(payload);
          if (!parsed.success) {
            setEmailPasswordState(cardError(parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。"));
            return false;
          }
          const initialPrimary = findVerifiedPrimaryEmailAddress(currentUser);
          if (!initialPrimary) {
            setEmailPasswordState(
              cardError("現在のログイン用メールアドレスを確認できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          const normalizedEmail = normalizeEmail(parsed.data);
          loginEmailTargetNormalized = normalizedEmail;
          if (normalizeEmail(initialPrimary.emailAddress) === normalizedEmail) {
            setEmailPasswordState(cardError("現在とは異なるメールアドレスを入力してください。"));
            return false;
          }
          let target = findEmailAddress(currentUser, null, normalizedEmail);
          if (!target) {
            const ensured = await ensureEmailAddressWithReverification(normalizedEmail);
            if (ensured == null) {
              setEmailPasswordState(IDLE_STATE);
              return false;
            }
            if (ensured.status === "unavailable") {
              setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
              return false;
            }
            await reloadUser();
            target = findEmailAddress(currentUser, ensured.emailAddressId, normalizedEmail);
          }
          const currentPrimary = findVerifiedPrimaryEmailAddress(currentUser);
          if (!target || !currentPrimary) {
            setEmailPasswordState(
              cardError("変更先のメールアドレスを確認できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          const latestViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
          if (target.id === currentPrimary.id) {
            return await completeLoginEmailChange(currentUser, latestViewModel, target.id);
          }
          if (!latestViewModel.emailPassword.canChangeLoginEmail) {
            setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
          loginEmailTargetId = target.id;
          if (target.verification?.status === "verified") {
            return await completeLoginEmailChange(currentUser, latestViewModel, target.id);
          }
          await target.prepareVerification({ strategy: "email_code" });
          setEmailChangeDialog({
            isOpen: true,
            step: "verification",
            currentMaskedEmail: currentPrimary.emailAddress,
            targetEmailAddressId: target.id,
            targetMaskedEmail: target.emailAddress,
          });
          setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          return true;
        }

        if (operation === "continueLoginEmail") {
          if (!freshViewModel.emailPassword.canChangeLoginEmail || typeof payload !== "string") {
            setEmailPasswordState(cardError("メールアドレスの変更を再開できません。最新の状態を読み込んでください。"));
            return false;
          }
          const currentPrimary = findVerifiedPrimaryEmailAddress(currentUser);
          const target = findEmailAddress(currentUser, payload);
          if (!currentPrimary || !target) {
            setEmailPasswordState(cardError("メールアドレスの状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
          if (target.id === currentPrimary.id) {
            return await completeLoginEmailChange(currentUser, freshViewModel, target.id);
          }
          loginEmailTargetId = target.id;
          loginEmailTargetNormalized = normalizeEmail(target.emailAddress);
          if (target.verification?.status === "verified") {
            return await completeLoginEmailChange(currentUser, freshViewModel, target.id);
          }
          await target.prepareVerification({ strategy: "email_code" });
          setEmailChangeDialog({
            isOpen: true,
            step: "verification",
            currentMaskedEmail: currentPrimary.emailAddress,
            targetEmailAddressId: target.id,
            targetMaskedEmail: target.emailAddress,
          });
          setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          return true;
        }

        if (operation === "verifyLoginEmail" || operation === "resendLoginEmail") {
          const target = resolveLoginEmailChangeDialogEmailAddress(currentUser, emailChangeDialog);
          if (!target) {
            setEmailPasswordState(
              cardError("確認中のメールアドレスを取得できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          loginEmailTargetId = target.id;
          loginEmailTargetNormalized = normalizeEmail(target.emailAddress);
          if (operation === "resendLoginEmail") {
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
          const verified = findEmailAddress(currentUser, verifiedResource.id);
          if (verified?.verification?.status !== "verified") {
            setEmailPasswordState(cardError("メールアドレスを確認できませんでした。もう一度お試しください。"));
            return false;
          }
          if (currentUser.primaryEmailAddressId === verified.id) {
            return await completeLoginEmailChange(currentUser, freshViewModel, verified.id);
          }
          const currentPrimary = findVerifiedPrimaryEmailAddress(currentUser);
          if (!currentPrimary) {
            setEmailPasswordState(
              cardError("現在のログイン用メールアドレスを確認できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          const latestViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities);
          return await completeLoginEmailChange(currentUser, latestViewModel, verified.id);
        }

        if (operation === "confirmLoginEmail") {
          const target = resolveLoginEmailChangeDialogEmailAddress(currentUser, emailChangeDialog);
          if (!target) {
            setEmailPasswordState(
              cardError("変更先のメールアドレスを取得できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          primaryEmailTargetId = target.id;
          return await completeLoginEmailChange(currentUser, freshViewModel, target.id);
        }

        if (operation === "updatePassword") {
          if (typeof payload === "string" || !payload) return false;
          if (!freshViewModel.emailPassword.canChangePassword) {
            setEmailPasswordState(cardError("パスワードを変更できません。最新の状態を確認してください。"));
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
          if (updated === "unavailable") {
            setEmailPasswordState(
              cardError("パスワードの状態が変わったため、設定・変更していません。最新の状態を確認してください。"),
            );
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
            message: "パスワードを変更しました。",
          });
          return true;
        }

        if (operation === "prepareRemovePassword" || operation === "removePassword") {
          if (!freshViewModel.emailPassword.canRemovePassword) {
            setEmailPasswordState(
              cardError(
                freshViewModel.emailPassword.passwordRemovalUnavailableReason ?? "パスワードを削除できません。",
              ),
            );
            return false;
          }
          if (operation === "prepareRemovePassword") {
            setEmailPasswordState({ status: "success", message: "Googleログインの最新の状態を確認しました。" });
            return true;
          }
          const removed = await removePasswordWithReverification(typeof payload === "string" ? payload : undefined);
          if (removed == null) {
            setEmailPasswordState(IDLE_STATE);
            return false;
          }
          if (removed === "unavailable") {
            setEmailPasswordState(cardError("ほかのログイン方法の状態が変わったため、パスワードを削除していません。"));
            return false;
          }
          await reloadUser();
          if (currentUser.passwordEnabled) {
            setEmailPasswordState(cardError("パスワードを削除できませんでした。最新の状態を確認してください。"));
            return false;
          }
          if (!hasVerifiedGoogleMethod(currentUser)) {
            setEmailPasswordState(
              cardError(
                "パスワードは削除されましたが、代わりのGoogleログインを確認できません。画面を再読み込みしてください。",
              ),
            );
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
        if (!findEmailAddress(currentUser, payload)) {
          setEmailPasswordState(cardError("メールアドレスの状態が変わりました。最新の状態を確認してください。"));
          return false;
        }
        const destroyed = await destroyEmailAddressWithReverification(payload);
        if (destroyed === null) {
          setEmailPasswordState(IDLE_STATE);
          return false;
        }
        if (destroyed === "unavailable") {
          setEmailPasswordState(
            cardError("メールアドレスの状態が変わったため、削除していません。最新の状態を確認してください。"),
          );
          return false;
        }
        await reloadUser();
        if (currentUser.emailAddresses.some((email) => email.id === payload)) {
          setEmailPasswordState(cardError("メールアドレスを削除できませんでした。最新の状態を確認してください。"));
          return false;
        }
        if (!hasAnyVerifiedLoginMethod(currentUser)) {
          setEmailPasswordState(
            cardError(
              "メールアドレスは削除されましたが、代わりのログイン方法を確認できません。画面を再読み込みしてください。",
            ),
          );
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
            operation === "confirmLoginEmail" &&
            primaryEmailTargetId &&
            currentUser.primaryEmailAddressId === primaryEmailTargetId &&
            findEmailAddress(currentUser, primaryEmailTargetId)?.verification?.status === "verified"
          ) {
            showEmailChangeSuccess();
            return true;
          }
          if (operation === "verifyLoginEmail") {
            const target = resolveLoginEmailChangeDialogEmailAddress(currentUser, emailChangeDialog);
            if (target?.verification?.status === "verified") {
              return completeLoginEmailChange(
                currentUser,
                buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser), capabilities),
                target.id,
              );
            }
          }
          if (
            operation === "startLoginEmail" ||
            operation === "continueLoginEmail" ||
            operation === "resendLoginEmail"
          ) {
            const target = findEmailAddress(currentUser, loginEmailTargetId, loginEmailTargetNormalized ?? undefined);
            const currentPrimary = findVerifiedPrimaryEmailAddress(currentUser);
            if (
              target &&
              target.verification?.status === "verified" &&
              currentUser.primaryEmailAddressId === target.id
            ) {
              showEmailChangeSuccess();
              return true;
            }
            if (target && currentPrimary && target.id !== currentPrimary.id) {
              if (target.verification?.status === "verified") {
                setEmailPasswordState(cardError(getClerkErrorMessage(error)));
                return false;
              }
              setEmailChangeDialog({
                isOpen: true,
                step: "verification",
                currentMaskedEmail: currentPrimary.emailAddress,
                targetEmailAddressId: target.id,
                targetMaskedEmail: target.emailAddress,
              });
              setEmailPasswordState(
                cardError("確認コードの送信結果を確認できません。必要な場合は確認コードを再送してください。"),
              );
              return false;
            }
          }
          if (operation === "removePassword" && !currentUser.passwordEnabled) {
            if (hasVerifiedGoogleMethod(currentUser)) {
              setEmailPasswordState({ status: "success", message: "パスワードを削除しました。" });
              return true;
            }
            setEmailPasswordState(
              cardError(
                "パスワードは削除されましたが、代わりのGoogleログインを確認できません。画面を再読み込みしてください。",
              ),
            );
            return false;
          }
          if (
            operation === "removeEmail" &&
            typeof payload === "string" &&
            !currentUser.emailAddresses.some((email) => email.id === payload)
          ) {
            if (hasAnyVerifiedLoginMethod(currentUser)) {
              setEmailPasswordState({ status: "success", message: "メールアドレスを削除しました。" });
              return true;
            }
            setEmailPasswordState(
              cardError(
                "メールアドレスは削除されましたが、代わりのログイン方法を確認できません。画面を再読み込みしてください。",
              ),
            );
            return false;
          }
        } catch {
          // 部分成功を失敗として巻き戻さず、次のrenderで最新resourceを表示する。
        }
        setEmailPasswordState(cardError(getLoginMethodAccountErrorMessage(error)));
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
    emailChangeDialog,
    reload,
    reconnectGoogle: (externalAccountId) => runOperation(() => runGoogleOperation("reconnect", externalAccountId)),
    prepareGoogleDisconnect: (externalAccountId) => runGoogleOperation("prepareDisconnect", externalAccountId),
    preparePasswordRemoval: () => runEmailPasswordOperation("prepareRemovePassword"),
    disconnectGoogle: (externalAccountId) => runOperation(() => runGoogleOperation("disconnect", externalAccountId)),
    openLoginEmailChange: () => {
      const primaryEmail = viewModel.emailPassword.primaryEmail;
      if (!viewModel.emailPassword.canChangeLoginEmail || !primaryEmail) {
        setEmailPasswordState(
          cardError(
            viewModel.emailPassword.loginEmailChangeUnavailableReason ??
              "ログイン用メールアドレスの変更は現在利用できません。",
          ),
        );
        return;
      }
      setEmailPasswordDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentMaskedEmail: primaryEmail.maskedEmail,
        targetEmailAddressId: null,
        targetMaskedEmail: null,
      });
    },
    continueLoginEmailChange: (emailAddressId) => {
      setEmailPasswordDialog({ isOpen: false });
      return runOperation(() => runEmailPasswordOperation("continueLoginEmail", emailAddressId));
    },
    closeLoginEmailChangeDialog: (force = false) => {
      if (emailPasswordState.status === "loading" && !force) return;
      setEmailChangeDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
    },
    backToLoginEmailInput: () => {
      if (emailPasswordState.status === "loading" || !emailChangeDialog.isOpen) return;
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentMaskedEmail: emailChangeDialog.currentMaskedEmail,
        targetEmailAddressId: null,
        targetMaskedEmail: null,
      });
      setEmailPasswordState(IDLE_STATE);
    },
    startLoginEmailChange: (email) => runOperation(() => runEmailPasswordOperation("startLoginEmail", email)),
    verifyLoginEmailCode: (code) => runOperation(() => runEmailPasswordOperation("verifyLoginEmail", code)),
    resendLoginEmailCode: () => runOperation(() => runEmailPasswordOperation("resendLoginEmail")),
    confirmLoginEmailChange: () => runOperation(() => runEmailPasswordOperation("confirmLoginEmail")),
    openPasswordChange: () => {
      if (!viewModel.emailPassword.canChangePassword) {
        setEmailPasswordState(cardError("パスワードの変更は現在利用できません。"));
        return;
      }
      setEmailChangeDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
      setEmailPasswordDialog({ isOpen: true });
    },
    closeEmailPasswordDialog: (force = false) => {
      if (emailPasswordState.status === "loading" && !force) return;
      setEmailPasswordDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
    },
    updatePassword: (values) => runOperation(() => runEmailPasswordOperation("updatePassword", values)),
    removePassword: (currentPassword) =>
      runOperation(() => runEmailPasswordOperation("removePassword", currentPassword)),
    removeEmailAddress: (emailAddressId) =>
      runOperation(() => runEmailPasswordOperation("removeEmail", emailAddressId)),
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

function findVerifiedPrimaryEmailAddress(user: UserResource) {
  if (!user.primaryEmailAddressId) return undefined;
  const primaryEmail = findEmailAddress(user, user.primaryEmailAddressId);
  return primaryEmail?.verification?.status === "verified" ? primaryEmail : undefined;
}

function resolveLoginEmailChangeDialogEmailAddress(user: UserResource, dialog: LoginEmailChangeDialogState) {
  if (!dialog.isOpen || !dialog.targetEmailAddressId) return undefined;
  return findEmailAddress(user, dialog.targetEmailAddressId);
}

function googleConnectionSuccessMessage(user: UserResource) {
  const hasPasswordMethod =
    user.passwordEnabled &&
    user.emailAddresses.some((emailAddress) => emailAddress.verification?.status === "verified");
  return hasPasswordMethod
    ? "Google連携を確認しました。パスワードを残すか確認してください。自動では削除していません。"
    : "Google連携を確認しました。";
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasSafePasswordFallback(user: UserResource): boolean {
  const snapshot = toLoginMethodsUserSnapshot(user);
  return (
    snapshot.passwordEnabled &&
    snapshot.emailAddresses.some(
      (emailAddress) => emailAddress.verificationStatus === "verified" && emailAddress.linkedTo.length === 0,
    )
  );
}

function hasVerifiedGoogleMethod(user: UserResource): boolean {
  return toLoginMethodsUserSnapshot(user).externalAccounts.some(
    (account) => account.provider === "google" && account.verificationStatus === "verified",
  );
}

function hasAnyVerifiedLoginMethod(user: UserResource): boolean {
  const snapshot = toLoginMethodsUserSnapshot(user);
  return (
    snapshot.externalAccounts.some(
      (account) => account.provider === "google" && account.verificationStatus === "verified",
    ) ||
    (snapshot.passwordEnabled &&
      snapshot.emailAddresses.some((emailAddress) => emailAddress.verificationStatus === "verified"))
  );
}

function cardError(message: string): LoginMethodsCardState {
  return { status: "error", message };
}
