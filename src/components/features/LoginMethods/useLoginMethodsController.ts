import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { UserResource } from "@clerk/shared/types";
import { useMemo, useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import {
  findLoginEmailAddress,
  findVerifiedPrimaryLoginEmailAddress,
  getGoogleExternalAccountStateKeys,
  haveSameStringValues,
} from "./clerkLoginMethodResource";
import { emailVerificationCooldownMessage, getLoginMethodAccountErrorMessage } from "./loginMethodErrorPresentation";
import {
  createLoginMethodOperationCooldown,
  emailVerificationCooldownScope,
  type LoginMethodOperationCooldown,
} from "./operationCooldown";
import type { LoginMethodOnNeedsReverification, LoginMethodOperationOptions } from "./reverificationTypes";
import { buildLoginMethodsViewModel } from "./script";
import type { LoginEmailChangeDialogState, LoginMethodsCardState, LoginMethodsController } from "./types";

const IDLE_STATE: LoginMethodsCardState = { status: "idle", message: null };
const LOADING_STATE: LoginMethodsCardState = { status: "loading", message: null };
const LOGIN_EMAIL_CHANGE_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "email_code",
};
const GOOGLE_DISCONNECT_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "password",
};
const GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE =
  "メールアドレス未設定時はGoogle認証を解除できません。先にメールアドレスとパスワードを設定してください。";

type ControllerOptions = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  getCurrentActorId: () => string | null;
  onNeedsReverification?: LoginMethodOnNeedsReverification;
  runOperation?: <T>(operation: () => Promise<T>, options?: LoginMethodOperationOptions) => Promise<T | undefined>;
  operationCooldown?: LoginMethodOperationCooldown;
};

type EmailOperation = "startLoginEmail" | "verifyLoginEmail" | "resendLoginEmail";

type PrimaryChangeBaseline = {
  previousPrimaryEmailAddressId: string;
  passwordEnabled: boolean;
  googleAccounts: string[];
};

export function useLoginMethodsController({
  isLoaded,
  user,
  getCurrentActorId,
  onNeedsReverification,
  runOperation = async (operation) => operation(),
  operationCooldown,
}: ControllerOptions): LoginMethodsController {
  const actorUserId = user?.id ?? null;
  const localOperationCooldown = useMemo(() => createLoginMethodOperationCooldown(), []);
  const retryCooldown = operationCooldown ?? localOperationCooldown;
  const [, setResourceRevision] = useState(0);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailChangeDialog, setEmailChangeDialog] = useState<LoginEmailChangeDialogState>({ isOpen: false });

  const viewModel = buildLoginMethodsViewModel(
    user
      ? toLoginMethodsUserSnapshot(user)
      : { primaryEmailAddressId: null, passwordEnabled: false, emailAddresses: [], externalAccounts: [] },
  );

  const reloadUser = async (): Promise<UserResource> => {
    if (!isLoaded || !user || !actorUserId || user.id !== actorUserId || getCurrentActorId() !== actorUserId) {
      throw new Error("Unauthenticated");
    }
    await user.reload();
    if (user.id !== actorUserId || getCurrentActorId() !== actorUserId) throw new Error("Unauthenticated");
    setResourceRevision((current) => current + 1);
    return user;
  };

  const reverificationOptions = { onNeedsReverification };
  const destroyGoogleWithReverification = useReverification(async (externalAccountId: string) => {
    const currentUser = await reloadUser();
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser));
    const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
    const accountViewModel = freshViewModel.google.accounts.find((account) => account.id === externalAccountId);
    if (freshAccount?.provider !== "google" || !accountViewModel?.canDisconnect) return "unavailable" as const;
    await freshAccount.destroy();
    return "removed" as const;
  }, reverificationOptions);
  const ensureEmailAddressWithReverification = useReverification(async (email: string) => {
    const currentUser = await reloadUser();
    if (!buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser)).emailPassword.canChangeLoginEmail) {
      return { status: "unavailable" } as const;
    }
    const existing = findLoginEmailAddress(currentUser, null, email);
    if (existing) return { status: "ready", emailAddressId: existing.id } as const;
    const created = await currentUser.createEmailAddress({ email });
    return { status: "ready", emailAddressId: created.id } as const;
  }, reverificationOptions);
  const updatePrimaryEmailWithReverification = useReverification(async (emailAddressId: string) => {
    const currentUser = await reloadUser();
    const target = findLoginEmailAddress(currentUser, emailAddressId);
    if (
      target?.verification?.status !== "verified" ||
      !buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser)).emailPassword.canChangeLoginEmail
    ) {
      return "targetUnavailable" as const;
    }
    if (currentUser.primaryEmailAddressId === target.id) return "alreadyPrimary" as const;
    await currentUser.update({ primaryEmailAddressId: target.id });
    return "updated" as const;
  }, reverificationOptions);
  const destroyPreviousEmailWithReverification = useReverification(
    async ({ targetEmailAddressId, baseline }: { targetEmailAddressId: string; baseline: PrimaryChangeBaseline }) => {
      const currentUser = await reloadUser();
      if (primaryChangeCompleted(currentUser, actorUserId, targetEmailAddressId, baseline)) {
        return "alreadyRemoved" as const;
      }
      if (!primaryChangeReadyForCleanup(currentUser, actorUserId, targetEmailAddressId, baseline)) {
        return "unavailable" as const;
      }
      const previousEmail = findLoginEmailAddress(currentUser, baseline.previousPrimaryEmailAddressId);
      if (!previousEmail || previousEmail.id === currentUser.primaryEmailAddressId) return "unavailable" as const;
      await previousEmail.destroy();
      return "removed" as const;
    },
    reverificationOptions,
  );
  const showEmailChangeSuccess = () => {
    setEmailChangeDialog({ isOpen: false });
    setEmailPasswordState(IDLE_STATE);
    showSuccessToast({
      title: "メインのメールアドレスを変更しました",
    });
  };

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

  const rollbackPrimaryEmailChange = async (
    currentUser: UserResource,
    targetEmailAddressId: string,
    baseline: PrimaryChangeBaseline,
  ): Promise<boolean> => {
    await reloadUser();
    if (primaryChangeRolledBack(currentUser, actorUserId, targetEmailAddressId, baseline)) return true;
    if (!primaryChangeReadyForCleanup(currentUser, actorUserId, targetEmailAddressId, baseline)) return false;

    const rolledBack = await updatePrimaryEmailWithReverification(baseline.previousPrimaryEmailAddressId);
    if (rolledBack == null || rolledBack === "targetUnavailable") return false;
    await reloadUser();
    return primaryChangeRolledBack(currentUser, actorUserId, targetEmailAddressId, baseline);
  };

  const settlePreviousEmailRemovalFailure = async (
    currentUser: UserResource,
    targetEmailAddressId: string,
    baseline: PrimaryChangeBaseline,
  ): Promise<boolean> => {
    try {
      await reloadUser();
      if (primaryChangeCompleted(currentUser, actorUserId, targetEmailAddressId, baseline)) {
        showEmailChangeSuccess();
        return true;
      }

      const rolledBack = await rollbackPrimaryEmailChange(currentUser, targetEmailAddressId, baseline);
      setEmailPasswordState(
        cardError(
          rolledBack
            ? "以前のログイン用メールアドレスを削除できなかったため、変更を完了していません。時間をおいてもう一度お試しください。"
            : "メールアドレスの変更を完了できませんでした。最新の状態を読み込み、登録中のメールアドレスを確認してください。",
        ),
      );
    } catch {
      setEmailPasswordState(cardError("メールアドレスの変更を完了できませんでした。最新の状態を読み込んでください。"));
    }
    return false;
  };

  const completeLoginEmailChange = async (
    currentUser: UserResource,
    targetEmailAddressId: string,
    baseline: PrimaryChangeBaseline,
  ): Promise<boolean> => {
    const target = findLoginEmailAddress(currentUser, targetEmailAddressId);
    if (target?.verification?.status !== "verified") {
      setEmailPasswordState(cardError("変更先のメールアドレスを確認できません。最新の状態を読み込んでください。"));
      return false;
    }
    if (currentUser.primaryEmailAddressId !== target.id) {
      let updated: "updated" | "alreadyPrimary" | "targetUnavailable" | null | undefined;
      try {
        updated = await updatePrimaryEmailWithReverification(target.id);
      } catch (error) {
        await reloadUser();
        if (
          !primaryChangeReadyForCleanup(currentUser, actorUserId, target.id, baseline) &&
          !primaryChangeCompleted(currentUser, actorUserId, target.id, baseline)
        ) {
          throw error;
        }
        updated = "alreadyPrimary";
      }
      if (updated == null) {
        await reloadUser();
        if (
          !primaryChangeReadyForCleanup(currentUser, actorUserId, target.id, baseline) &&
          !primaryChangeCompleted(currentUser, actorUserId, target.id, baseline)
        ) {
          setEmailPasswordState(IDLE_STATE);
          return false;
        }
      }
      if (updated === "targetUnavailable") {
        setEmailPasswordState(
          cardError("変更先のメールアドレスの確認状態が変わりました。最新の状態を読み込んでください。"),
        );
        return false;
      }
    }
    await reloadUser();
    if (primaryChangeCompleted(currentUser, actorUserId, target.id, baseline)) {
      showEmailChangeSuccess();
      return true;
    }
    if (!primaryChangeReadyForCleanup(currentUser, actorUserId, target.id, baseline)) {
      setEmailPasswordState(cardError("変更結果を安全に確認できません。最新の状態を読み込んでください。"));
      return false;
    }

    try {
      const removed = await destroyPreviousEmailWithReverification({
        targetEmailAddressId: target.id,
        baseline,
      });
      if (removed == null || removed === "unavailable") {
        return await settlePreviousEmailRemovalFailure(currentUser, target.id, baseline);
      }
      await reloadUser();
    } catch {
      return await settlePreviousEmailRemovalFailure(currentUser, target.id, baseline);
    }

    if (!primaryChangeCompleted(currentUser, actorUserId, target.id, baseline)) {
      return await settlePreviousEmailRemovalFailure(currentUser, target.id, baseline);
    }
    showEmailChangeSuccess();
    return true;
  };

  const { run: runGoogleOperation } = useSingleFlight(
    async (operation: "prepareDisconnect" | "disconnect", externalAccountId: string) => {
      setGoogleState(LOADING_STATE);
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser));
        const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
        if (freshAccount?.provider !== "google") {
          setGoogleState(cardError("Google連携の状態が変わりました。最新の状態を読み込んでください。"));
          return false;
        }

        const accountViewModel = freshViewModel.google.accounts.find((account) => account.id === externalAccountId);
        if (!accountViewModel?.canDisconnect) {
          if (freshViewModel.methodState === "googleOnly") {
            setGoogleState(IDLE_STATE);
            showErrorToast(new Error(GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE));
          } else {
            setGoogleState(cardError(accountViewModel?.disconnectUnavailableReason ?? "Google連携を解除できません。"));
          }
          return false;
        }
        if (operation === "prepareDisconnect") {
          setGoogleState(IDLE_STATE);
          return true;
        }

        const destroyed = await destroyGoogleWithReverification(externalAccountId);
        if (destroyed === "unavailable") {
          setGoogleState(cardError("ログイン方法の状態が変わったため、Google連携を解除していません。"));
          return false;
        }
        await reloadUser();
        if (!googleDisconnectCompleted(currentUser, externalAccountId)) {
          setGoogleState(cardError("Google連携の解除結果を安全に確認できません。最新の状態を読み込んでください。"));
          return false;
        }
        setGoogleState(IDLE_STATE);
        showSuccessToast({ title: "Google連携を解除しました" });
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setGoogleState(IDLE_STATE);
          return false;
        }
        try {
          const currentUser = await reloadUser();
          if (operation === "disconnect" && googleDisconnectCompleted(currentUser, externalAccountId)) {
            setGoogleState(IDLE_STATE);
            showSuccessToast({ title: "Google連携を解除しました" });
            return true;
          }
        } catch {
          // 応答を失った場合も、最新resourceで完了を証明できなければ成功扱いにしない。
        }
        setGoogleState(cardError(getLoginMethodAccountErrorMessage(error)));
        return false;
      }
    },
  );

  const { run: runEmailOperation } = useSingleFlight(
    async (operation: EmailOperation, payload?: string): Promise<boolean> => {
      setEmailPasswordState(LOADING_STATE);
      let targetId: string | null = null;
      let targetEmail: string | null = null;
      let baseline: PrimaryChangeBaseline | null = null;
      try {
        const currentUser = await reloadUser();
        const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser));

        if (operation === "startLoginEmail") {
          if (!freshViewModel.emailPassword.canChangeLoginEmail || typeof payload !== "string") {
            setEmailPasswordState(
              cardError("メインのメールアドレスを変更できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          const parsed = requiredEmailSchema.safeParse(payload);
          if (!parsed.success) {
            setEmailPasswordState(cardError(parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。"));
            return false;
          }
          const currentPrimary = findVerifiedPrimaryLoginEmailAddress(currentUser);
          if (!currentPrimary) {
            setEmailPasswordState(cardError("現在のメインメールアドレスを確認できません。"));
            return false;
          }
          baseline = primaryChangeBaseline(currentUser, currentPrimary.id);
          targetEmail = normalizeEmail(parsed.data);
          if (normalizeEmail(currentPrimary.emailAddress) === targetEmail) {
            setEmailPasswordState(cardError("現在とは異なるメールアドレスを入力してください。"));
            return false;
          }
          let target = findLoginEmailAddress(currentUser, null, targetEmail);
          if (!target) {
            const ensured = await ensureEmailAddressWithReverification(targetEmail);
            if (ensured == null) {
              setEmailPasswordState(IDLE_STATE);
              return false;
            }
            if (ensured.status === "unavailable") {
              setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
              return false;
            }
            await reloadUser();
            target = findLoginEmailAddress(currentUser, ensured.emailAddressId, targetEmail);
          }
          const latestPrimary = findVerifiedPrimaryLoginEmailAddress(currentUser);
          if (!target || !latestPrimary) {
            setEmailPasswordState(cardError("変更先のメールアドレスを確認できません。"));
            return false;
          }
          baseline = primaryChangeBaseline(currentUser, latestPrimary.id);
          targetId = target.id;
          if (target.verification?.status === "verified") {
            return await completeLoginEmailChange(currentUser, target.id, baseline);
          }
          const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
          if (!cooldown.allowed) {
            setEmailChangeDialog({
              isOpen: true,
              step: "verification",
              currentEmailAddress: latestPrimary.emailAddress,
              targetEmailAddressId: target.id,
              targetEmailAddress: target.emailAddress,
            });
            setEmailPasswordState(cardError(emailVerificationCooldownMessage(cooldown.retryAfterSeconds)));
            return false;
          }
          await target.prepareVerification({ strategy: "email_code" });
          setEmailChangeDialog({
            isOpen: true,
            step: "verification",
            currentEmailAddress: latestPrimary.emailAddress,
            targetEmailAddressId: target.id,
            targetEmailAddress: target.emailAddress,
          });
          setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          return true;
        }

        if (operation === "verifyLoginEmail" || operation === "resendLoginEmail") {
          const target = resolveLoginEmailChangeDialogEmailAddress(currentUser, emailChangeDialog);
          const currentPrimary = findVerifiedPrimaryLoginEmailAddress(currentUser);
          if (!target || !currentPrimary) {
            setEmailPasswordState(
              cardError("確認中のメールアドレスを取得できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          baseline = primaryChangeBaseline(currentUser, currentPrimary.id);
          targetId = target.id;
          targetEmail = normalizeEmail(target.emailAddress);
          if (operation === "resendLoginEmail") {
            const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
            if (!cooldown.allowed) {
              setEmailPasswordState(cardError(emailVerificationCooldownMessage(cooldown.retryAfterSeconds)));
              return false;
            }
            await target.prepareVerification({ strategy: "email_code" });
            setEmailPasswordState({ status: "success", message: "新しい確認コードを送りました。" });
            return true;
          }
          if (operation === "verifyLoginEmail" && (typeof payload !== "string" || !payload.trim())) {
            setEmailPasswordState(cardError("確認コードを入力してください。"));
            return false;
          }
          if (operation === "verifyLoginEmail" && target.verification?.status !== "verified") {
            await target.attemptVerification({ code: (payload as string).trim() });
            await reloadUser();
          }
          return await completeLoginEmailChange(currentUser, target.id, baseline);
        }
        return false;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setEmailPasswordState(IDLE_STATE);
          return false;
        }
        try {
          const currentUser = await reloadUser();
          const recoveredTarget = findLoginEmailAddress(currentUser, targetId, targetEmail ?? undefined);
          targetId ??= recoveredTarget?.id ?? null;
          if (baseline && targetId && primaryChangeCompleted(currentUser, actorUserId, targetId, baseline)) {
            showEmailChangeSuccess();
            return true;
          }
          if (baseline && targetId && primaryChangeReadyForCleanup(currentUser, actorUserId, targetId, baseline)) {
            const rolledBack = await rollbackPrimaryEmailChange(currentUser, targetId, baseline);
            setEmailPasswordState(
              cardError(
                rolledBack
                  ? "変更処理を完了できなかったため、以前のメールアドレスをメインに戻しました。もう一度お試しください。"
                  : "メールアドレスの変更を完了できませんでした。最新の状態を読み込んでください。",
              ),
            );
            return false;
          }
          if (recoveredTarget) {
            const currentPrimary = findVerifiedPrimaryLoginEmailAddress(currentUser);
            if (currentPrimary && recoveredTarget.verification?.status !== "verified") {
              setEmailChangeDialog({
                isOpen: true,
                step: "verification",
                currentEmailAddress: currentPrimary.emailAddress,
                targetEmailAddressId: recoveredTarget.id,
                targetEmailAddress: recoveredTarget.emailAddress,
              });
              setEmailPasswordState(
                cardError(
                  operation === "verifyLoginEmail"
                    ? getLoginMethodAccountErrorMessage(error)
                    : "確認コードの送信結果を確認できません。必要な場合は確認コードを再送してください。",
                ),
              );
              return false;
            }
          }
        } catch {
          // 部分成功を推測せず、Clerkの最新状態で証明できる場合だけ成功へ収束する。
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
    emailChangeDialog,
    reload,
    prepareGoogleDisconnect: (externalAccountId) => runGoogleOperation("prepareDisconnect", externalAccountId),
    disconnectGoogle: async (externalAccountId) =>
      (await runOperation(
        () => runGoogleOperation("disconnect", externalAccountId),
        GOOGLE_DISCONNECT_REVERIFICATION_OPTIONS,
      )) ?? false,
    openLoginEmailChange: () => {
      const primaryEmail = viewModel.emailPassword.primaryEmail;
      if (!viewModel.emailPassword.canChangeLoginEmail || !primaryEmail) {
        setEmailPasswordState(cardError("メインのメールアドレスを変更できません。最新の状態を読み込んでください。"));
        return;
      }
      setEmailPasswordState(IDLE_STATE);
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentEmailAddress: primaryEmail.emailAddress,
        targetEmailAddressId: null,
        targetEmailAddress: null,
      });
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
        currentEmailAddress: emailChangeDialog.currentEmailAddress,
        targetEmailAddressId: null,
        targetEmailAddress: null,
      });
      setEmailPasswordState(IDLE_STATE);
    },
    startLoginEmailChange: (email) =>
      runOperation(() => runEmailOperation("startLoginEmail", email), LOGIN_EMAIL_CHANGE_REVERIFICATION_OPTIONS),
    verifyLoginEmailCode: (code) =>
      runOperation(() => runEmailOperation("verifyLoginEmail", code), LOGIN_EMAIL_CHANGE_REVERIFICATION_OPTIONS),
    resendLoginEmailCode: () =>
      runOperation(() => runEmailOperation("resendLoginEmail"), LOGIN_EMAIL_CHANGE_REVERIFICATION_OPTIONS),
  };
}

function resolveLoginEmailChangeDialogEmailAddress(user: UserResource, dialog: LoginEmailChangeDialogState) {
  if (!dialog.isOpen || !dialog.targetEmailAddressId) return undefined;
  return findLoginEmailAddress(user, dialog.targetEmailAddressId);
}

function primaryChangeBaseline(user: UserResource, previousPrimaryEmailAddressId: string): PrimaryChangeBaseline {
  return {
    previousPrimaryEmailAddressId,
    passwordEnabled: user.passwordEnabled,
    googleAccounts: getGoogleExternalAccountStateKeys(user),
  };
}

function primaryChangeReadyForCleanup(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  return (
    primaryChangeBaseMatches(user, actorUserId, targetEmailAddressId, baseline) &&
    user.primaryEmailAddressId === targetEmailAddressId &&
    targetEmailAddressId !== baseline.previousPrimaryEmailAddressId &&
    user.emailAddresses.some((emailAddress) => emailAddress.id === baseline.previousPrimaryEmailAddressId)
  );
}

function primaryChangeCompleted(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  return (
    primaryChangeBaseMatches(user, actorUserId, targetEmailAddressId, baseline) &&
    user.primaryEmailAddressId === targetEmailAddressId &&
    !user.emailAddresses.some((emailAddress) => emailAddress.id === baseline.previousPrimaryEmailAddressId)
  );
}

function primaryChangeRolledBack(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  const previousEmail = findLoginEmailAddress(user, baseline.previousPrimaryEmailAddressId);
  return (
    primaryChangeBaseMatches(user, actorUserId, targetEmailAddressId, baseline) &&
    user.primaryEmailAddressId === baseline.previousPrimaryEmailAddressId &&
    previousEmail?.verification?.status === "verified"
  );
}

function primaryChangeBaseMatches(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  const target = findLoginEmailAddress(user, targetEmailAddressId);
  return (
    user.id === actorUserId &&
    target?.verification?.status === "verified" &&
    user.passwordEnabled === baseline.passwordEnabled &&
    haveSameStringValues(getGoogleExternalAccountStateKeys(user), baseline.googleAccounts)
  );
}

function googleDisconnectCompleted(user: UserResource, externalAccountId: string) {
  return (
    !user.externalAccounts.some((account) => account.id === externalAccountId) &&
    user.passwordEnabled &&
    user.emailAddresses.some((emailAddress) => emailAddress.verification?.status === "verified")
  );
}

function cardError(message: string): LoginMethodsCardState {
  return { status: "error", message };
}
