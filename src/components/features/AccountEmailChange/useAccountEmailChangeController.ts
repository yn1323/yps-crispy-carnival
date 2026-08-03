import { useReverification, useUser } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource } from "@clerk/shared/types";
import { useAction, useMutation } from "convex/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { getUserFacingErrorMessage } from "@/src/components/shared/feedback/presentation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { accountEmailChangeSessionAtom, accountEmailCleanupSessionAtom } from "@/src/stores/accountEmail";

export type AccountEmailChangeStep =
  | "input"
  | "verify"
  | "updating"
  | "syncFailed"
  | "rollbackSyncFailed"
  | "cleanupFailed"
  | "rollbackCleanupFailed"
  | "complete"
  | "rolledBack";

export type AccountEmailChangeController = ReturnType<typeof useAccountEmailChangeController>;

export function useAccountEmailChangeController({
  source = "app",
  resumeCleanup = false,
}: {
  source?: "app" | "recovery";
  resumeCleanup?: boolean;
} = {}) {
  const { isLoaded, user } = useUser();
  const setAccountEmailChangeSession = useSetAtom(accountEmailChangeSessionAtom);
  const cleanupSession = useAtomValue(accountEmailCleanupSessionAtom);
  const setAccountEmailCleanupSession = useSetAtom(accountEmailCleanupSessionAtom);
  const preflight = useMutation(api.accountEmail.mutations.preflight);
  const syncMyPrimaryEmail = useAction(api.accountEmail.actions.syncMyPrimaryEmail);
  const [step, setStep] = useState<AccountEmailChangeStep>(() => {
    if (!resumeCleanup) return "input";
    return cleanupSession?.kind === "rolledBackTarget" ? "rollbackCleanupFailed" : "cleanupFailed";
  });
  const [isRestoringCleanup, setIsRestoringCleanup] = useState(resumeCleanup);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [targetMaskedEmail, setTargetMaskedEmail] = useState("");
  const [needsVerificationCode, setNeedsVerificationCode] = useState(true);
  const [updatingLabel, setUpdatingLabel] = useState("メールアドレスを更新しています");
  const oldPrimaryRef = useRef<EmailAddressResource | null>(null);
  const targetRef = useRef<EmailAddressResource | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const cleanupResumeAttemptedRef = useRef(false);

  const clearAccountEmailChangeSession = () => {
    const clerkUserId = user?.id;
    setAccountEmailChangeSession((current) => (current && current.clerkUserId === clerkUserId ? null : current));
  };

  const clearAccountEmailCleanupSession = useCallback(() => {
    const clerkUserId = user?.id;
    setAccountEmailCleanupSession((current) => (current && current.clerkUserId === clerkUserId ? null : current));
  }, [setAccountEmailCleanupSession, user?.id]);

  const setPrimaryWithReverification = useReverification(async (emailAddressId: string) => {
    if (!user) throw new Error("Unauthenticated");
    return await user.update({ primaryEmailAddressId: emailAddressId });
  });
  const destroyEmailWithReverification = useReverification(async (emailAddress: EmailAddressResource) => {
    return await emailAddress.destroy();
  });

  const finishOldEmailCleanup = async () => {
    const oldPrimary = oldPrimaryRef.current;
    const target = targetRef.current;
    if (!user || !target) return false;
    if (!oldPrimary || oldPrimary.id === target.id) {
      clearAccountEmailCleanupSession();
      setStep("complete");
      return true;
    }
    setAccountEmailCleanupSession({
      clerkUserId: user.id,
      kind: "oldPrimary",
      emailAddressId: oldPrimary.id,
      primaryEmailAddressId: target.id,
    });
    try {
      await user.reload();
      if (!user.emailAddresses.some((emailAddress) => emailAddress.id === oldPrimary.id)) {
        clearAccountEmailCleanupSession();
        setStep("complete");
        return true;
      }
    } catch {
      // 削除操作を再試行できるため、resource再取得の一時失敗だけでは完了にしない。
    }
    try {
      const destroyed = await destroyEmailWithReverification(oldPrimary);
      if (destroyed === null) {
        setStep("cleanupFailed");
        return false;
      }
      await user.reload();
      clearAccountEmailCleanupSession();
      setStep("complete");
      return true;
    } catch (error) {
      try {
        await user.reload();
        if (!user.emailAddresses.some((emailAddress) => emailAddress.id === oldPrimary.id)) {
          clearAccountEmailCleanupSession();
          setStep("complete");
          return true;
        }
      } catch {
        // 削除済みと確認できない場合は必須の復旧状態を維持する。
      }
      if (!isReverificationCancelledError(error)) {
        setErrorMessage("以前のメールアドレスを削除できませんでした。もう一度お試しください。");
      }
      setStep("cleanupFailed");
      return false;
    }
  };

  const syncPrimaryAndCleanup = async () => {
    const requestId = requestIdRef.current;
    if (!requestId || !user) return false;
    let result: Awaited<ReturnType<typeof syncMyPrimaryEmail>>;
    try {
      result = await syncMyPrimaryEmail({ requestId });
    } catch {
      setStep("syncFailed");
      setErrorMessage("ログインメールは変更済みですが、シフトリ内の同期が完了していません。");
      return false;
    }
    if (result.status !== "synced") {
      setStep("syncFailed");
      setErrorMessage(
        result.status === "rateLimited"
          ? "操作回数が上限に達しました。時間をおいて同期を再試行するか、以前のメールへ戻してください。"
          : "ログインメールは変更済みですが、シフトリ内の同期が完了していません。",
      );
      return false;
    }
    const oldPrimary = oldPrimaryRef.current;
    const target = targetRef.current;
    if (oldPrimary && target && oldPrimary.id !== target.id) {
      setAccountEmailCleanupSession({
        clerkUserId: user.id,
        kind: "oldPrimary",
        emailAddressId: oldPrimary.id,
        primaryEmailAddressId: target.id,
      });
    }
    return await finishOldEmailCleanup();
  };

  const promoteVerifiedEmail = async () => {
    const target = targetRef.current;
    if (!user || !target) return false;
    setAccountEmailChangeSession({ clerkUserId: user.id, source });
    setErrorMessage(null);
    setInfoMessage(null);
    setUpdatingLabel("メールアドレスを更新しています");
    setStep("updating");
    try {
      const updated = await setPrimaryWithReverification(target.id);
      if (updated === null) {
        clearAccountEmailChangeSession();
        setStep("verify");
        return false;
      }
    } catch (error) {
      if (isReverificationCancelledError(error)) {
        clearAccountEmailChangeSession();
        setStep("verify");
        return false;
      }
      try {
        await user.reload();
      } catch {
        // primary化の成否は直後のresourceだけで判定し、error payloadは表示しない。
      }
      if (user.primaryEmailAddressId !== target.id) {
        clearAccountEmailChangeSession();
        setErrorMessage(getClerkErrorMessage(error));
        setStep("verify");
        return false;
      }
    }
    await user.reload();
    return await syncPrimaryAndCleanup();
  };

  const { run: start, isRunning: isStarting } = useSingleFlight(async (email: string) => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!isLoaded || !user?.primaryEmailAddress) {
      setErrorMessage("現在のログインメールを確認できません。画面を再読み込みしてください。");
      return false;
    }
    const parsed = requiredEmailSchema.safeParse(email);
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
      return false;
    }
    const targetEmail = normalizeEmail(parsed.data);
    if (targetEmail === normalizeEmail(user.primaryEmailAddress.emailAddress)) {
      setErrorMessage("現在とは異なるメールアドレスを入力してください。");
      return false;
    }
    try {
      await preflight({ email: targetEmail });
      await user.reload();
      oldPrimaryRef.current = user.primaryEmailAddress;
      requestIdRef.current = crypto.randomUUID();
      let target = user.emailAddresses.find(
        (emailAddress) => normalizeEmail(emailAddress.emailAddress) === targetEmail,
      );
      target ??= await user.createEmailAddress({ email: targetEmail });
      targetRef.current = target;
      setTargetMaskedEmail(maskEmailAddress(targetEmail));
      const isVerified = target.verification?.status === "verified";
      setNeedsVerificationCode(!isVerified);
      if (!isVerified) {
        await target.prepareVerification({ strategy: "email_code" });
      }
      setStep("verify");
      return true;
    } catch (error) {
      setErrorMessage(accountEmailErrorMessage(error));
      setStep("input");
      return false;
    }
  });

  const { run: verify, isRunning: isVerifying } = useSingleFlight(async (code?: string) => {
    const target = targetRef.current;
    if (!target) return false;
    setErrorMessage(null);
    if (needsVerificationCode) {
      if (!code?.trim()) {
        setErrorMessage("確認コードを入力してください。");
        return false;
      }
      try {
        const verified = await target.attemptVerification({ code: code.trim() });
        targetRef.current = verified;
        if (verified.verification?.status !== "verified") {
          setErrorMessage("新しいメールアドレスを確認できませんでした。");
          return false;
        }
        setNeedsVerificationCode(false);
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return false;
      }
    }
    return await promoteVerifiedEmail();
  });

  const { run: resendCode, isRunning: isResending } = useSingleFlight(async () => {
    const target = targetRef.current;
    if (!target) return false;
    try {
      await target.prepareVerification({ strategy: "email_code" });
      setErrorMessage(null);
      setInfoMessage("新しい確認コードを送りました。");
      return true;
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
      return false;
    }
  });

  const { run: retrySync, isRunning: isRetryingSync } = useSingleFlight(async () => {
    setErrorMessage(null);
    setUpdatingLabel("シフトリ内のメールを同期しています");
    setStep("updating");
    return await syncPrimaryAndCleanup();
  });

  const { run: retryCleanup, isRunning: isRetryingCleanup } = useSingleFlight(async () => {
    setErrorMessage(null);
    setUpdatingLabel("以前のメールアドレスを削除しています");
    setStep("updating");
    return await finishOldEmailCleanup();
  });

  const cleanupRolledBackTarget = async () => {
    const target = targetRef.current;
    if (!target || !user) return false;
    const oldPrimary = oldPrimaryRef.current;
    if (!oldPrimary || oldPrimary.id === target.id) {
      setErrorMessage("削除対象のメールアドレスを安全に確認できません。画面を再読み込みしてください。");
      setStep("rollbackCleanupFailed");
      return false;
    }
    setAccountEmailCleanupSession({
      clerkUserId: user.id,
      kind: "rolledBackTarget",
      emailAddressId: target.id,
      primaryEmailAddressId: oldPrimary.id,
    });
    try {
      await user.reload();
      if (!user.emailAddresses.some((emailAddress) => emailAddress.id === target.id)) {
        clearAccountEmailCleanupSession();
        setStep("rolledBack");
        return true;
      }
    } catch {
      // 削除操作を再試行できるため、resource再取得の一時失敗だけでは完了にしない。
    }
    try {
      const destroyed = await destroyEmailWithReverification(target);
      if (destroyed === null) {
        setStep("rollbackCleanupFailed");
        return false;
      }
      await user.reload();
      clearAccountEmailCleanupSession();
      setStep("rolledBack");
      return true;
    } catch (error) {
      try {
        await user.reload();
        if (!user.emailAddresses.some((emailAddress) => emailAddress.id === target.id)) {
          clearAccountEmailCleanupSession();
          setStep("rolledBack");
          return true;
        }
      } catch {
        // 削除済みと確認できない場合は必須の復旧状態を維持する。
      }
      if (!isReverificationCancelledError(error)) {
        setErrorMessage("追加したメールアドレスを削除できませんでした。もう一度お試しください。");
      }
      setStep("rollbackCleanupFailed");
      return false;
    }
  };

  const syncRolledBackPrimaryAndCleanup = async () => {
    const requestId = requestIdRef.current;
    if (!requestId) return false;
    try {
      const result = await syncMyPrimaryEmail({ requestId });
      if (result.status !== "synced") {
        setErrorMessage(
          result.status === "rateLimited"
            ? "操作回数が上限に達しました。時間をおいて同期を再試行してください。"
            : "以前のログインメールへ戻しましたが、シフトリ内の同期が完了していません。",
        );
        setStep("rollbackSyncFailed");
        return false;
      }
      return await cleanupRolledBackTarget();
    } catch {
      setErrorMessage("以前のログインメールへ戻しましたが、シフトリ内の同期が完了していません。");
      setStep("rollbackSyncFailed");
      return false;
    }
  };

  const { run: rollback, isRunning: isRollingBack } = useSingleFlight(async () => {
    const oldPrimary = oldPrimaryRef.current;
    if (!oldPrimary || !user) return false;
    setErrorMessage(null);
    setUpdatingLabel("以前のメールアドレスへ戻しています");
    setStep("updating");
    try {
      const updated = await setPrimaryWithReverification(oldPrimary.id);
      if (updated === null) {
        setStep("syncFailed");
        return false;
      }
      await user.reload();
    } catch (error) {
      if (isReverificationCancelledError(error)) {
        setStep("syncFailed");
        return false;
      }
      try {
        await user.reload();
      } catch {
        // primary化の成否は直後のresourceだけで判定し、error payloadは表示しない。
      }
      if (user.primaryEmailAddressId !== oldPrimary.id) {
        setErrorMessage(getClerkErrorMessage(error));
        setStep("syncFailed");
        return false;
      }
    }
    requestIdRef.current = crypto.randomUUID();
    return await syncRolledBackPrimaryAndCleanup();
  });

  const { run: retryRollbackSync, isRunning: isRetryingRollbackSync } = useSingleFlight(async () => {
    setErrorMessage(null);
    setUpdatingLabel("以前のメールアドレスをシフトリへ同期しています");
    setStep("updating");
    return await syncRolledBackPrimaryAndCleanup();
  });

  const { run: retryRollbackCleanup, isRunning: isRetryingRollbackCleanup } = useSingleFlight(cleanupRolledBackTarget);

  useEffect(() => {
    if (!resumeCleanup || cleanupResumeAttemptedRef.current || !isLoaded || !user) return;
    cleanupResumeAttemptedRef.current = true;

    if (!cleanupSession || cleanupSession.clerkUserId !== user.id) {
      setIsRestoringCleanup(false);
      setStep("input");
      return;
    }

    const storedEmailAddress = user.emailAddresses.find(
      (emailAddress) => emailAddress.id === cleanupSession.emailAddressId,
    );
    const currentPrimary = user.primaryEmailAddress;
    const hasExpectedPrimary =
      currentPrimary?.id === cleanupSession.primaryEmailAddressId &&
      user.primaryEmailAddressId === cleanupSession.primaryEmailAddressId;

    if (!storedEmailAddress) {
      clearAccountEmailCleanupSession();
      setStep(cleanupSession.kind === "rolledBackTarget" ? "rolledBack" : "complete");
      setIsRestoringCleanup(false);
      return;
    }

    if (!currentPrimary || !hasExpectedPrimary || storedEmailAddress.id === currentPrimary.id) {
      setErrorMessage(
        "メールアドレスの状態が変わったため、安全のため削除を停止しました。画面を再読み込みしてください。",
      );
      setStep(cleanupSession.kind === "rolledBackTarget" ? "rollbackCleanupFailed" : "cleanupFailed");
      setIsRestoringCleanup(false);
      return;
    }

    if (cleanupSession.kind === "rolledBackTarget") {
      oldPrimaryRef.current = currentPrimary;
      targetRef.current = storedEmailAddress;
      setTargetMaskedEmail(maskEmailAddress(storedEmailAddress.emailAddress));
      setStep("rollbackCleanupFailed");
    } else {
      oldPrimaryRef.current = storedEmailAddress;
      targetRef.current = currentPrimary;
      setTargetMaskedEmail(maskEmailAddress(storedEmailAddress.emailAddress));
      setStep("cleanupFailed");
    }
    setIsRestoringCleanup(false);
  }, [cleanupSession, clearAccountEmailCleanupSession, isLoaded, resumeCleanup, user]);

  const reset = () => {
    clearAccountEmailChangeSession();
    clearAccountEmailCleanupSession();
    setStep("input");
    setErrorMessage(null);
    setInfoMessage(null);
    setTargetMaskedEmail("");
    setNeedsVerificationCode(true);
    setUpdatingLabel("メールアドレスを更新しています");
    oldPrimaryRef.current = null;
    targetRef.current = null;
    requestIdRef.current = null;
  };

  return {
    step,
    currentEmail: user?.primaryEmailAddress?.emailAddress ?? null,
    targetMaskedEmail,
    needsVerificationCode,
    updatingLabel,
    errorMessage,
    infoMessage,
    isBusy:
      isStarting ||
      isVerifying ||
      isResending ||
      isRetryingSync ||
      isRetryingCleanup ||
      isRollingBack ||
      isRetryingRollbackSync ||
      isRetryingRollbackCleanup ||
      isRestoringCleanup,
    start,
    verify,
    resendCode,
    retrySync,
    retryCleanup,
    rollback,
    retryRollbackSync,
    retryRollbackCleanup,
    backToInput: () => {
      setErrorMessage(null);
      setInfoMessage(null);
      setStep("input");
    },
    reset,
  };
}

function accountEmailErrorMessage(error: unknown): string {
  if (isClerkErrorPayload(error)) return getClerkErrorMessage(error);
  const data =
    error && typeof error === "object" && "data" in error && typeof error.data === "string"
      ? error.data
      : error instanceof Error
        ? error.message
        : undefined;
  return getUserFacingErrorMessage(data);
}

function isClerkErrorPayload(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("errors" in error && Array.isArray(error.errors)) return true;
  return "code" in error && typeof error.code === "string";
}
