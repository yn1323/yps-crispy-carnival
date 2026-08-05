import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import {
  getGoogleExternalAccounts,
  hasEmailPasswordLoginMethod,
  isVerifiedOwnedGoogleExternalAccount,
} from "./clerkLoginMethodResource";
import type {
  GoogleConnectionPhase,
  LoginMethodMigrationFeedback,
  LoginMethodOperationRunner,
  LoginMethodReverificationHandler,
} from "./migrationTypes";
import {
  createLoginMethodOperationCooldown,
  GOOGLE_OAUTH_COOLDOWN_SCOPE,
  type LoginMethodOperationCooldown,
} from "./operationCooldown";

export type GoogleConnectionErrorKind =
  | "providerCancelled"
  | "accountCollision"
  | "alreadyConnected"
  | "clerkConflict"
  | "cooldown"
  | "retryable";

export type GoogleConnectionState = {
  phase: GoogleConnectionPhase;
  feedback: LoginMethodMigrationFeedback;
  /** 表示文言へClerk responseや識別子を渡さず、UIが失敗境界だけを判別するための値。 */
  errorKind?: GoogleConnectionErrorKind | null;
};

export type GoogleConnectionController = {
  state: GoogleConnectionState;
  start: () => Promise<boolean | undefined>;
  refresh: () => Promise<boolean | undefined>;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  getCurrentActorId: () => string | null;
  active?: boolean;
  oauthReturn: boolean;
  onOAuthReturnHandled?: () => void;
  onNeedsReverification: LoginMethodReverificationHandler;
  runOperation: LoginMethodOperationRunner;
  navigateToExternalVerification?: (url: string) => void;
  operationCooldown?: LoginMethodOperationCooldown;
};

type OAuthCorrelation = {
  version: 1;
  userId: string;
  externalAccountId: string;
  primaryEmailAddressId: string | null;
  passwordEnabled: boolean;
};

type OAuthBaseline = Pick<OAuthCorrelation, "userId" | "primaryEmailAddressId" | "passwordEnabled">;

type PreparedGoogleStart =
  | { status: "ready"; user: UserResource }
  | { status: "alreadyConnected" }
  | { status: "cancelled" }
  | { status: "retryable" }
  | { status: "unavailable" };

const GOOGLE_OAUTH_RETURN_PATH = "/account/security?flow=connect-google&oauth=google";
const GOOGLE_OAUTH_CORRELATION_STORAGE_KEY = "shiftori:login-methods:google-connection:v1";

const ERROR_PRESENTATION: Record<GoogleConnectionErrorKind, string> = {
  providerCancelled: "Googleアカウントの追加をキャンセルしました。現在のログイン方法は変更されていません。",
  accountCollision:
    "このGoogleアカウントは追加できません。別のGoogleアカウントを選んでください。現在のログイン方法は変更されていません。",
  alreadyConnected: "このGoogleアカウントはすでに接続されています。画面を再読み込みして最新の状態を確認してください。",
  clerkConflict: "Google連携の状態が変わりました。画面を再読み込みしてからやり直してください。",
  cooldown: "Googleの確認を開始した直後です。しばらく待ってから再試行してください。",
  retryable: "Googleログインを追加できませんでした。現在のログイン方法は変更されていません。もう一度お試しください。",
};

export function useGoogleConnectionController({
  isLoaded,
  user,
  getCurrentActorId,
  active = true,
  oauthReturn,
  onOAuthReturnHandled,
  onNeedsReverification,
  runOperation,
  navigateToExternalVerification = (url) => window.location.assign(url),
  operationCooldown,
}: Options): GoogleConnectionController {
  const actorUserId = user?.id ?? null;
  const userRef = useRef(user);
  userRef.current = user;
  const localOperationCooldown = useMemo(() => createLoginMethodOperationCooldown(), []);
  const retryCooldown = operationCooldown ?? localOperationCooldown;
  const oauthClaimedRef = useRef(false);
  const wasActiveRef = useRef(active);
  const initializedForRef = useRef<string | null>(user?.id ?? null);
  const [state, setState] = useState<GoogleConnectionState>(() => (user ? stateFromUser(user) : unavailableState()));

  useEffect(() => {
    if (!isLoaded || !user || initializedForRef.current === user.id) return;
    initializedForRef.current = user.id;
    oauthClaimedRef.current = false;
    setState(stateFromUser(user));
  }, [isLoaded, user]);

  const isActivating = active && !wasActiveRef.current && !oauthReturn;

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    const becameInactive = !active && wasActiveRef.current;
    wasActiveRef.current = active;
    const currentUser = userRef.current;
    if (!isLoaded || !currentUser || currentUser.id !== actorUserId) return;
    if (becameInactive) {
      oauthClaimedRef.current = false;
      setState(stateFromUser(currentUser));
      return;
    }
    if (!becameActive || oauthReturn) return;

    oauthClaimedRef.current = false;
    let cancelled = false;
    const activatingUserId = currentUser.id;
    setState(loadingState());
    void currentUser
      .reload()
      .then(() => {
        const latestUser = userRef.current;
        if (!cancelled && getCurrentActorId() === activatingUserId && latestUser?.id === activatingUserId) {
          setState(stateFromUser(latestUser));
        }
      })
      .catch(() => {
        if (!cancelled && getCurrentActorId() === activatingUserId) setState(errorState("retryable"));
      });
    return () => {
      cancelled = true;
    };
  }, [active, actorUserId, getCurrentActorId, isLoaded, oauthReturn]);

  const reloadUser = async () => {
    if (!isLoaded || !user || !actorUserId || user.id !== actorUserId || getCurrentActorId() !== actorUserId) {
      throw new Error("Unauthenticated");
    }
    await user.reload();
    if (user.id !== actorUserId || getCurrentActorId() !== actorUserId) throw new Error("Unauthenticated");
    return user;
  };

  const createExternalAccountWithReverification = useReverification(
    async (baseline: OAuthBaseline) => {
      const currentUser = await reloadUser();
      if (!matchesOAuthBaseline(currentUser, baseline) || !canConnectGoogle(currentUser)) {
        return { status: "unavailable" } as const;
      }

      const externalAccount = await currentUser.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: GOOGLE_OAUTH_RETURN_PATH,
        oidcPrompt: "select_account",
      });
      return { status: "created", externalAccount } as const;
    },
    { onNeedsReverification },
  );
  const discardPendingGoogleWithReverification = useReverification(
    async (externalAccountId: string, baseline: OAuthBaseline) => {
      const currentUser = await reloadUser();
      const externalAccount = currentUser.externalAccounts.find((account) => account.id === externalAccountId);
      if (
        externalAccount &&
        matchesOAuthBaseline(currentUser, baseline) &&
        isVerifiedOwnedGoogleExternalAccount(currentUser, externalAccount)
      ) {
        return "alreadyConnected" as const;
      }
      if (!isDiscardablePendingGoogle(currentUser, externalAccount, baseline)) return "unavailable" as const;
      await externalAccount.destroy();
      return "discarded" as const;
    },
    { onNeedsReverification },
  );

  const prepareGoogleStart = async (
    currentUser: UserResource,
    baseline: OAuthBaseline,
  ): Promise<PreparedGoogleStart> => {
    const verifiedGoogle = currentUser.externalAccounts.find((account) =>
      isVerifiedOwnedGoogleExternalAccount(currentUser, account),
    );
    if (verifiedGoogle) return { status: "alreadyConnected" };
    if (!matchesOAuthBaseline(currentUser, baseline)) return { status: "unavailable" };
    if (canConnectGoogle(currentUser)) return { status: "ready", user: currentUser };

    const pendingGoogleAccounts = getGoogleExternalAccounts(currentUser).filter(isRetryablePendingGoogle);
    if (pendingGoogleAccounts.length !== 1) return { status: "unavailable" };
    const pendingGoogle = pendingGoogleAccounts[0];
    if (!pendingGoogle || !isDiscardablePendingGoogle(currentUser, pendingGoogle, baseline)) {
      return { status: "unavailable" };
    }

    try {
      const discarded = await discardPendingGoogleWithReverification(pendingGoogle.id, baseline);
      if (discarded == null) return { status: "retryable" };
      if (discarded === "alreadyConnected") return { status: "alreadyConnected" };
      if (discarded === "unavailable") return { status: "unavailable" };

      const cleanedUser = await reloadUser();
      if (googleRetryCleanupCompleted(cleanedUser, pendingGoogle.id, baseline)) {
        return { status: "ready", user: cleanedUser };
      }
      const connectedGoogle = cleanedUser.externalAccounts.find((account) => account.id === pendingGoogle.id);
      if (
        connectedGoogle &&
        matchesOAuthBaseline(cleanedUser, baseline) &&
        isVerifiedOwnedGoogleExternalAccount(cleanedUser, connectedGoogle)
      ) {
        return { status: "alreadyConnected" };
      }
      return { status: "unavailable" };
    } catch (error) {
      if (isReverificationCancelledError(error)) return { status: "cancelled" };
      try {
        const latestUser = await reloadUser();
        if (googleRetryCleanupCompleted(latestUser, pendingGoogle.id, baseline)) {
          return { status: "ready", user: latestUser };
        }
        const connectedGoogle = latestUser.externalAccounts.find((account) => account.id === pendingGoogle.id);
        if (
          connectedGoogle &&
          matchesOAuthBaseline(latestUser, baseline) &&
          isVerifiedOwnedGoogleExternalAccount(latestUser, connectedGoogle)
        ) {
          return { status: "alreadyConnected" };
        }
      } catch {
        // reload失敗時もresourceを推測削除せず、利用者が明示的に再試行できる状態へ戻す。
      }
      return { status: "retryable" };
    }
  };

  const withOperationLock =
    <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Promise<Result>) =>
    (...args: Arguments) =>
      runOperation(() => operation(...args));

  const { run: refresh } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({
        ...current,
        errorKind: null,
        feedback: { status: "loading", message: null },
      }));
      try {
        const currentUser = await reloadUser();
        const correlation = readOAuthCorrelation();
        if (correlation) {
          const settlement = settleCorrelatedAccount(currentUser, correlation);
          if (settlement.ok) {
            clearOAuthCorrelation();
            setState(methodReadyState(true));
            return true;
          }
          clearOAuthCorrelation();
          setState(errorState(settlement.errorKind));
          return false;
        }

        const connectedAccount = currentUser.externalAccounts.find((account) =>
          isVerifiedOwnedGoogleExternalAccount(currentUser, account),
        );
        if (connectedAccount) {
          setState(methodReadyState());
          return true;
        }

        if (!canStartGoogleConnection(currentUser)) {
          setState(errorState("clerkConflict"));
          return false;
        }
        setState({
          ...stateFromUser(currentUser),
          feedback: { status: "success", message: "最新の状態を確認しました。" },
        });
        return true;
      } catch {
        setState(errorState("retryable"));
        return false;
      }
    }),
  );

  const { run: start } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({
        ...current,
        errorKind: null,
        feedback: { status: "loading", message: null },
      }));

      let startingUserId: string | null = null;
      let externalAccountIdsBeforeStart: ReadonlySet<string> = new Set();
      let baseline: OAuthBaseline | null = null;
      try {
        const currentUser = await reloadUser();
        startingUserId = currentUser.id;
        baseline = {
          userId: currentUser.id,
          primaryEmailAddressId: currentUser.primaryEmailAddressId,
          passwordEnabled: currentUser.passwordEnabled,
        };

        if (canStartGoogleConnection(currentUser)) {
          const cooldown = retryCooldown.claim(currentUser.id, GOOGLE_OAUTH_COOLDOWN_SCOPE);
          if (!cooldown.allowed) {
            setState(cooldownState(cooldown.retryAfterSeconds));
            return false;
          }
        }

        const prepared = await prepareGoogleStart(currentUser, baseline);
        if (prepared.status === "cancelled") {
          setState(stateFromUser(currentUser));
          return false;
        }
        if (prepared.status === "alreadyConnected") {
          clearOAuthCorrelation();
          setState(methodReadyState(true));
          return true;
        }
        if (prepared.status === "retryable") {
          setState(errorState("retryable"));
          return false;
        }
        if (prepared.status === "unavailable") {
          clearOAuthCorrelation();
          setState(errorState("clerkConflict"));
          return false;
        }

        clearOAuthCorrelation();
        externalAccountIdsBeforeStart = new Set(prepared.user.externalAccounts.map((account) => account.id));

        const created = await createExternalAccountWithReverification(baseline);
        if (created == null) {
          setState(errorState("retryable"));
          return false;
        }
        if (created.status === "unavailable") {
          setState(errorState("clerkConflict"));
          return false;
        }

        return continueExternalVerification(prepared.user, created.externalAccount, baseline);
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setState(user ? stateFromUser(user) : unavailableState());
          return false;
        }

        const recovery = await recoverAfterCreateResponseLoss(
          startingUserId,
          externalAccountIdsBeforeStart,
          baseline,
          error,
        );
        if (recovery !== null) return recovery;

        setState(errorState(classifyOAuthError(error)));
        return false;
      }
    }),
  );

  const continueExternalVerification = (
    currentUser: UserResource,
    externalAccount: ExternalAccountResource,
    baseline: OAuthBaseline,
  ) => {
    if (getCurrentActorId() !== baseline.userId || !matchesOAuthBaseline(currentUser, baseline)) {
      clearOAuthCorrelation();
      setState(errorState("clerkConflict"));
      return false;
    }

    const resourceError = externalAccount.verification?.error;
    if (resourceError) {
      clearOAuthCorrelation();
      setState(errorState(classifyOAuthError(resourceError)));
      return false;
    }

    if (externalAccount.provider !== "google") {
      clearOAuthCorrelation();
      setState(errorState("clerkConflict"));
      return false;
    }

    const correlation: OAuthCorrelation = {
      version: 1,
      ...baseline,
      externalAccountId: externalAccount.id,
    };
    if (!storeOAuthCorrelation(correlation)) {
      setState(errorState("retryable"));
      return false;
    }

    if (isVerifiedOwnedGoogleExternalAccount(currentUser, externalAccount)) {
      clearOAuthCorrelation();
      setState(methodReadyState(true));
      return true;
    }

    const redirectUrl = externalAccount.verification?.externalVerificationRedirectURL?.toString();
    if (!redirectUrl) {
      clearOAuthCorrelation();
      setState(errorState("retryable"));
      return false;
    }

    setState({
      phase: "redirecting",
      errorKind: null,
      feedback: { status: "loading", message: null },
    });
    navigateToExternalVerification(redirectUrl);
    return true;
  };

  const recoverAfterCreateResponseLoss = async (
    startingUserId: string | null,
    externalAccountIdsBeforeStart: ReadonlySet<string>,
    baseline: OAuthBaseline | null,
    originalError: unknown,
  ): Promise<boolean | null> => {
    if (!startingUserId || !baseline) return null;
    try {
      const currentUser = await reloadUser();
      if (currentUser.id !== startingUserId) {
        clearOAuthCorrelation();
        setState(errorState("clerkConflict"));
        return false;
      }

      const newGoogleAccounts = currentUser.externalAccounts.filter(
        (account) => account.provider === "google" && !externalAccountIdsBeforeStart.has(account.id),
      );
      if (newGoogleAccounts.length !== 1) return null;

      const [newGoogle] = newGoogleAccounts;
      if (!newGoogle) return null;
      const resourceError = newGoogle.verification?.error;
      if (resourceError) {
        clearOAuthCorrelation();
        setState(errorState(classifyOAuthError(resourceError)));
        return false;
      }
      return continueExternalVerification(currentUser, newGoogle, baseline);
    } catch {
      setState(errorState(classifyOAuthError(originalError)));
      return false;
    }
  };

  const { run: settleOAuthReturn } = useSingleFlight(
    withOperationLock(async () => {
      setState({
        phase: "settling",
        errorKind: null,
        feedback: { status: "loading", message: null },
      });

      const correlation = readOAuthCorrelation();
      if (!correlation) {
        setState(errorState("clerkConflict"));
        return false;
      }

      try {
        const currentUser = await reloadUser();
        const settlement = settleCorrelatedAccount(currentUser, correlation);
        if (!settlement.ok) {
          clearOAuthCorrelation();
          setState(errorState(settlement.errorKind));
          return false;
        }

        clearOAuthCorrelation();
        setState(methodReadyState(true));
        return true;
      } catch (error) {
        setState(errorState(classifyOAuthError(error)));
        return false;
      }
    }),
  );

  useEffect(() => {
    if (!oauthReturn || !isLoaded || !user || oauthClaimedRef.current) return;

    oauthClaimedRef.current = true;
    const settlement = settleOAuthReturn();
    onOAuthReturnHandled?.();
    void settlement.then((result) => {
      if (result === undefined) {
        setState(errorState("clerkConflict"));
      }
    });
  }, [isLoaded, oauthReturn, onOAuthReturnHandled, settleOAuthReturn, user]);

  return { state: isActivating ? loadingState() : state, start, refresh };
}

function stateFromUser(user: UserResource): GoogleConnectionState {
  if (!canStartGoogleConnection(user)) return unavailableState();
  return {
    phase: "readyToConnect",
    errorKind: null,
    feedback: { status: "idle", message: null },
  };
}

function canConnectGoogle(user: UserResource) {
  return hasEmailPasswordLoginMethod(user) && getGoogleExternalAccounts(user).length === 0;
}

function canRetryPendingGoogle(user: UserResource) {
  const accounts = getGoogleExternalAccounts(user);
  return (
    hasEmailPasswordLoginMethod(user) &&
    accounts.length === 1 &&
    Boolean(accounts[0] && isRetryablePendingGoogle(accounts[0]))
  );
}

function canStartGoogleConnection(user: UserResource) {
  return canConnectGoogle(user) || canRetryPendingGoogle(user);
}

function isDiscardablePendingGoogle(
  user: UserResource,
  account: ExternalAccountResource | null | undefined,
  baseline: OAuthBaseline,
): account is ExternalAccountResource {
  return (
    account?.provider === "google" &&
    isRetryablePendingGoogle(account) &&
    matchesOAuthBaseline(user, baseline) &&
    hasEmailPasswordLoginMethod(user) &&
    getGoogleExternalAccounts(user).length === 1
  );
}

function isRetryablePendingGoogle(account: ExternalAccountResource) {
  const status = account.verification?.status;
  return status === "unverified" || status === "failed";
}

function googleRetryCleanupCompleted(user: UserResource, externalAccountId: string, baseline: OAuthBaseline) {
  return (
    matchesOAuthBaseline(user, baseline) &&
    !user.externalAccounts.some((account) => account.id === externalAccountId) &&
    canConnectGoogle(user)
  );
}

function settleCorrelatedAccount(
  user: UserResource,
  correlation: OAuthCorrelation,
): { ok: true; account: ExternalAccountResource } | { ok: false; errorKind: GoogleConnectionErrorKind } {
  if (!matchesOAuthBaseline(user, correlation)) {
    return { ok: false, errorKind: "clerkConflict" };
  }

  const account = user.externalAccounts.find((candidate) => candidate.id === correlation.externalAccountId);
  if (account?.provider !== "google") return { ok: false, errorKind: "clerkConflict" };

  const resourceError = account.verification?.error;
  if (resourceError) return { ok: false, errorKind: classifyOAuthError(resourceError) };
  if (!isVerifiedOwnedGoogleExternalAccount(user, account)) {
    return { ok: false, errorKind: "clerkConflict" };
  }
  return { ok: true, account };
}

function matchesOAuthBaseline(user: UserResource, baseline: OAuthBaseline) {
  return (
    user.id === baseline.userId &&
    user.primaryEmailAddressId === baseline.primaryEmailAddressId &&
    user.passwordEnabled === baseline.passwordEnabled
  );
}

function methodReadyState(announceCompletion = false): GoogleConnectionState {
  return {
    phase: "methodReady",
    errorKind: null,
    feedback: announceCompletion
      ? { status: "success", message: "Googleログインを追加しました。" }
      : { status: "idle", message: null },
  };
}

function unavailableState(): GoogleConnectionState {
  return {
    phase: "unavailable",
    errorKind: null,
    feedback: { status: "idle", message: null },
  };
}

function loadingState(): GoogleConnectionState {
  return {
    phase: "settling",
    errorKind: null,
    feedback: { status: "loading", message: null },
  };
}

function cooldownState(retryAfterSeconds: number): GoogleConnectionState {
  return {
    phase: "readyToConnect",
    errorKind: "cooldown",
    feedback: {
      status: "error",
      message: `Googleの確認を開始した直後です。あと${retryAfterSeconds}秒ほど待ってから再試行してください。`,
    },
  };
}

function errorState(errorKind: GoogleConnectionErrorKind): GoogleConnectionState {
  return {
    phase: "unavailable",
    errorKind,
    feedback: { status: "error", message: ERROR_PRESENTATION[errorKind] },
  };
}

function classifyOAuthError(error: unknown): GoogleConnectionErrorKind {
  const code = extractClerkErrorCode(error);
  if (code === "oauth_access_denied") return "providerCancelled";
  if (code === "oauth_identification_claimed") return "accountCollision";
  if (code === "oauth_account_already_connected") return "alreadyConnected";
  if (
    code === "identifier_already_exists" ||
    code === "form_identifier_exists" ||
    code === "form_identifier_already_exists" ||
    code === "email_address_exists"
  ) {
    return "clerkConflict";
  }
  return "retryable";
}

function extractClerkErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("errors" in error && Array.isArray(error.errors)) {
    for (const candidate of error.errors) {
      const code = extractClerkErrorCode(candidate);
      if (code) return code;
    }
  }
  return null;
}

function readOAuthCorrelation(): OAuthCorrelation | null {
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_OAUTH_CORRELATION_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("userId" in value) ||
      typeof value.userId !== "string" ||
      !("externalAccountId" in value) ||
      typeof value.externalAccountId !== "string" ||
      !("primaryEmailAddressId" in value) ||
      (value.primaryEmailAddressId !== null && typeof value.primaryEmailAddressId !== "string") ||
      !("passwordEnabled" in value) ||
      typeof value.passwordEnabled !== "boolean"
    ) {
      clearOAuthCorrelation();
      return null;
    }
    return value as OAuthCorrelation;
  } catch {
    clearOAuthCorrelation();
    return null;
  }
}

function storeOAuthCorrelation(correlation: OAuthCorrelation) {
  try {
    window.sessionStorage.setItem(GOOGLE_OAUTH_CORRELATION_STORAGE_KEY, JSON.stringify(correlation));
    return true;
  } catch {
    return false;
  }
}

function clearOAuthCorrelation() {
  try {
    window.sessionStorage.removeItem(GOOGLE_OAUTH_CORRELATION_STORAGE_KEY);
  } catch {
    // 保存領域を利用できない場合も、Clerk resourceの所有確認を緩めない。
  }
}
