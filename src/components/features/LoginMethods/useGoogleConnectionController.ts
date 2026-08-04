import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { UserResource } from "@clerk/shared/types";
import { useEffect, useRef, useState } from "react";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import { buildGoogleOAuthReturnPath, canStartGoogleConnection } from "./migrationScript";
import type {
  GoogleConnectionPhase,
  GoogleOAuthMigrationFlow,
  LoginMethodMigrationFeedback,
  LoginMethodOperationRunner,
  LoginMethodReverificationHandler,
} from "./migrationTypes";

export type GoogleConnectionState = {
  phase: GoogleConnectionPhase;
  googleAccountId: string | null;
  maskedEmail: string | null;
  feedback: LoginMethodMigrationFeedback;
};

export type GoogleConnectionController = {
  state: GoogleConnectionState;
  start: () => Promise<boolean | undefined>;
  refresh: () => Promise<boolean | undefined>;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  enabled: boolean;
  flow: GoogleOAuthMigrationFlow;
  oauthReturn: boolean;
  onOAuthReturnHandled?: () => void;
  onNeedsReverification: LoginMethodReverificationHandler;
  runOperation: LoginMethodOperationRunner;
  navigateToExternalVerification?: (url: string) => void;
};

const CONNECTION_FAILED_MESSAGE =
  "このGoogleアカウントを接続できませんでした。現在のログイン方法は変更されていません。別のGoogleアカウントを選ぶか、ログイン設定に戻ってください。";

export function useGoogleConnectionController({
  isLoaded,
  user,
  enabled,
  flow,
  oauthReturn,
  onOAuthReturnHandled,
  onNeedsReverification,
  runOperation,
  navigateToExternalVerification = (url) => window.location.assign(url),
}: Options): GoogleConnectionController {
  const oauthClaimedRef = useRef(false);
  const initializedForRef = useRef<{ userId: string; flow: GoogleOAuthMigrationFlow } | null>(
    user && enabled ? { userId: user.id, flow } : null,
  );
  const [state, setState] = useState<GoogleConnectionState>(() =>
    user && enabled ? stateFromUser(user, flow) : unavailableState(),
  );

  useEffect(() => {
    if (!enabled) {
      initializedForRef.current = null;
      setState(unavailableState());
      return;
    }
    if (!isLoaded || !user) return;
    const initializedFor = initializedForRef.current;
    if (initializedFor?.userId === user.id && initializedFor?.flow === flow) return;
    initializedForRef.current = { userId: user.id, flow };
    setState(stateFromUser(user, flow));
  }, [enabled, flow, isLoaded, user]);

  const reloadUser = async () => {
    if (!isLoaded || !user) throw new Error("Unauthenticated");
    await user.reload();
    return user;
  };

  const createExternalAccountWithReverification = useReverification(
    async () => {
      const currentUser = await reloadUser();
      if (!enabled || !canStartGoogleConnection(toLoginMethodsUserSnapshot(currentUser), flow)) {
        return { status: "unavailable" } as const;
      }
      const externalAccount = await currentUser.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: buildGoogleOAuthReturnPath(flow),
        oidcPrompt: "select_account",
      });
      return { status: "created", externalAccount } as const;
    },
    { onNeedsReverification },
  );

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
          setState(unavailableState("Googleログインの追加は現在利用できません。"));
          return false;
        }
        setState({
          ...stateFromUser(currentUser, flow),
          feedback: { status: "success", message: "最新のGoogle連携を確認しました。" },
        });
        return true;
      } catch {
        setState(unavailableState("Google連携を確認できませんでした。画面を再読み込みしてください。"));
        return false;
      }
    }),
  );

  const { run: start } = useSingleFlight(
    withOperationLock(async () => {
      setState((current) => ({ ...current, feedback: { status: "loading", message: null } }));
      try {
        const currentUser = await reloadUser();
        if (!enabled || !canStartGoogleConnection(toLoginMethodsUserSnapshot(currentUser), flow)) {
          setState(unavailableState("現在の状態ではGoogleログインを追加できません。最新の状態を確認してください。"));
          return false;
        }
        const created = await createExternalAccountWithReverification();
        if (created == null || created.status === "unavailable") {
          setState(unavailableState("Google連携を開始できません。最新の状態を確認してください。"));
          return false;
        }
        const redirectUrl = created.externalAccount.verification?.externalVerificationRedirectURL?.toString();
        if (!redirectUrl) {
          setState(unavailableState("Googleの確認画面を開けませんでした。もう一度お試しください。"));
          return false;
        }
        setState({
          phase: "redirecting",
          googleAccountId: created.externalAccount.id,
          maskedEmail: null,
          feedback: { status: "loading", message: "Googleのアカウント選択画面を開いています。" },
        });
        navigateToExternalVerification(redirectUrl);
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setState(user ? stateFromUser(user, flow) : unavailableState());
          return false;
        }
        try {
          const currentUser = await reloadUser();
          const verifiedGoogle = findVerifiedGoogle(currentUser);
          if (verifiedGoogle) {
            setState(methodReadyState(verifiedGoogle.id, verifiedGoogle.emailAddress, true));
            return true;
          }
        } catch {
          // OAuth開始の応答喪失後もprovider errorやUser payloadを表示しない。
        }
        setState(unavailableState(CONNECTION_FAILED_MESSAGE));
        return false;
      }
    }),
  );

  const { run: settleOAuthReturn } = useSingleFlight(
    withOperationLock(async () => {
      setState({
        phase: "settling",
        googleAccountId: null,
        maskedEmail: null,
        feedback: { status: "loading", message: null },
      });
      try {
        const currentUser = await reloadUser();
        if (!enabled) {
          setState(unavailableState("Googleログインの追加は現在利用できません。"));
          return false;
        }
        const verifiedGoogle = findVerifiedGoogle(currentUser);
        if (!verifiedGoogle) {
          const hasPendingGoogle = currentUser.externalAccounts.some((account) => account.provider === "google");
          setState(
            unavailableState(
              hasPendingGoogle
                ? "Googleの確認が完了していません。Googleアカウントの選択をやり直してください。"
                : CONNECTION_FAILED_MESSAGE,
            ),
          );
          return false;
        }
        setState(methodReadyState(verifiedGoogle.id, verifiedGoogle.emailAddress, true));
        return true;
      } catch {
        setState(unavailableState(CONNECTION_FAILED_MESSAGE));
        return false;
      }
    }),
  );

  useEffect(() => {
    if (!oauthReturn) return;
    if (!isLoaded || !user || oauthClaimedRef.current) return;

    oauthClaimedRef.current = true;
    const settlement = settleOAuthReturn();
    onOAuthReturnHandled?.();
    void settlement.then((result) => {
      if (result === undefined) {
        setState(unavailableState("別の変更を処理中です。最新の状態を確認してからやり直してください。"));
      }
    });
  }, [isLoaded, oauthReturn, onOAuthReturnHandled, settleOAuthReturn, user]);

  return { state, start, refresh };
}

function stateFromUser(user: UserResource, flow: GoogleOAuthMigrationFlow): GoogleConnectionState {
  if (!canStartGoogleConnection(toLoginMethodsUserSnapshot(user), flow)) {
    return unavailableState("現在の状態ではGoogleログインを追加できません。最新の状態を確認してください。");
  }
  return {
    phase: "readyToConnect",
    googleAccountId: null,
    maskedEmail: null,
    feedback: { status: "idle", message: null },
  };
}

function methodReadyState(id: string, emailAddress: string, announceCompletion = false): GoogleConnectionState {
  return {
    phase: "methodReady",
    googleAccountId: id,
    maskedEmail: maskEmailAddress(emailAddress),
    feedback: announceCompletion
      ? {
          status: "success",
          message: "Googleログインを利用できる状態になりました。以前のログイン方法は削除していません。",
        }
      : { status: "idle", message: null },
  };
}

function unavailableState(message: string | null = null): GoogleConnectionState {
  return {
    phase: "unavailable",
    googleAccountId: null,
    maskedEmail: null,
    feedback: { status: message ? "error" : "idle", message },
  };
}

function findVerifiedGoogle(user: UserResource) {
  return user.externalAccounts.find(
    (account) => account.provider === "google" && account.verification?.status === "verified",
  );
}
