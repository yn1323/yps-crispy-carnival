import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource, UserResource } from "@clerk/shared/types";
import { useMemo, useRef, useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import {
  buildGoogleDisconnectPlan,
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
import { reloadActorUser } from "./reloadActorUser";
import type { LoginMethodOnNeedsReverification, LoginMethodOperationOptions } from "./reverificationTypes";
import { buildLoginMethodsViewModel } from "./script";
import type {
  GoogleDisconnectMode,
  GoogleDisconnectPreparation,
  LoginEmailChangeDialogState,
  LoginMethodsCardState,
  LoginMethodsController,
} from "./types";

const IDLE_STATE: LoginMethodsCardState = { status: "idle", message: null };
const LOADING_STATE: LoginMethodsCardState = { status: "loading", message: null };
const LOGIN_EMAIL_CHANGE_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "email_code",
};
const GOOGLE_DISCONNECT_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "password",
};
const GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE =
  "Google認証を解除できません。先にメールアドレスとパスワードを設定してください。";
const GOOGLE_DISCONNECT_STATE_CHANGED_MESSAGE =
  "ログイン方法の状態が変わったため、Google連携を解除していません。最新の状態を読み込んでください。";
const GOOGLE_DISCONNECT_CLEANUP_PENDING_MESSAGE =
  "Google連携の解除を完了できませんでした。この画面を閉じずに、もう一度お試しください。";
const GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE =
  "Google連携の解除結果を安全に確認できません。最新の状態を読み込んでください。";

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
  preservePreviousPrimaryEmail: boolean;
  passwordEnabled: boolean;
  googleAccounts: string[];
};

type PrimaryEmailChangePlan = {
  targetEmailAddressId: string | null;
  baseline: PrimaryChangeBaseline;
};

type PreparedGoogleDisconnectPlan = {
  actorUserId: string;
  mode: GoogleDisconnectMode;
  externalAccountId: string;
  externalIdentificationId: string;
  externalProviderUserId: string;
  googleEmailAddress: string;
  normalizedGoogleEmail: string;
  primaryEmailAddressId: string;
  normalizedPrimaryEmail: string;
  emailAddressId: string | null;
  preservedEmailAddressIds: string[];
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
  const googleDisconnectPlanRef = useRef<PreparedGoogleDisconnectPlan | null>(null);
  const primaryEmailChangePlanRef = useRef<PrimaryEmailChangePlan | null>(null);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [googleDisconnectPendingCleanup, setGoogleDisconnectPendingCleanup] = useState(false);
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(IDLE_STATE);
  const [emailChangeDialog, setEmailChangeDialog] = useState<LoginEmailChangeDialogState>({ isOpen: false });

  const viewModel = buildLoginMethodsViewModel(
    user
      ? toLoginMethodsUserSnapshot(user)
      : { primaryEmailAddressId: null, passwordEnabled: false, emailAddresses: [], externalAccounts: [] },
  );

  const reloadUser = async (): Promise<UserResource> => {
    const currentUser = await reloadActorUser({ isLoaded, user, actorUserId, getCurrentActorId });
    setResourceRevision((current) => current + 1);
    return currentUser;
  };

  const reverificationOptions = { onNeedsReverification };
  const destroyGoogleWithReverification = useReverification(async (plan: PreparedGoogleDisconnectPlan) => {
    const currentUser = await reloadUser();
    if (!preparedGoogleDisconnectPlanMatches(currentUser, actorUserId, plan)) return "unavailable" as const;
    const freshAccount = currentUser.externalAccounts.find((account) => account.id === plan.externalAccountId);
    if (!freshAccount) return "unavailable" as const;
    await freshAccount.destroy();
    return "removed" as const;
  }, reverificationOptions);
  const destroyGoogleEmailWithReverification = useReverification(async (plan: PreparedGoogleDisconnectPlan) => {
    const currentUser = await reloadUser();
    if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return "alreadyRemoved" as const;
    if (!googleDisconnectReadyForEmailCleanup(currentUser, actorUserId, plan)) return "unavailable" as const;
    const targetEmail = findLoginEmailAddress(currentUser, plan.emailAddressId);
    if (!targetEmail) return "unavailable" as const;
    await targetEmail.destroy();
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
  const updatePrimaryEmailWithReverification = useReverification(
    async ({
      emailAddressId,
      targetEmailAddressId,
      baseline,
    }: {
      emailAddressId: string;
      targetEmailAddressId: string;
      baseline: PrimaryChangeBaseline;
    }) => {
      const currentUser = await reloadUser();
      const target = findLoginEmailAddress(currentUser, emailAddressId);
      if (
        target?.verification?.status !== "verified" ||
        !buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser)).emailPassword.canChangeLoginEmail
      ) {
        return "targetUnavailable" as const;
      }

      const isForwardUpdate = emailAddressId === targetEmailAddressId;
      if (currentUser.primaryEmailAddressId === target.id) {
        const settled = isForwardUpdate
          ? primaryChangeCompleted(currentUser, actorUserId, targetEmailAddressId, baseline) ||
            primaryChangeReadyForCleanup(currentUser, actorUserId, targetEmailAddressId, baseline)
          : primaryChangeRolledBack(currentUser, actorUserId, targetEmailAddressId, baseline);
        return settled ? ("alreadyPrimary" as const) : ("stateUnavailable" as const);
      }

      const ready = isForwardUpdate
        ? primaryChangeReadyForUpdate(currentUser, actorUserId, targetEmailAddressId, baseline)
        : emailAddressId === baseline.previousPrimaryEmailAddressId &&
          primaryChangeReadyForCleanup(currentUser, actorUserId, targetEmailAddressId, baseline);
      if (!ready) return "stateUnavailable" as const;

      await currentUser.update({ primaryEmailAddressId: target.id });
      return "updated" as const;
    },
    reverificationOptions,
  );
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
    primaryEmailChangePlanRef.current = null;
    setEmailChangeDialog({ isOpen: false });
    setEmailPasswordState(IDLE_STATE);
    showSuccessToast({
      title: "メールアドレスを変更しました",
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

    const rolledBack = await updatePrimaryEmailWithReverification({
      emailAddressId: baseline.previousPrimaryEmailAddressId,
      targetEmailAddressId,
      baseline,
    });
    if (rolledBack == null || rolledBack === "targetUnavailable" || rolledBack === "stateUnavailable") return false;
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
      let updated: "updated" | "alreadyPrimary" | "targetUnavailable" | "stateUnavailable" | null | undefined;
      try {
        updated = await updatePrimaryEmailWithReverification({
          emailAddressId: target.id,
          targetEmailAddressId: target.id,
          baseline,
        });
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
      if (updated === "stateUnavailable") {
        setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
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

  const showGoogleDisconnectSuccess = () => {
    googleDisconnectPlanRef.current = null;
    setGoogleDisconnectPendingCleanup(false);
    setGoogleState(IDLE_STATE);
    showSuccessToast({ title: "Google連携を解除しました" });
    return true;
  };

  const showGoogleDisconnectUnavailable = (currentUser: UserResource, externalAccountId: string) => {
    const freshViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser));
    const freshAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
    if (freshAccount?.provider === "google" && freshViewModel.methodState === "googleOnly") {
      setGoogleState(IDLE_STATE);
      showErrorToast(new Error(GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE));
      return false;
    }
    setGoogleState(IDLE_STATE);
    showErrorToast(new Error(GOOGLE_DISCONNECT_STATE_CHANGED_MESSAGE));
    return false;
  };

  const settleGoogleDisconnectFailure = async (error: unknown, plan: PreparedGoogleDisconnectPlan) => {
    try {
      const currentUser = await reloadUser();
      if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return showGoogleDisconnectSuccess();
      if (
        plan.mode === "externalAndEmail" &&
        googleExternalAccountRemoved(currentUser, plan) &&
        googleDisconnectReadyForEmailCleanup(currentUser, actorUserId, plan)
      ) {
        setGoogleDisconnectPendingCleanup(true);
        setGoogleState(cardError(GOOGLE_DISCONNECT_CLEANUP_PENDING_MESSAGE));
        return false;
      }
      if (isReverificationCancelledError(error) && !googleExternalAccountRemoved(currentUser, plan)) {
        setGoogleState(IDLE_STATE);
        return false;
      }
    } catch {
      // Clerkの最新状態で完了を証明できない場合は、成功や部分成功を推測しない。
    }
    setGoogleDisconnectPendingCleanup(false);
    setGoogleState(
      cardError(
        isReverificationCancelledError(error)
          ? GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE
          : getLoginMethodAccountErrorMessage(error),
      ),
    );
    return false;
  };

  const completeGoogleDisconnect = async (currentUser: UserResource, plan: PreparedGoogleDisconnectPlan) => {
    if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return showGoogleDisconnectSuccess();

    const currentAccount = currentUser.externalAccounts.find((account) => account.id === plan.externalAccountId);
    if (currentAccount) {
      if (!preparedGoogleDisconnectPlanMatches(currentUser, actorUserId, plan)) {
        setGoogleState(cardError(GOOGLE_DISCONNECT_STATE_CHANGED_MESSAGE));
        return false;
      }
      let destroyed: "removed" | "unavailable" | undefined;
      try {
        destroyed = await destroyGoogleWithReverification(plan);
      } catch (error) {
        if (isReverificationCancelledError(error)) return await settleGoogleDisconnectFailure(error, plan);
        try {
          await reloadUser();
        } catch {
          return await settleGoogleDisconnectFailure(error, plan);
        }
        if (!googleExternalAccountRemoved(currentUser, plan)) {
          return await settleGoogleDisconnectFailure(error, plan);
        }
        destroyed = "removed";
      }
      if (destroyed == null) {
        setGoogleState(IDLE_STATE);
        return false;
      }
      if (destroyed === "unavailable") {
        setGoogleState(cardError(GOOGLE_DISCONNECT_STATE_CHANGED_MESSAGE));
        return false;
      }
      await reloadUser();
    }

    if (!googleExternalAccountRemoved(currentUser, plan)) {
      setGoogleState(cardError(GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE));
      return false;
    }
    if (plan.mode === "externalOnly") {
      if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return showGoogleDisconnectSuccess();
      setGoogleState(cardError(GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE));
      return false;
    }
    if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return showGoogleDisconnectSuccess();
    if (!googleDisconnectReadyForEmailCleanup(currentUser, actorUserId, plan)) {
      setGoogleDisconnectPendingCleanup(false);
      setGoogleState(cardError(GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE));
      return false;
    }

    let removed: "removed" | "alreadyRemoved" | "unavailable" | undefined;
    try {
      removed = await destroyGoogleEmailWithReverification(plan);
    } catch (error) {
      return await settleGoogleDisconnectFailure(error, plan);
    }
    if (removed == null) {
      return await settleGoogleDisconnectFailure(new Error("Google email cleanup was interrupted"), plan);
    }
    await reloadUser();
    if (googleDisconnectCompleted(currentUser, actorUserId, plan)) return showGoogleDisconnectSuccess();
    if (removed === "unavailable" || !googleDisconnectReadyForEmailCleanup(currentUser, actorUserId, plan)) {
      setGoogleDisconnectPendingCleanup(false);
      setGoogleState(cardError(GOOGLE_DISCONNECT_RESULT_UNAVAILABLE_MESSAGE));
      return false;
    }
    setGoogleDisconnectPendingCleanup(true);
    setGoogleState(cardError(GOOGLE_DISCONNECT_CLEANUP_PENDING_MESSAGE));
    return false;
  };

  const { run: runGoogleOperation } = useSingleFlight(
    async (operation: "prepareDisconnect" | "disconnect", externalAccountId: string) => {
      setGoogleState(LOADING_STATE);
      try {
        const currentUser = await reloadUser();
        let plan =
          operation === "disconnect" && googleDisconnectPlanRef.current?.externalAccountId === externalAccountId
            ? googleDisconnectPlanRef.current
            : null;
        if (!plan) {
          plan = prepareGoogleDisconnectPlan(currentUser, actorUserId, externalAccountId);
        }
        if (!plan) return showGoogleDisconnectUnavailable(currentUser, externalAccountId);

        if (operation === "prepareDisconnect") {
          googleDisconnectPlanRef.current = plan;
          setGoogleDisconnectPendingCleanup(false);
          setGoogleState(IDLE_STATE);
          return {
            mode: plan.mode,
            googleEmailAddress: plan.googleEmailAddress,
          } satisfies GoogleDisconnectPreparation;
        }

        googleDisconnectPlanRef.current = plan;
        return await completeGoogleDisconnect(currentUser, plan);
      } catch (error) {
        const plan = googleDisconnectPlanRef.current;
        if (operation === "disconnect" && plan?.externalAccountId === externalAccountId) {
          return await settleGoogleDisconnectFailure(error, plan);
        }
        if (isReverificationCancelledError(error)) {
          setGoogleState(IDLE_STATE);
          return false;
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
          baseline = primaryEmailChangePlanRef.current?.baseline ?? primaryChangeBaseline(currentUser, currentPrimary);
          if (!primaryChangeBaselineMatchesCurrentPrimary(currentUser, actorUserId, baseline)) {
            setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
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
          if (!target) {
            setEmailPasswordState(cardError("変更先のメールアドレスを確認できません。"));
            return false;
          }
          if (!primaryChangeBaselineMatchesCurrentPrimary(currentUser, actorUserId, baseline)) {
            setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
          const baselinePrimary = findLoginEmailAddress(currentUser, baseline.previousPrimaryEmailAddressId);
          if (!baselinePrimary) {
            setEmailPasswordState(cardError("現在のメインメールアドレスを確認できません。"));
            return false;
          }
          targetId = target.id;
          primaryEmailChangePlanRef.current = { targetEmailAddressId: target.id, baseline };
          if (target.verification?.status === "verified") {
            return await completeLoginEmailChange(currentUser, target.id, baseline);
          }
          const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
          if (!cooldown.allowed) {
            setEmailChangeDialog({
              isOpen: true,
              step: "verification",
              currentEmailAddress: baselinePrimary.emailAddress,
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
            currentEmailAddress: baselinePrimary.emailAddress,
            targetEmailAddressId: target.id,
            targetEmailAddress: target.emailAddress,
          });
          setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
          return true;
        }

        if (operation === "verifyLoginEmail" || operation === "resendLoginEmail") {
          const target = resolveLoginEmailChangeDialogEmailAddress(currentUser, emailChangeDialog);
          const plan = primaryEmailChangePlanRef.current;
          if (!target || !plan || plan.targetEmailAddressId !== target.id) {
            setEmailPasswordState(
              cardError("確認中のメールアドレスを取得できません。最新の状態を読み込んでください。"),
            );
            return false;
          }
          baseline = plan.baseline;
          targetId = target.id;
          targetEmail = normalizeEmail(target.emailAddress);
          if (
            primaryChangeCompleted(currentUser, actorUserId, target.id, baseline) ||
            primaryChangeReadyForCleanup(currentUser, actorUserId, target.id, baseline)
          ) {
            return await completeLoginEmailChange(currentUser, target.id, baseline);
          }
          if (!primaryChangeBaselineMatchesCurrentPrimary(currentUser, actorUserId, baseline)) {
            setEmailPasswordState(cardError("ログイン方法の状態が変わりました。最新の状態を読み込んでください。"));
            return false;
          }
          if (operation === "resendLoginEmail") {
            const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
            if (!cooldown.allowed) {
              setEmailPasswordState(cardError(emailVerificationCooldownMessage(cooldown.retryAfterSeconds)));
              return false;
            }
            await target.prepareVerification({ strategy: "email_code" });
            setEmailPasswordState({ status: "success", message: "新しい確認コードを再送しました。" });
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
          if (
            baseline &&
            recoveredTarget &&
            recoveredTarget.verification?.status !== "verified" &&
            primaryChangeBaselineMatchesCurrentPrimary(currentUser, actorUserId, baseline)
          ) {
            const baselinePrimary = findLoginEmailAddress(currentUser, baseline.previousPrimaryEmailAddressId);
            if (baselinePrimary) {
              primaryEmailChangePlanRef.current = {
                targetEmailAddressId: recoveredTarget.id,
                baseline,
              };
              setEmailChangeDialog({
                isOpen: true,
                step: "verification",
                currentEmailAddress: baselinePrimary.emailAddress,
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
    googleDisconnectPendingCleanup,
    emailPasswordState,
    emailChangeDialog,
    reload,
    prepareGoogleDisconnect: async (externalAccountId) => {
      const outcome = await runGoogleOperation("prepareDisconnect", externalAccountId);
      return outcome && typeof outcome === "object" ? outcome : false;
    },
    disconnectGoogle: async (externalAccountId) => {
      const outcome = await runOperation(
        () => runGoogleOperation("disconnect", externalAccountId),
        GOOGLE_DISCONNECT_REVERIFICATION_OPTIONS,
      );
      return outcome === true;
    },
    closeGoogleDisconnect: () => {
      googleDisconnectPlanRef.current = null;
      setGoogleDisconnectPendingCleanup(false);
      setGoogleState(IDLE_STATE);
    },
    openLoginEmailChange: () => {
      const primaryEmail = viewModel.emailPassword.primaryEmail;
      if (!viewModel.emailPassword.canChangeLoginEmail || !primaryEmail) {
        setEmailPasswordState(cardError("メインのメールアドレスを変更できません。最新の状態を読み込んでください。"));
        return;
      }
      const primaryEmailResource = user ? findLoginEmailAddress(user, primaryEmail.id) : undefined;
      if (!user || primaryEmailResource?.verification?.status !== "verified") {
        setEmailPasswordState(cardError("メインのメールアドレスを変更できません。最新の状態を読み込んでください。"));
        return;
      }
      primaryEmailChangePlanRef.current = {
        targetEmailAddressId: null,
        baseline: primaryChangeBaseline(user, primaryEmailResource),
      };
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
      primaryEmailChangePlanRef.current = null;
      setEmailChangeDialog({ isOpen: false });
      setEmailPasswordState(IDLE_STATE);
    },
    backToLoginEmailInput: () => {
      if (emailPasswordState.status === "loading" || !emailChangeDialog.isOpen) return;
      if (primaryEmailChangePlanRef.current) {
        primaryEmailChangePlanRef.current = {
          ...primaryEmailChangePlanRef.current,
          targetEmailAddressId: null,
        };
      }
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

function isGoogleLinkedLoginEmail(emailAddress: EmailAddressResource | null | undefined) {
  return emailAddress?.linkedTo.some((link) => link.type === "oauth_google") ?? false;
}

function primaryChangeBaseline(user: UserResource, previousPrimaryEmail: EmailAddressResource): PrimaryChangeBaseline {
  return {
    previousPrimaryEmailAddressId: previousPrimaryEmail.id,
    preservePreviousPrimaryEmail: isGoogleLinkedLoginEmail(previousPrimaryEmail),
    passwordEnabled: user.passwordEnabled,
    googleAccounts: getGoogleExternalAccountStateKeys(user),
  };
}

function primaryChangeBaselineMatchesCurrentPrimary(
  user: UserResource,
  actorUserId: string | null,
  baseline: PrimaryChangeBaseline,
) {
  const previousEmail = findLoginEmailAddress(user, baseline.previousPrimaryEmailAddressId);
  return (
    primaryChangeInvariantMatches(user, actorUserId, baseline) &&
    user.primaryEmailAddressId === baseline.previousPrimaryEmailAddressId &&
    previousEmail?.verification?.status === "verified" &&
    isGoogleLinkedLoginEmail(previousEmail) === baseline.preservePreviousPrimaryEmail
  );
}

function primaryChangeReadyForUpdate(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  return (
    targetEmailAddressId !== baseline.previousPrimaryEmailAddressId &&
    findLoginEmailAddress(user, targetEmailAddressId)?.verification?.status === "verified" &&
    primaryChangeBaselineMatchesCurrentPrimary(user, actorUserId, baseline)
  );
}

function primaryChangeReadyForCleanup(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  const previousEmail = findLoginEmailAddress(user, baseline.previousPrimaryEmailAddressId);
  return (
    !baseline.preservePreviousPrimaryEmail &&
    primaryChangeBaseMatches(user, actorUserId, targetEmailAddressId, baseline) &&
    user.primaryEmailAddressId === targetEmailAddressId &&
    targetEmailAddressId !== baseline.previousPrimaryEmailAddressId &&
    previousEmail?.verification?.status === "verified" &&
    !isGoogleLinkedLoginEmail(previousEmail)
  );
}

function primaryChangeCompleted(
  user: UserResource,
  actorUserId: string | null,
  targetEmailAddressId: string,
  baseline: PrimaryChangeBaseline,
) {
  const previousEmail = findLoginEmailAddress(user, baseline.previousPrimaryEmailAddressId);
  return (
    primaryChangeBaseMatches(user, actorUserId, targetEmailAddressId, baseline) &&
    user.primaryEmailAddressId === targetEmailAddressId &&
    targetEmailAddressId !== baseline.previousPrimaryEmailAddressId &&
    (baseline.preservePreviousPrimaryEmail
      ? previousEmail?.verification?.status === "verified" && isGoogleLinkedLoginEmail(previousEmail)
      : previousEmail == null)
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
    previousEmail?.verification?.status === "verified" &&
    isGoogleLinkedLoginEmail(previousEmail) === baseline.preservePreviousPrimaryEmail
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
    primaryChangeInvariantMatches(user, actorUserId, baseline) &&
    target?.verification?.status === "verified" &&
    targetEmailAddressId !== baseline.previousPrimaryEmailAddressId
  );
}

function primaryChangeInvariantMatches(
  user: UserResource,
  actorUserId: string | null,
  baseline: PrimaryChangeBaseline,
) {
  return (
    user.id === actorUserId &&
    user.passwordEnabled === baseline.passwordEnabled &&
    haveSameStringValues(getGoogleExternalAccountStateKeys(user), baseline.googleAccounts)
  );
}

function prepareGoogleDisconnectPlan(
  user: UserResource,
  actorUserId: string | null,
  externalAccountId: string,
): PreparedGoogleDisconnectPlan | null {
  if (!actorUserId || user.id !== actorUserId) return null;
  const externalAccount = user.externalAccounts.find((account) => account.id === externalAccountId);
  const primaryEmail = findVerifiedPrimaryLoginEmailAddress(user);
  if (!externalAccount || !primaryEmail) return null;

  const plan = buildGoogleDisconnectPlan(user, externalAccount);
  if (plan.status === "unavailable") return null;
  const emailAddressId = plan.status === "externalAndEmail" ? plan.emailAddress.id : null;
  return {
    actorUserId,
    mode: plan.status,
    externalAccountId: externalAccount.id,
    externalIdentificationId: externalAccount.identificationId,
    externalProviderUserId: externalAccount.providerUserId,
    googleEmailAddress: plan.status === "externalAndEmail" ? plan.emailAddress.emailAddress : primaryEmail.emailAddress,
    normalizedGoogleEmail: normalizeEmail(externalAccount.emailAddress),
    primaryEmailAddressId: primaryEmail.id,
    normalizedPrimaryEmail: normalizeEmail(primaryEmail.emailAddress),
    emailAddressId,
    preservedEmailAddressIds: user.emailAddresses
      .filter((emailAddress) => emailAddress.id !== emailAddressId)
      .map((emailAddress) => emailAddress.id),
  };
}

function preparedGoogleDisconnectPlanMatches(
  user: UserResource,
  actorUserId: string | null,
  prepared: PreparedGoogleDisconnectPlan,
) {
  const current = prepareGoogleDisconnectPlan(user, actorUserId, prepared.externalAccountId);
  return (
    current?.actorUserId === prepared.actorUserId &&
    current.mode === prepared.mode &&
    current.externalIdentificationId === prepared.externalIdentificationId &&
    current.externalProviderUserId === prepared.externalProviderUserId &&
    current.googleEmailAddress === prepared.googleEmailAddress &&
    current.normalizedGoogleEmail === prepared.normalizedGoogleEmail &&
    current.primaryEmailAddressId === prepared.primaryEmailAddressId &&
    current.normalizedPrimaryEmail === prepared.normalizedPrimaryEmail &&
    current.emailAddressId === prepared.emailAddressId &&
    prepared.preservedEmailAddressIds.every((id) => current.preservedEmailAddressIds.includes(id))
  );
}

function googleDisconnectFallbackMatches(
  user: UserResource,
  actorUserId: string | null,
  plan: PreparedGoogleDisconnectPlan,
) {
  const primaryEmail = findVerifiedPrimaryLoginEmailAddress(user);
  return (
    actorUserId === plan.actorUserId &&
    user.id === plan.actorUserId &&
    user.passwordEnabled &&
    primaryEmail?.id === plan.primaryEmailAddressId &&
    normalizeEmail(primaryEmail.emailAddress) === plan.normalizedPrimaryEmail &&
    plan.preservedEmailAddressIds.every((id) => user.emailAddresses.some((emailAddress) => emailAddress.id === id))
  );
}

function googleExternalAccountRemoved(user: UserResource, plan: PreparedGoogleDisconnectPlan) {
  return !user.externalAccounts.some(
    (account) =>
      account.id === plan.externalAccountId ||
      account.identificationId === plan.externalIdentificationId ||
      (account.provider === "google" &&
        (account.providerUserId === plan.externalProviderUserId ||
          normalizeEmail(account.emailAddress) === plan.normalizedGoogleEmail)),
  );
}

function googleDisconnectReadyForEmailCleanup(
  user: UserResource,
  actorUserId: string | null,
  plan: PreparedGoogleDisconnectPlan,
) {
  if (plan.mode !== "externalAndEmail" || !plan.emailAddressId) return false;
  const targetEmail = findLoginEmailAddress(user, plan.emailAddressId);
  const sameGoogleEmailAddresses = user.emailAddresses.filter(
    (emailAddress) => normalizeEmail(emailAddress.emailAddress) === plan.normalizedGoogleEmail,
  );
  const targetLinkIsAbsentOrOriginal =
    targetEmail?.linkedTo.length === 0 ||
    (targetEmail?.linkedTo.length === 1 &&
      targetEmail.linkedTo[0]?.id === plan.externalIdentificationId &&
      targetEmail.linkedTo[0]?.type === "oauth_google");
  return (
    googleDisconnectFallbackMatches(user, actorUserId, plan) &&
    googleExternalAccountRemoved(user, plan) &&
    sameGoogleEmailAddresses.length === 1 &&
    sameGoogleEmailAddresses[0]?.id === targetEmail?.id &&
    targetEmail?.id !== user.primaryEmailAddressId &&
    targetEmail?.verification?.status === "verified" &&
    targetEmail.emailAddress === plan.googleEmailAddress &&
    normalizeEmail(targetEmail.emailAddress) === plan.normalizedGoogleEmail &&
    targetLinkIsAbsentOrOriginal
  );
}

function googleDisconnectCompleted(user: UserResource, actorUserId: string | null, plan: PreparedGoogleDisconnectPlan) {
  if (!googleDisconnectFallbackMatches(user, actorUserId, plan) || !googleExternalAccountRemoved(user, plan)) {
    return false;
  }
  if (plan.mode === "externalOnly") return plan.emailAddressId === null;
  return (
    plan.emailAddressId !== null &&
    !user.emailAddresses.some(
      (emailAddress) =>
        emailAddress.id === plan.emailAddressId ||
        normalizeEmail(emailAddress.emailAddress) === plan.normalizedGoogleEmail,
    )
  );
}

function cardError(message: string): LoginMethodsCardState {
  return { status: "error", message };
}
