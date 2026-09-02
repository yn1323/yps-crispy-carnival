import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource, UserResource } from "@clerk/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import {
  findLoginEmailAddress,
  getGoogleExternalAccountStateKeys,
  haveSameStringValues,
  isVerifiedLoginEmailAddress,
} from "./clerkLoginMethodResource";
import { emailVerificationCooldownMessage, getLoginMethodAccountErrorMessage } from "./loginMethodErrorPresentation";
import { deriveEmailPasswordMigration } from "./migrationScript";
import type {
  EmailPasswordMigrationPhase,
  LoginMethodMigrationFeedback,
  LoginMethodOperationRunner,
  LoginMethodReverificationHandler,
} from "./migrationTypes";
import {
  createLoginMethodOperationCooldown,
  emailVerificationCooldownScope,
  type LoginMethodOperationCooldown,
} from "./operationCooldown";
import { reloadActorUser } from "./reloadActorUser";
import type { LoginMethodOperationOptions } from "./reverificationTypes";

export type EmailPasswordMigrationState = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
  targetEmailAddress: string | null;
  feedback: LoginMethodMigrationFeedback;
};

export type EmailPasswordMigrationController = {
  state: EmailPasswordMigrationState;
  refresh: () => Promise<boolean | undefined>;
  useDifferentEmail: (email: string) => Promise<boolean | undefined>;
  verifyEmail: (code: string) => Promise<boolean | undefined>;
  resendEmailCode: () => Promise<boolean | undefined>;
  setPassword: (newPassword: string) => Promise<boolean | undefined>;
  reset: () => void;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  getCurrentActorId: () => string | null;
  active?: boolean;
  onNeedsReverification: LoginMethodReverificationHandler;
  runOperation: LoginMethodOperationRunner;
  operationCooldown?: LoginMethodOperationCooldown;
};

type EmailPasswordMigrationPlan = {
  actorUserId: string;
  initialPrimaryEmailAddressId: string | null;
  googleAccounts: string[];
  googleEmailAddresses: string[];
  targetEmailAddressId: string | null;
  primaryUpdateStarted: boolean;
  primaryPrepared: boolean;
  passwordUpdateStarted: boolean;
};

const IDLE_FEEDBACK: LoginMethodMigrationFeedback = { status: "idle", message: null };
const EMAIL_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "email_code",
};

export function useEmailPasswordMigrationController({
  isLoaded,
  user,
  getCurrentActorId,
  active = true,
  onNeedsReverification,
  runOperation,
  operationCooldown,
}: Options): EmailPasswordMigrationController {
  const actorUserId = user?.id ?? null;
  const userRef = useRef(user);
  userRef.current = user;
  const localOperationCooldown = useMemo(() => createLoginMethodOperationCooldown(), []);
  const retryCooldown = operationCooldown ?? localOperationCooldown;
  const wasActiveRef = useRef(active);
  const initializedForRef = useRef<string | null>(user?.id ?? null);
  const migrationPlanRef = useRef<EmailPasswordMigrationPlan | null>(null);
  const [state, setState] = useState<EmailPasswordMigrationState>(() =>
    user ? stateFromUser(user) : unavailableState(),
  );

  useEffect(() => {
    if (!isLoaded || !user) return;
    if (initializedForRef.current === user.id) return;
    initializedForRef.current = user.id;
    migrationPlanRef.current = null;
    setState(stateFromUser(user));
  }, [isLoaded, user]);

  const isActivating = active && !wasActiveRef.current;

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    const becameInactive = !active && wasActiveRef.current;
    wasActiveRef.current = active;
    const currentUser = userRef.current;
    if (!isLoaded || !currentUser || currentUser.id !== actorUserId) return;

    if (becameInactive) {
      migrationPlanRef.current = null;
      setState(stateFromUser(currentUser));
      return;
    }
    if (!becameActive) return;

    migrationPlanRef.current = null;
    let cancelled = false;
    const activatingUserId = currentUser.id;
    setState(loadingState());
    void reloadActorUser({
      isLoaded,
      user: currentUser,
      actorUserId: activatingUserId,
      getCurrentActorId,
    })
      .then(() => {
        const latestUser = userRef.current;
        if (!cancelled && getCurrentActorId() === activatingUserId && latestUser?.id === activatingUserId) {
          setState(stateFromUser(latestUser));
        }
      })
      .catch(() => {
        if (!cancelled && getCurrentActorId() === activatingUserId) {
          setState(unavailableState("ログイン方法を確認できませんでした。画面を再読み込みしてください。"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, actorUserId, getCurrentActorId, isLoaded]);

  const reloadUser = () => reloadActorUser({ isLoaded, user, actorUserId, getCurrentActorId });

  const ensureEmailAddressWithReverification = useReverification(
    async ({ normalizedEmail, plan }: { normalizedEmail: string; plan: EmailPasswordMigrationPlan }) => {
      const currentUser = await reloadUser();
      if (!emailPasswordMigrationReadyForEmailSelection(currentUser, plan)) {
        return { status: "unavailable" } as const;
      }
      const existing = findLoginEmailAddress(currentUser, null, normalizedEmail);
      if (existing) return { status: "ready", emailAddressId: existing.id } as const;
      const created = await currentUser.createEmailAddress({ email: normalizedEmail });
      return { status: "ready", emailAddressId: created.id } as const;
    },
    { onNeedsReverification },
  );

  const updatePrimaryEmailWithReverification = useReverification(
    async ({ targetEmailAddressId, plan }: { targetEmailAddressId: string; plan: EmailPasswordMigrationPlan }) => {
      const currentUser = await reloadUser();
      const target = findLoginEmailAddress(currentUser, targetEmailAddressId);
      if (
        !isVerifiedLoginEmailAddress(target) ||
        plan.targetEmailAddressId !== target.id ||
        !emailPasswordMigrationReadyForPrimaryUpdate(currentUser, plan)
      ) {
        return "unavailable" as const;
      }
      if (currentUser.primaryEmailAddressId === target.id) {
        plan.primaryUpdateStarted = false;
        return "unavailable" as const;
      }
      plan.primaryUpdateStarted = true;
      await currentUser.update({ primaryEmailAddressId: target.id });
      return "updated" as const;
    },
    { onNeedsReverification },
  );

  const setPasswordWithReverification = useReverification(
    async ({
      targetEmailAddressId,
      newPassword,
      plan,
    }: {
      targetEmailAddressId: string;
      newPassword: string;
      plan: EmailPasswordMigrationPlan;
    }) => {
      const currentUser = await reloadUser();
      const target = findLoginEmailAddress(currentUser, targetEmailAddressId);
      if (
        !isVerifiedLoginEmailAddress(target) ||
        plan.targetEmailAddressId !== target.id ||
        !plan.primaryPrepared ||
        !emailPasswordMigrationTargetPrimaryMatches(currentUser, plan)
      ) {
        return "unavailable" as const;
      }
      if (currentUser.passwordEnabled) {
        plan.passwordUpdateStarted = false;
        return "unavailable" as const;
      }
      plan.passwordUpdateStarted = true;
      await currentUser.updatePassword({ newPassword, signOutOfOtherSessions: false });
      return "updated" as const;
    },
    { onNeedsReverification },
  );

  const syncFromUser = (
    currentUser: UserResource,
    feedback: LoginMethodMigrationFeedback,
    targetId?: string | null,
  ) => {
    const next = stateFromUser(currentUser, targetId === undefined ? state.targetEmailAddressId : targetId);
    setState({ ...next, feedback });
    return next;
  };

  const withOperationLock =
    <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Promise<Result>) =>
    (...args: Arguments) =>
      runOperation(() => operation(...args), EMAIL_REVERIFICATION_OPTIONS);

  const { run: refresh } = useSingleFlight(
    withOperationLock(async () => {
      migrationPlanRef.current = null;
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      try {
        const currentUser = await reloadUser();
        syncFromUser(currentUser, { status: "success", message: "最新のログイン方法を確認しました。" });
        return true;
      } catch {
        setState(unavailableState("ログイン方法を確認できませんでした。画面を再読み込みしてください。"));
        return false;
      }
    }),
  );

  const advanceWithEmail = async (
    currentUser: UserResource,
    target: EmailAddressResource,
    plan: EmailPasswordMigrationPlan,
  ) => {
    if (plan.targetEmailAddressId !== target.id || !emailPasswordMigrationReadyForEmailSelection(currentUser, plan)) {
      setState((current) => ({
        ...current,
        feedback: { status: "error", message: "ログイン方法の状態が変わりました。最新の状態を確認してください。" },
      }));
      return false;
    }
    if (target.verification?.status !== "verified") {
      const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
      if (!cooldown.allowed) {
        syncFromUser(
          currentUser,
          { status: "error", message: emailVerificationCooldownMessage(cooldown.retryAfterSeconds) },
          target.id,
        );
        return false;
      }
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
      let plan = migrationPlanRef.current;
      try {
        let currentUser = await reloadUser();
        plan ??= createEmailPasswordMigrationPlan(currentUser, actorUserId);
        if (!plan || !emailPasswordMigrationReadyForEmailSelection(currentUser, plan)) {
          setState((current) => ({
            ...current,
            feedback: {
              status: "error",
              message: "ログイン方法の状態が変わりました。最新の状態を確認してください。",
            },
          }));
          return false;
        }
        migrationPlanRef.current = plan;
        let target = findLoginEmailAddress(currentUser, null, normalizedEmail);
        if (!target) {
          const ensured = await ensureEmailAddressWithReverification({ normalizedEmail, plan });
          if (ensured == null) {
            setState((current) => ({
              ...current,
              feedback: { status: "error", message: "メールアドレスを追加できません。最新の状態を確認してください。" },
            }));
            return false;
          }
          if (ensured.status === "unavailable") {
            setState((current) => ({
              ...current,
              feedback: {
                status: "error",
                message: "ログイン方法の状態が変わりました。最新の状態を確認してください。",
              },
            }));
            return false;
          }
          ensuredId = ensured.emailAddressId;
          currentUser = await reloadUser();
          target = findLoginEmailAddress(currentUser, ensuredId, normalizedEmail);
        }
        if (!target) {
          setState((current) => ({
            ...current,
            feedback: { status: "error", message: "追加したメールアドレスを確認できません。" },
          }));
          return false;
        }
        ensuredId = target.id;
        plan.targetEmailAddressId = target.id;
        return await advanceWithEmail(currentUser, target, plan);
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          if (plan) {
            if (!plan.primaryPrepared) plan.primaryUpdateStarted = false;
            plan.passwordUpdateStarted = false;
          }
          setState((current) => ({ ...current, feedback: IDLE_FEEDBACK }));
          return false;
        }
        try {
          const currentUser = await reloadUser();
          const recovered = findLoginEmailAddress(currentUser, ensuredId, normalizedEmail);
          if (plan && recovered) {
            plan.targetEmailAddressId = recovered.id;
            if (recovered.verification?.status !== "verified") {
              if (!emailPasswordMigrationReadyForEmailSelection(currentUser, plan)) throw error;
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
            return advanceWithEmail(currentUser, recovered, plan);
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
        const plan = migrationPlanRef.current;
        const target = findLoginEmailAddress(currentUser, state.targetEmailAddressId);
        if (
          !target ||
          !plan ||
          plan.targetEmailAddressId !== target.id ||
          !emailPasswordMigrationReadyForEmailSelection(currentUser, plan)
        ) {
          setState(unavailableState("確認中のメールアドレスを取得できません。最新の状態を確認してください。"));
          return false;
        }
        if (target.verification?.status !== "verified") await target.attemptVerification({ code: code.trim() });
        currentUser = await reloadUser();
        const verified = findLoginEmailAddress(currentUser, target.id);
        if (
          !isVerifiedLoginEmailAddress(verified) ||
          !emailPasswordMigrationReadyForEmailSelection(currentUser, plan)
        ) {
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
          const recovered = findLoginEmailAddress(currentUser, state.targetEmailAddressId);
          const plan = migrationPlanRef.current;
          if (
            plan &&
            plan.targetEmailAddressId === recovered?.id &&
            isVerifiedLoginEmailAddress(recovered) &&
            emailPasswordMigrationReadyForEmailSelection(currentUser, plan)
          ) {
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
        const plan = migrationPlanRef.current;
        const target = findLoginEmailAddress(currentUser, state.targetEmailAddressId);
        if (
          !target ||
          !plan ||
          plan.targetEmailAddressId !== target.id ||
          target.verification?.status === "verified" ||
          !emailPasswordMigrationReadyForEmailSelection(currentUser, plan)
        ) {
          syncFromUser(currentUser, { status: "error", message: "確認コードを再送できません。" });
          return false;
        }
        const cooldown = retryCooldown.claim(currentUser.id, emailVerificationCooldownScope(target.id));
        if (!cooldown.allowed) {
          syncFromUser(
            currentUser,
            { status: "error", message: emailVerificationCooldownMessage(cooldown.retryAfterSeconds) },
            target.id,
          );
          return false;
        }
        await target.prepareVerification({ strategy: "email_code" });
        syncFromUser(currentUser, { status: "success", message: "新しい確認コードを再送しました。" }, target.id);
        return true;
      } catch (error) {
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  const { run: setPassword } = useSingleFlight(
    withOperationLock(async (newPassword: string) => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      let targetId = state.targetEmailAddressId;
      const plan = migrationPlanRef.current;
      try {
        let currentUser = await reloadUser();
        const target = findLoginEmailAddress(currentUser, targetId);
        if (!isVerifiedLoginEmailAddress(target) || !plan || plan.targetEmailAddressId !== target.id) {
          setState(unavailableState("確認済みのメールアドレスを取得できません。最新の状態を確認してください。"));
          return false;
        }
        targetId = target.id;

        if (!plan.primaryPrepared) {
          if (!emailPasswordMigrationReadyForEmailSelection(currentUser, plan)) {
            setState((current) => ({
              ...current,
              feedback: {
                status: "error",
                message: "ログイン方法の状態が変わりました。最新の状態を確認してください。",
              },
            }));
            return false;
          }

          if (currentUser.primaryEmailAddressId === target.id) {
            plan.primaryPrepared = true;
          } else {
            let primaryResult: "updated" | "alreadyPrimary" | "unavailable" | null | undefined;
            try {
              primaryResult = await updatePrimaryEmailWithReverification({
                targetEmailAddressId: target.id,
                plan,
              });
            } catch (error) {
              if (isReverificationCancelledError(error)) throw error;
              try {
                currentUser = await reloadUser();
              } catch {
                plan.primaryUpdateStarted = false;
                throw error;
              }
              if (
                !plan.primaryUpdateStarted ||
                !emailPasswordMigrationTargetPrimaryMatches(currentUser, plan) ||
                currentUser.passwordEnabled
              ) {
                plan.primaryUpdateStarted = false;
                throw error;
              }
              plan.primaryPrepared = true;
              primaryResult = "alreadyPrimary";
            }

            if (primaryResult == null || primaryResult === "unavailable") {
              currentUser = await reloadUser();
              if (
                !plan.primaryUpdateStarted ||
                !emailPasswordMigrationTargetPrimaryMatches(currentUser, plan) ||
                currentUser.passwordEnabled
              ) {
                plan.primaryUpdateStarted = false;
                setState((current) => ({
                  ...current,
                  feedback: {
                    status: "error",
                    message: "メールアドレスをメインに設定できません。最新の状態を確認してください。",
                  },
                }));
                return false;
              }
              plan.primaryPrepared = true;
            }
          }
        }

        currentUser = await reloadUser();
        if (
          !plan.primaryPrepared &&
          plan.primaryUpdateStarted &&
          !currentUser.passwordEnabled &&
          emailPasswordMigrationTargetPrimaryMatches(currentUser, plan)
        ) {
          plan.primaryPrepared = true;
        }
        if (!emailPasswordMigrationPrepared(currentUser, plan)) {
          setState((current) => ({
            ...current,
            feedback: { status: "error", message: "メールアドレスの設定結果を確認できません。" },
          }));
          return false;
        }

        const result = await setPasswordWithReverification({
          targetEmailAddressId: target.id,
          newPassword,
          plan,
        });
        currentUser = await reloadUser();
        if (!emailPasswordMigrationCompleted(currentUser, plan)) {
          if (emailPasswordMigrationPrepared(currentUser, plan)) plan.passwordUpdateStarted = false;
          setState((current) => ({
            ...current,
            feedback: {
              status: "error",
              message:
                result == null || result === "unavailable"
                  ? "パスワードを設定できません。最新の状態を確認してください。"
                  : "パスワードの設定結果を確認できません。",
            },
          }));
          return false;
        }
        migrationPlanRef.current = null;
        syncFromUser(
          currentUser,
          { status: "success", message: "メールアドレスとパスワードを設定しました。Googleは解除していません。" },
          target.id,
        );
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          if (plan) {
            if (!plan.primaryPrepared) plan.primaryUpdateStarted = false;
            plan.passwordUpdateStarted = false;
          }
          setState((current) => ({ ...current, feedback: IDLE_FEEDBACK }));
          return false;
        }
        try {
          const currentUser = await reloadUser();
          if (
            targetId &&
            plan?.targetEmailAddressId === targetId &&
            emailPasswordMigrationCompleted(currentUser, plan)
          ) {
            migrationPlanRef.current = null;
            syncFromUser(
              currentUser,
              { status: "success", message: "メールアドレスとパスワードを設定しました。Googleは解除していません。" },
              targetId,
            );
            return true;
          }
          if (plan && emailPasswordMigrationPrepared(currentUser, plan)) plan.passwordUpdateStarted = false;
        } catch {
          if (plan) plan.passwordUpdateStarted = false;
          // 応答喪失後の状態が不明なら完了扱いにしない。
        }
        setState((current) => ({ ...current, feedback: errorFeedback(error) }));
        return false;
      }
    }),
  );

  return {
    state: isActivating ? loadingState() : state,
    refresh,
    useDifferentEmail,
    verifyEmail,
    resendEmailCode,
    setPassword,
    reset: () => {
      migrationPlanRef.current = null;
      setState(user ? stateFromUser(user) : unavailableState());
    },
  };
}

function stateFromUser(user: UserResource, targetEmailAddressId: string | null = null): EmailPasswordMigrationState {
  const snapshot = toLoginMethodsUserSnapshot(user);
  const derived = deriveEmailPasswordMigration(snapshot, targetEmailAddressId);
  const target = derived.targetEmailAddressId
    ? user.emailAddresses.find((emailAddress) => emailAddress.id === derived.targetEmailAddressId)
    : undefined;
  const googleEmailAddress =
    derived.phase === "choosingEmail"
      ? user.externalAccounts.find(
          (externalAccount) =>
            externalAccount.provider === "google" && externalAccount.verification?.status === "verified",
        )?.emailAddress
      : undefined;
  const primaryEmailAddress =
    derived.phase === "choosingEmail" ? findLoginEmailAddress(user, user.primaryEmailAddressId) : undefined;
  return {
    ...derived,
    targetEmailAddress:
      target?.emailAddress ??
      (isVerifiedLoginEmailAddress(primaryEmailAddress) ? primaryEmailAddress.emailAddress : undefined) ??
      googleEmailAddress ??
      null,
    feedback: IDLE_FEEDBACK,
  };
}

function createEmailPasswordMigrationPlan(
  user: UserResource,
  actorUserId: string | null,
): EmailPasswordMigrationPlan | null {
  const hasVerifiedGoogle = user.externalAccounts.some(
    (account) => account.provider === "google" && account.verification?.status === "verified",
  );
  if (!actorUserId || user.id !== actorUserId || user.passwordEnabled || !hasVerifiedGoogle) return null;
  return {
    actorUserId,
    initialPrimaryEmailAddressId: user.primaryEmailAddressId,
    googleAccounts: getGoogleExternalAccountStateKeys(user),
    googleEmailAddresses: getGoogleLinkedEmailAddressStateKeys(user),
    targetEmailAddressId: null,
    primaryUpdateStarted: false,
    primaryPrepared: false,
    passwordUpdateStarted: false,
  };
}

function emailPasswordMigrationBaselineMatches(user: UserResource, plan: EmailPasswordMigrationPlan) {
  return (
    user.id === plan.actorUserId &&
    haveSameStringValues(getGoogleExternalAccountStateKeys(user), plan.googleAccounts) &&
    haveSameStringValues(getGoogleLinkedEmailAddressStateKeys(user), plan.googleEmailAddresses)
  );
}

function emailPasswordMigrationReadyForEmailSelection(user: UserResource, plan: EmailPasswordMigrationPlan) {
  return (
    emailPasswordMigrationBaselineMatches(user, plan) &&
    !user.passwordEnabled &&
    user.primaryEmailAddressId === plan.initialPrimaryEmailAddressId
  );
}

function emailPasswordMigrationReadyForPrimaryUpdate(user: UserResource, plan: EmailPasswordMigrationPlan) {
  const target = findLoginEmailAddress(user, plan.targetEmailAddressId);
  return (
    emailPasswordMigrationBaselineMatches(user, plan) &&
    !user.passwordEnabled &&
    isVerifiedLoginEmailAddress(target) &&
    (user.primaryEmailAddressId === plan.initialPrimaryEmailAddressId ||
      (plan.primaryUpdateStarted && user.primaryEmailAddressId === target.id))
  );
}

function emailPasswordMigrationTargetPrimaryMatches(user: UserResource, plan: EmailPasswordMigrationPlan) {
  const target = findLoginEmailAddress(user, plan.targetEmailAddressId);
  return (
    emailPasswordMigrationBaselineMatches(user, plan) &&
    isVerifiedLoginEmailAddress(target) &&
    user.primaryEmailAddressId === target.id
  );
}

function emailPasswordMigrationPrepared(user: UserResource, plan: EmailPasswordMigrationPlan) {
  return plan.primaryPrepared && !user.passwordEnabled && emailPasswordMigrationTargetPrimaryMatches(user, plan);
}

function emailPasswordMigrationCompleted(user: UserResource, plan: EmailPasswordMigrationPlan) {
  return (
    plan.primaryPrepared &&
    plan.passwordUpdateStarted &&
    user.passwordEnabled &&
    emailPasswordMigrationTargetPrimaryMatches(user, plan)
  );
}

function getGoogleLinkedEmailAddressStateKeys(user: Pick<UserResource, "emailAddresses">) {
  return user.emailAddresses
    .filter((emailAddress) => emailAddress.linkedTo.some((link) => link.type === "oauth_google"))
    .map((emailAddress) => {
      const linkKeys = emailAddress.linkedTo.map((link) => `${link.type}:${link.id}`).sort();
      return `${emailAddress.id}:${emailAddress.verification?.status ?? "unknown"}:${linkKeys.join(",")}`;
    });
}

function unavailableState(message: string | null = null): EmailPasswordMigrationState {
  return {
    phase: "unavailable",
    targetEmailAddressId: null,
    targetEmailAddress: null,
    feedback: { status: message ? "error" : "idle", message },
  };
}

function loadingState(): EmailPasswordMigrationState {
  return {
    phase: "loading",
    targetEmailAddressId: null,
    targetEmailAddress: null,
    feedback: { status: "loading", message: null },
  };
}

function errorFeedback(error: unknown): LoginMethodMigrationFeedback {
  return { status: "error", message: getLoginMethodAccountErrorMessage(error) };
}
