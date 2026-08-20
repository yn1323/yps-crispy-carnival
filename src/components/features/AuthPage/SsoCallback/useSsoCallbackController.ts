import { useClerk, useSignIn, useSignUp } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { buildRestartAuthUrl } from "@/src/lib/auth/redirect";
import { completeAuthSession } from "../completeAuthSession";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { getClerkErrorMessage } from "../errorPresentation";
import {
  findClientTrustEmailCodeFactor,
  isCompletedSignIn,
  prepareClientTrustEmailCode,
  verifyClientTrustEmailCode,
} from "../loginVerification";
import { resetOAuthAttempts } from "../resetOAuthAttempts";

const RESEND_COOLDOWN_SECONDS = 30;
const RECOVERY_MESSAGE = "Google認証を完了できませんでした。\n最初からやり直してください。";
const SESSION_CREATION_ERROR = "セッションを作成できませんでした。\n最初からやり直してください。";

type SignInHookResource = ReturnType<typeof useSignIn>["signIn"];
type SignInCallbackResource = Pick<
  SignInHookResource,
  | "status"
  | "isTransferable"
  | "existingSession"
  | "createdSessionId"
  | "supportedSecondFactors"
  | "create"
  | "finalize"
  | "reset"
> & {
  mfa: Pick<SignInHookResource["mfa"], "sendEmailCode" | "verifyEmailCode">;
  secondFactorVerification: Pick<SignInHookResource["secondFactorVerification"], "expireAt" | "status" | "strategy">;
};
type SignUpCallbackResource = Pick<
  ReturnType<typeof useSignUp>["signUp"],
  "id" | "status" | "isTransferable" | "existingSession" | "createdSessionId" | "create" | "finalize" | "reset"
>;
type NavigateToApp = NonNullable<NonNullable<Parameters<SignInCallbackResource["finalize"]>[0]>["navigate"]>;

export type SsoCallbackResources = {
  clerk: Pick<ReturnType<typeof useClerk>, "setActive">;
  signIn: SignInCallbackResource;
  signUp: SignUpCallbackResource;
};

export type SsoCallbackRecoveryTarget = "login" | "signup";

export type SsoCallbackNavigation = {
  navigateToApp: NavigateToApp;
  continueClientTrust: (safeIdentifier: string | undefined, preparedNow: boolean) => void;
  recover: (target: SsoCallbackRecoveryTarget, message?: string) => void;
};

export type SsoCallbackViewState =
  | { kind: "processing" }
  | { kind: "client-trust"; safeIdentifier?: string }
  | { kind: "recovery"; target: SsoCallbackRecoveryTarget };

async function expectClerkSuccess(operation: Promise<{ error: unknown | null }>) {
  const { error } = await operation;
  if (error) throw error;
}

async function finalizeCompletedResource(
  resource: Pick<SignInCallbackResource, "createdSessionId" | "finalize">,
  target: SsoCallbackRecoveryTarget,
  { navigateToApp, recover }: Pick<SsoCallbackNavigation, "navigateToApp" | "recover">,
) {
  if (!resource.createdSessionId) {
    recover(target, SESSION_CREATION_ERROR);
    return;
  }

  await expectClerkSuccess(resource.finalize({ navigate: navigateToApp }));
}

async function continueClientTrustWhenSupported(
  signIn: SignInCallbackResource,
  navigation: Pick<SsoCallbackNavigation, "continueClientTrust" | "recover">,
) {
  const factor = findClientTrustEmailCodeFactor(signIn);
  if (!factor) {
    navigation.recover("login");
    return;
  }

  const { expireAt, status, strategy } = signIn.secondFactorVerification;
  const isUnstarted = status === null && strategy === null;
  const isActiveEmailCode =
    strategy === "email_code" && status === "unverified" && (expireAt === null || expireAt.getTime() > Date.now());
  const isExpiredEmailCode =
    strategy === "email_code" &&
    (status === "expired" || (status === "unverified" && expireAt !== null && expireAt.getTime() <= Date.now()));

  if (isUnstarted || isExpiredEmailCode) {
    await prepareClientTrustEmailCode(signIn);
    navigation.continueClientTrust(factor.safeIdentifier, true);
    return;
  }

  if (isActiveEmailCode) {
    navigation.continueClientTrust(factor.safeIdentifier, false);
    return;
  }

  navigation.recover("login");
}

export async function handleSsoCallback(
  { clerk, signIn, signUp }: SsoCallbackResources,
  navigation: SsoCallbackNavigation,
) {
  if (signIn.status === "complete") {
    await finalizeCompletedResource(signIn, "login", navigation);
    return;
  }

  if (signUp.isTransferable) {
    await expectClerkSuccess(signIn.create({ transfer: true }));
    // Core 3 mutates the Signal resource after create; discard the pre-await status narrowing.
    if ((signIn.status as string) === "complete") {
      await finalizeCompletedResource(signIn, "login", navigation);
      return;
    }
    if ((signIn.status as string) === "needs_client_trust" || (signIn.status as string) === "needs_second_factor") {
      await continueClientTrustWhenSupported(signIn, navigation);
      return;
    }
    navigation.recover("login");
    return;
  }

  if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
    await continueClientTrustWhenSupported(signIn, navigation);
    return;
  }

  if (
    signIn.status === "needs_first_factor" ||
    signIn.status === "needs_new_password" ||
    signIn.status === "needs_protect_check"
  ) {
    navigation.recover("login");
    return;
  }

  if (signIn.isTransferable) {
    await expectClerkSuccess(signUp.create({ transfer: true }));
    if ((signUp.status as string) === "complete") {
      await finalizeCompletedResource(signUp, "signup", navigation);
      return;
    }
    navigation.recover("signup");
    return;
  }

  if (signUp.status === "complete") {
    await finalizeCompletedResource(signUp, "signup", navigation);
    return;
  }

  const existingSessionId = signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
  if (existingSessionId) {
    await clerk.setActive({ session: existingSessionId, navigate: navigation.navigateToApp });
    return;
  }

  if (signUp.status === "missing_requirements") {
    navigation.recover(signUp.id ? "signup" : "login");
    return;
  }

  navigation.recover("login");
}

type UseSsoCallbackControllerParams = {
  redirectTo: string;
  replaceLocation?: (url: string) => void;
};

export function useSsoCallbackController({
  redirectTo,
  replaceLocation = (url) => window.location.replace(url),
}: UseSsoCallbackControllerParams) {
  const clerk = useClerk();
  const { fetchStatus: signInFetchStatus, signIn } = useSignIn();
  const { fetchStatus: signUpFetchStatus, signUp } = useSignUp();
  const hasRun = useRef(false);
  const [viewState, setViewState] = useState<SsoCallbackViewState>({ kind: "processing" });
  const [errorMessage, setErrorMessage] = useState<string>();
  const [verificationInfoMessage, setVerificationInfoMessage] = useState<string>();
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const { run: runAuthAction, isRunning } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setResendCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => window.clearTimeout(timeoutId);
  }, [resendCooldownSeconds]);

  const areResourcesIdle = signInFetchStatus === "idle" && signUpFetchStatus === "idle";

  useEffect(() => {
    if (!clerk.loaded || !areResourcesIdle || hasRun.current) return;
    hasRun.current = true;

    void handleSsoCallback(
      { clerk, signIn, signUp },
      {
        navigateToApp: ({ decorateUrl }) => {
          window.location.assign(decorateUrl(redirectTo));
        },
        continueClientTrust: (safeIdentifier, preparedNow) => {
          setErrorMessage(undefined);
          setVerificationInfoMessage(undefined);
          setResendCooldownSeconds(preparedNow ? RESEND_COOLDOWN_SECONDS : 0);
          setViewState({ kind: "client-trust", safeIdentifier });
        },
        recover: (target, message = RECOVERY_MESSAGE) => {
          setErrorMessage(message);
          setViewState({ kind: "recovery", target });
        },
      },
    ).catch((error) => {
      setErrorMessage(getClerkErrorMessage(error));
      setViewState({ kind: "recovery", target: "login" });
    });
  }, [areResourcesIdle, clerk, clerk.loaded, redirectTo, signIn, signUp]);

  const handleVerifyClientTrust = (values: EmailVerificationValues) =>
    runAuthAction(async () => {
      if (!areResourcesIdle || viewState.kind !== "client-trust") return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      try {
        const result = await verifyClientTrustEmailCode(signIn, values.code);
        if (!isCompletedSignIn(result)) {
          setErrorMessage("本人確認が完了しませんでした。\nコードを確認して、もう一度お試しください。");
          return;
        }

        await completeAuthSession({
          resource: signIn,
          redirectTo,
          onErrorMessage: setErrorMessage,
        });
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResendClientTrustCode = () =>
    runAuthAction(async () => {
      if (!areResourcesIdle || viewState.kind !== "client-trust" || resendCooldownSeconds > 0) return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      try {
        await prepareClientTrustEmailCode(signIn);
        setVerificationInfoMessage("新しい確認コードを送りました。");
        setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRestart = (target: SsoCallbackRecoveryTarget) =>
    runAuthAction(async () => {
      if (!areResourcesIdle) return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      try {
        await resetOAuthAttempts({ signIn, signUp });
        replaceLocation(buildRestartAuthUrl(target, redirectTo));
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  return {
    errorMessage,
    isProcessing: viewState.kind === "processing",
    isSubmitting: isRunning || signInFetchStatus === "fetching" || signUpFetchStatus === "fetching",
    resendCooldownSeconds,
    safeIdentifier: viewState.kind === "client-trust" ? viewState.safeIdentifier : undefined,
    verificationInfoMessage,
    viewState,
    onResendClientTrustCode: handleResendClientTrustCode,
    onRestart: handleRestart,
    onVerifyClientTrust: handleVerifyClientTrust,
  };
}
