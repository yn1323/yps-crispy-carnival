import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource, UserResource } from "@clerk/shared/types";
import { useEffect, useRef, useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import { getLoginMethodAccountErrorMessage } from "./loginMethodErrorPresentation";
import { deriveEmailPasswordMigration, hasSafeEmailPasswordFallback } from "./migrationScript";
import type {
  EmailPasswordMigrationPhase,
  EmailPasswordMigrationPurpose,
  LoginMethodMigrationFeedback,
  LoginMethodOperationRunner,
  LoginMethodReverificationHandler,
} from "./migrationTypes";

export type EmailPasswordMigrationState = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
  targetMaskedEmail: string | null;
  safeForGoogleDisconnect: boolean;
  feedback: LoginMethodMigrationFeedback;
};

export type EmailPasswordMigrationController = {
  state: EmailPasswordMigrationState;
  refresh: () => Promise<boolean | undefined>;
  useCurrentEmail: () => Promise<boolean | undefined>;
  useDifferentEmail: (email: string) => Promise<boolean | undefined>;
  verifyEmail: (code: string) => Promise<boolean | undefined>;
  resendEmailCode: () => Promise<boolean | undefined>;
  setPassword: (values: { newPassword: string; signOutOfOtherSessions: boolean }) => Promise<boolean | undefined>;
  reset: () => void;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  enabled: boolean;
  purpose?: EmailPasswordMigrationPurpose;
  onNeedsReverification: LoginMethodReverificationHandler;
  runOperation: LoginMethodOperationRunner;
};

const IDLE_FEEDBACK: LoginMethodMigrationFeedback = { status: "idle", message: null };

export function useEmailPasswordMigrationController({
  isLoaded,
  user,
  enabled,
  purpose = "add-email-password",
  onNeedsReverification,
  runOperation,
}: Options): EmailPasswordMigrationController {
  const initializedForRef = useRef<{ userId: string; purpose: EmailPasswordMigrationPurpose } | null>(
    user && enabled ? { userId: user.id, purpose } : null,
  );
  const [state, setState] = useState<EmailPasswordMigrationState>(() =>
    user && enabled ? stateFromUser(user, purpose) : unavailableState(),
  );

  useEffect(() => {
    if (!enabled) {
      initializedForRef.current = null;
      setState(unavailableState());
      return;
    }
    if (!isLoaded || !user) return;
    const initializedFor = initializedForRef.current;
    if (initializedFor?.userId === user.id && initializedFor?.purpose === purpose) return;
    initializedForRef.current = { userId: user.id, purpose };
    setState(stateFromUser(user, purpose));
  }, [enabled, isLoaded, purpose, user]);

  const reloadUser = async () => {
    if (!isLoaded || !user) throw new Error("Unauthenticated");
    await user.reload();
    return user;
  };

  const ensureEmailAddressWithReverification = useReverification(
    async (normalizedEmail: string) => {
      const currentUser = await reloadUser();
      if (!enabled) return { status: "unavailable" } as const;
      const existing = findEmailAddress(currentUser, null, normalizedEmail);
      if (existing) return { status: "ready", emailAddressId: existing.id } as const;
      const created = await currentUser.createEmailAddress({ email: normalizedEmail });
      return { status: "ready", emailAddressId: created.id } as const;
    },
    { onNeedsReverification },
  );

  const setPasswordWithReverification = useReverification(
    async ({
      targetEmailAddressId,
      newPassword,
      signOutOfOtherSessions,
    }: {
      targetEmailAddressId: string;
      newPassword: string;
      signOutOfOtherSessions: boolean;
    }) => {
      const currentUser = await reloadUser();
      if (!enabled) return "unavailable" as const;
      const target = findEmailAddress(currentUser, targetEmailAddressId);
      if (!isAllowedVerifiedTarget(target, purpose)) return "unavailable" as const;
      if (currentUser.passwordEnabled) return "alreadyReady" as const;
      await currentUser.updatePassword({ newPassword, signOutOfOtherSessions });
      return "updated" as const;
    },
    { onNeedsReverification },
  );

  const syncFromUser = (
    currentUser: UserResource,
    feedback: LoginMethodMigrationFeedback,
    targetId?: string | null,
  ) => {
    const next = stateFromUser(currentUser, purpose, targetId === undefined ? state.targetEmailAddressId : targetId);
    setState({ ...next, feedback });
    return next;
  };

  const withOperationLock =
    <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Promise<Result>) =>
    (...args: Arguments) =>
      runOperation(() => operation(...args));

  const { run: refresh } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      try {
        const currentUser = await reloadUser();
        if (!enabled) {
          setState(unavailableState("この変更は現在利用できません。"));
          return false;
        }
        syncFromUser(currentUser, { status: "success", message: "最新のログイン方法を確認しました。" });
        return true;
      } catch {
        setState(unavailableState("ログイン方法を確認できませんでした。画面を再読み込みしてください。"));
        return false;
      }
    }),
  );

  const advanceWithEmail = async (currentUser: UserResource, target: EmailAddressResource) => {
    if (!isAllowedTarget(target, purpose)) {
      setState((current) => ({
        ...current,
        feedback: {
          status: "error",
          message: "Googleと接続していない別のメールアドレスを使用してください。",
        },
      }));
      return false;
    }

    if (target.verification?.status !== "verified") {
      await target.prepareVerification({ strategy: "email_code" });
      syncFromUser(currentUser, { status: "success", message: "確認コードを送信しました。" }, target.id);
      return true;
    }

    syncFromUser(
      currentUser,
      {
        status: "success",
        message: currentUser.passwordEnabled
          ? "メールアドレスとパスワードを利用できます。"
          : "メールアドレスは確認済みです。続けてパスワードを設定してください。",
      },
      target.id,
    );
    return true;
  };

  const { run: useCurrentEmail } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      try {
        const currentUser = await reloadUser();
        if (!enabled) {
          setState(unavailableState("この変更は現在利用できません。"));
          return false;
        }
        const target =
          purpose === "ensure-unlinked-fallback"
            ? currentUser.emailAddresses.find(isVerifiedUnlinkedEmail)
            : (currentUser.emailAddresses.find(
                (emailAddress) =>
                  emailAddress.id === currentUser.primaryEmailAddressId &&
                  emailAddress.verification?.status === "verified",
              ) ?? currentUser.emailAddresses.find((emailAddress) => emailAddress.verification?.status === "verified"));
        if (!target) {
          setState((current) => ({
            ...current,
            feedback: { status: "error", message: "利用できるメールアドレスを確認できません。" },
          }));
          return false;
        }
        return advanceWithEmail(currentUser, target);
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setState((current) => ({ ...current, feedback: IDLE_FEEDBACK }));
          return false;
        }
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  const { run: useDifferentEmail } = useSingleFlight(
    withOperationLock(async (email: string) => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      const parsed = requiredEmailSchema.safeParse(email);
      if (!parsed.success) {
        setState((current) => ({
          ...current,
          feedback: {
            status: "error",
            message: parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。",
          },
        }));
        return false;
      }

      const normalizedEmail = normalizeEmail(parsed.data);
      let ensuredId: string | null = null;
      try {
        let currentUser = await reloadUser();
        if (!enabled) {
          setState(unavailableState("この変更は現在利用できません。"));
          return false;
        }
        let target = findEmailAddress(currentUser, null, normalizedEmail);
        if (!target) {
          const ensured = await ensureEmailAddressWithReverification(normalizedEmail);
          if (ensured == null || ensured.status === "unavailable") {
            setState((current) => ({
              ...current,
              feedback: { status: "error", message: "メールアドレスを追加できません。最新の状態を確認してください。" },
            }));
            return false;
          }
          ensuredId = ensured.emailAddressId;
          currentUser = await reloadUser();
          target = findEmailAddress(currentUser, ensuredId, normalizedEmail);
        }
        if (!target) {
          setState((current) => ({
            ...current,
            feedback: { status: "error", message: "追加したメールアドレスを確認できません。" },
          }));
          return false;
        }
        ensuredId = target.id;
        return await advanceWithEmail(currentUser, target);
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setState((current) => ({ ...current, feedback: IDLE_FEEDBACK }));
          return false;
        }
        try {
          const currentUser = await reloadUser();
          const recovered = findEmailAddress(currentUser, ensuredId, normalizedEmail);
          if (recovered) {
            if (recovered.verification?.status !== "verified") {
              syncFromUser(
                currentUser,
                {
                  status: "error",
                  message: "確認コードの送信結果を確認できません。必要な場合は再送してください。",
                },
                recovered.id,
              );
              return false;
            }
            return advanceWithEmail(currentUser, recovered);
          }
        } catch {
          // 応答喪失時もprovider errorを露出せず、最新resourceからだけ復旧する。
        }
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  const { run: verifyEmail } = useSingleFlight(
    withOperationLock(async (code: string) => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      if (!code.trim()) {
        setState((current) => ({
          ...current,
          feedback: { status: "error", message: "確認コードを入力してください。" },
        }));
        return false;
      }
      try {
        let currentUser = await reloadUser();
        const target = findEmailAddress(currentUser, state.targetEmailAddressId);
        if (!enabled || !target || !isAllowedTarget(target, purpose)) {
          setState(unavailableState("確認中のメールアドレスを取得できません。最新の状態を確認してください。"));
          return false;
        }
        if (target.verification?.status !== "verified") await target.attemptVerification({ code: code.trim() });
        currentUser = await reloadUser();
        const verified = findEmailAddress(currentUser, target.id);
        if (!isAllowedVerifiedTarget(verified, purpose)) {
          setState((current) => ({
            ...current,
            feedback: { status: "error", message: "メールアドレスを確認できませんでした。もう一度お試しください。" },
          }));
          return false;
        }
        syncFromUser(currentUser, { status: "success", message: "メールアドレスを確認しました。" }, verified.id);
        return true;
      } catch (error) {
        try {
          const currentUser = await reloadUser();
          const recovered = findEmailAddress(currentUser, state.targetEmailAddressId);
          if (isAllowedVerifiedTarget(recovered, purpose)) {
            syncFromUser(currentUser, { status: "success", message: "メールアドレスを確認しました。" }, recovered.id);
            return true;
          }
        } catch {
          // 応答喪失時の再取得も失敗した場合は、安全側のerrorへ収束する。
        }
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  const { run: resendEmailCode } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      try {
        const currentUser = await reloadUser();
        const target = findEmailAddress(currentUser, state.targetEmailAddressId);
        if (!enabled || !target || !isAllowedTarget(target, purpose) || target.verification?.status === "verified") {
          syncFromUser(currentUser, { status: "error", message: "確認コードを再送できません。" });
          return false;
        }
        await target.prepareVerification({ strategy: "email_code" });
        syncFromUser(currentUser, { status: "success", message: "新しい確認コードを送りました。" }, target.id);
        return true;
      } catch (error) {
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  const { run: setPassword } = useSingleFlight(
    withOperationLock(
      async ({ newPassword, signOutOfOtherSessions }: { newPassword: string; signOutOfOtherSessions: boolean }) => {
        setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
        let targetId = state.targetEmailAddressId;
        try {
          let currentUser = await reloadUser();
          const target = findEmailAddress(currentUser, targetId);
          if (!enabled || !target || !isAllowedVerifiedTarget(target, purpose)) {
            setState(unavailableState("確認済みのメールアドレスを取得できません。最新の状態を確認してください。"));
            return false;
          }
          targetId = target.id;
          const result = await setPasswordWithReverification({
            targetEmailAddressId: target.id,
            newPassword,
            signOutOfOtherSessions,
          });
          if (result == null || result === "unavailable") {
            setState((current) => ({
              ...current,
              feedback: { status: "error", message: "パスワードを設定できません。最新の状態を確認してください。" },
            }));
            return false;
          }
          currentUser = await reloadUser();
          if (!currentUser.passwordEnabled) {
            setState((current) => ({
              ...current,
              feedback: { status: "error", message: "パスワードの設定結果を確認できません。" },
            }));
            return false;
          }
          syncFromUser(
            currentUser,
            { status: "success", message: "メールアドレスとパスワードを設定しました。Googleは解除していません。" },
            target.id,
          );
          return true;
        } catch (error) {
          if (isReverificationCancelledError(error)) {
            setState((current) => ({ ...current, feedback: IDLE_FEEDBACK }));
            return false;
          }
          try {
            const currentUser = await reloadUser();
            if (
              currentUser.passwordEnabled &&
              isAllowedVerifiedTarget(findEmailAddress(currentUser, targetId), purpose)
            ) {
              syncFromUser(
                currentUser,
                { status: "success", message: "メールアドレスとパスワードを設定しました。Googleは解除していません。" },
                targetId,
              );
              return true;
            }
          } catch {
            // 応答喪失後の状態が不明なら完了扱いにしない。
          }
          setState((current) => ({ ...current, feedback: errorFeedback(error) }));
          return false;
        }
      },
    ),
  );

  return {
    state,
    refresh,
    useCurrentEmail,
    useDifferentEmail,
    verifyEmail,
    resendEmailCode,
    setPassword,
    reset: () => setState(user && enabled ? stateFromUser(user, purpose) : unavailableState()),
  };
}

function stateFromUser(
  user: UserResource,
  purpose: EmailPasswordMigrationPurpose,
  targetEmailAddressId: string | null = null,
): EmailPasswordMigrationState {
  const snapshot = toLoginMethodsUserSnapshot(user);
  const derived = deriveEmailPasswordMigration(snapshot, purpose, targetEmailAddressId);
  const target = derived.targetEmailAddressId
    ? user.emailAddresses.find((emailAddress) => emailAddress.id === derived.targetEmailAddressId)
    : undefined;
  return {
    ...derived,
    targetMaskedEmail: target ? maskEmailAddress(target.emailAddress) : null,
    safeForGoogleDisconnect: hasSafeEmailPasswordFallback(snapshot),
    feedback: IDLE_FEEDBACK,
  };
}

function unavailableState(message: string | null = null): EmailPasswordMigrationState {
  return {
    phase: "unavailable",
    targetEmailAddressId: null,
    targetMaskedEmail: null,
    safeForGoogleDisconnect: false,
    feedback: { status: message ? "error" : "idle", message },
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

function isVerifiedUnlinkedEmail(emailAddress: EmailAddressResource) {
  return emailAddress.verification?.status === "verified" && emailAddress.linkedTo.length === 0;
}

function isAllowedTarget(
  emailAddress: EmailAddressResource | undefined,
  purpose: EmailPasswordMigrationPurpose,
): emailAddress is EmailAddressResource {
  if (!emailAddress) return false;
  return purpose !== "ensure-unlinked-fallback" || emailAddress.linkedTo.length === 0;
}

function isAllowedVerifiedTarget(
  emailAddress: EmailAddressResource | undefined,
  purpose: EmailPasswordMigrationPurpose,
): emailAddress is EmailAddressResource {
  return isAllowedTarget(emailAddress, purpose) && emailAddress.verification?.status === "verified";
}

function errorFeedback(error: unknown): LoginMethodMigrationFeedback {
  return { status: "error", message: getLoginMethodAccountErrorMessage(error) };
}
