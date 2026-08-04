import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { UserResource } from "@clerk/shared/types";
import { useEffect, useRef, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import {
  deriveGoogleReplacementPhase,
  type GoogleReplacementCapabilityInput,
  hasEffectiveGoogleReplacementCapability,
  hasSafeEmailPasswordFallback,
} from "./migrationScript";
import type {
  GoogleReplacementPhase,
  LoginMethodMigrationFeedback,
  LoginMethodOperationRunner,
  LoginMethodReverificationHandler,
} from "./migrationTypes";
import {
  type EmailPasswordMigrationController,
  useEmailPasswordMigrationController,
} from "./useEmailPasswordMigrationController";
import { type GoogleConnectionController, useGoogleConnectionController } from "./useGoogleConnectionController";

export type GoogleReplacementState = {
  phase: GoogleReplacementPhase;
  oldGoogleAccountId: string | null;
  feedback: LoginMethodMigrationFeedback;
};

export type GoogleReplacementController = {
  state: GoogleReplacementState;
  fallback: EmailPasswordMigrationController;
  newGoogle: GoogleConnectionController;
  refresh: () => Promise<boolean | undefined>;
  removeOldGoogle: () => Promise<boolean | undefined>;
  startNewGoogle: () => Promise<boolean | undefined>;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  capabilities: GoogleReplacementCapabilityInput;
  oauthReturn: boolean;
  onOAuthReturnHandled?: () => void;
  onNeedsReverification: LoginMethodReverificationHandler;
  runOperation: LoginMethodOperationRunner;
  navigateToExternalVerification?: (url: string) => void;
};

const IDLE_FEEDBACK: LoginMethodMigrationFeedback = { status: "idle", message: null };

export function useGoogleReplacementController({
  isLoaded,
  user,
  capabilities,
  oauthReturn,
  onOAuthReturnHandled,
  onNeedsReverification,
  runOperation,
  navigateToExternalVerification,
}: Options): GoogleReplacementController {
  const enabled = hasEffectiveGoogleReplacementCapability(capabilities);
  const initializedUserIdRef = useRef<string | null>(user && enabled ? user.id : null);
  const [oldGoogleAccountId, setOldGoogleAccountId] = useState<string | null>(() =>
    oauthReturn ? null : (findSingleVerifiedGoogle(user)?.id ?? null),
  );
  const [phaseOverride, setPhaseOverride] = useState<GoogleReplacementPhase | null>(null);
  const [feedback, setFeedback] = useState<LoginMethodMigrationFeedback>(IDLE_FEEDBACK);

  useEffect(() => {
    if (!enabled) {
      initializedUserIdRef.current = null;
      return;
    }
    if (!isLoaded || !user || initializedUserIdRef.current === user.id) return;
    initializedUserIdRef.current = user.id;
    setOldGoogleAccountId(oauthReturn ? null : (findSingleVerifiedGoogle(user)?.id ?? null));
    setPhaseOverride(null);
    setFeedback(IDLE_FEEDBACK);
  }, [enabled, isLoaded, oauthReturn, user]);

  const fallback = useEmailPasswordMigrationController({
    isLoaded,
    user,
    enabled,
    purpose: "ensure-unlinked-fallback",
    onNeedsReverification,
    runOperation,
  });
  const newGoogle = useGoogleConnectionController({
    isLoaded,
    user,
    enabled,
    flow: "replace-google",
    oauthReturn,
    onOAuthReturnHandled,
    onNeedsReverification,
    runOperation,
    navigateToExternalVerification,
  });

  const reloadUser = async () => {
    if (!isLoaded || !user) throw new Error("Unauthenticated");
    await user.reload();
    return user;
  };

  const destroyOldGoogleWithReverification = useReverification(
    async (externalAccountId: string) => {
      const currentUser = await reloadUser();
      const snapshot = toLoginMethodsUserSnapshot(currentUser);
      if (!hasEffectiveGoogleReplacementCapability(capabilities) || !hasSafeEmailPasswordFallback(snapshot)) {
        return "unavailable" as const;
      }
      const target = findSingleVerifiedGoogle(currentUser);
      if (!target) return "alreadyRemoved" as const;
      if (target.id !== externalAccountId) return "unavailable" as const;
      await target.destroy();
      return "removed" as const;
    },
    { onNeedsReverification },
  );

  const withOperationLock =
    <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Promise<Result>) =>
    (...args: Arguments) =>
      runOperation(() => operation(...args));

  const { run: refresh } = useSingleFlight(
    withOperationLock(async () => {
      setFeedback({ status: "loading", message: null });
      try {
        const currentUser = await reloadUser();
        const snapshot = toLoginMethodsUserSnapshot(currentUser);
        const nextPhase = deriveGoogleReplacementPhase(snapshot, capabilities, oldGoogleAccountId);
        setPhaseOverride(null);
        setFeedback({
          status: nextPhase === "unavailable" ? "error" : "success",
          message:
            nextPhase === "unavailable"
              ? "Googleアカウントの変更は現在利用できません。"
              : "最新のログイン方法を確認しました。",
        });
        return nextPhase !== "unavailable";
      } catch {
        setPhaseOverride("unavailable");
        setFeedback({ status: "error", message: "ログイン方法を確認できませんでした。画面を再読み込みしてください。" });
        return false;
      }
    }),
  );

  const { run: runRemoveOldGoogle } = useSingleFlight(
    withOperationLock(async () => {
      setPhaseOverride("removingOldGoogle");
      setFeedback({ status: "loading", message: null });
      const targetId = oldGoogleAccountId;
      if (!targetId) {
        setPhaseOverride(null);
        setFeedback({ status: "error", message: "解除するGoogleアカウントを確認できません。" });
        return false;
      }
      try {
        let currentUser = await reloadUser();
        const snapshot = toLoginMethodsUserSnapshot(currentUser);
        if (
          deriveGoogleReplacementPhase(snapshot, capabilities, targetId) !== "fallbackReady" ||
          !hasSafeEmailPasswordFallback(snapshot)
        ) {
          setPhaseOverride(null);
          setFeedback({ status: "error", message: "退避用のメールアドレスとパスワードを確認できません。" });
          return false;
        }
        const result = await destroyOldGoogleWithReverification(targetId);
        if (result == null || result === "unavailable") {
          setPhaseOverride(null);
          setFeedback({ status: "error", message: "Googleを解除していません。最新の状態を確認してください。" });
          return false;
        }
        currentUser = await reloadUser();
        const latestSnapshot = toLoginMethodsUserSnapshot(currentUser);
        if (
          !hasSafeEmailPasswordFallback(latestSnapshot) ||
          deriveGoogleReplacementPhase(latestSnapshot, capabilities, targetId) !== "connectingNewGoogle"
        ) {
          setPhaseOverride(null);
          setFeedback({ status: "error", message: "Google解除後のログイン方法を確認できません。" });
          return false;
        }
        setPhaseOverride(null);
        setFeedback({
          status: "success",
          message: "以前のGoogleを解除しました。メールアドレスとパスワードでログインできる状態は維持しています。",
        });
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setPhaseOverride(null);
          setFeedback(IDLE_FEEDBACK);
          return false;
        }
        try {
          const currentUser = await reloadUser();
          if (
            deriveGoogleReplacementPhase(toLoginMethodsUserSnapshot(currentUser), capabilities, targetId) ===
            "connectingNewGoogle"
          ) {
            setPhaseOverride(null);
            setFeedback({
              status: "success",
              message: "以前のGoogleを解除しました。続けて新しいGoogleを選択してください。",
            });
            return true;
          }
        } catch {
          // destroyの応答喪失後もresourceを確認できなければ、解除済みと断定しない。
        }
        setPhaseOverride(null);
        setFeedback({ status: "error", message: "Googleを解除したか確認できません。最新の状態を確認してください。" });
        return false;
      }
    }),
  );

  const removeOldGoogle = async () => {
    const result = await runRemoveOldGoogle();
    if (result === true) await newGoogle.refresh();
    return result;
  };

  const startNewGoogle = async () => {
    if (
      !user ||
      deriveGoogleReplacementPhase(toLoginMethodsUserSnapshot(user), capabilities, oldGoogleAccountId) !==
        "connectingNewGoogle"
    ) {
      setFeedback({ status: "error", message: "以前のGoogleを解除し、退避方法を確認してから続けてください。" });
      return false;
    }
    return newGoogle.start();
  };

  const derivedPhase = user
    ? deriveGoogleReplacementPhase(toLoginMethodsUserSnapshot(user), capabilities, oldGoogleAccountId)
    : "unavailable";
  const phase = phaseOverride ?? derivedPhase;
  const effectiveFeedback =
    phase === "unavailable" && oauthReturn
      ? {
          status: "error" as const,
          message:
            "Googleアカウントの変更結果を確認できませんでした。退避用のログイン方法は削除していません。最新の状態を確認してください。",
        }
      : phase === "newGoogleReady" && newGoogle.state.feedback.status === "success"
        ? newGoogle.state.feedback
        : phase === "ensuringFallback" && fallback.state.feedback.status !== "idle"
          ? fallback.state.feedback
          : feedback;

  return {
    state: { phase, oldGoogleAccountId, feedback: effectiveFeedback },
    fallback,
    newGoogle,
    refresh,
    removeOldGoogle,
    startNewGoogle,
  };
}

function findSingleVerifiedGoogle(user: UserResource | null | undefined) {
  const googleAccounts = user?.externalAccounts.filter((account) => account.provider === "google") ?? [];
  if (googleAccounts.length !== 1 || googleAccounts[0]?.verification?.status !== "verified") return undefined;
  return googleAccounts[0];
}
