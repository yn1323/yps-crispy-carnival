import { useSignIn } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { completeAuthSession } from "../completeAuthSession";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { getClerkErrorMessage } from "../errorPresentation";
import type { LoginValues } from "../LoginForm";
import {
  findClientTrustEmailCodeFactor,
  isCompletedSignIn,
  maskEmailAddress,
  prepareClientTrustEmailCode,
  verifyClientTrustEmailCode,
} from "../loginVerification";
import type { LoginStep } from "../types";
import { useGoogleOAuthController } from "../useGoogleOAuthController";

const RESEND_COOLDOWN_SECONDS = 30;

type UseLoginFlowControllerParams = {
  redirectTo: string;
  initialErrorMessage?: string;
};

export function useLoginFlowController({ redirectTo, initialErrorMessage }: UseLoginFlowControllerParams) {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [loginEmailAddressId, setLoginEmailAddressId] = useState<string>();
  const [loginSafeIdentifier, setLoginSafeIdentifier] = useState<string>();
  const [verificationInfoMessage, setVerificationInfoMessage] = useState<string>();
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const { run: runAuthAction, isRunning: isSubmitting } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });
  const { handleGoogle, isLineBrowser } = useGoogleOAuthController({
    authenticateWithRedirect: signIn
      ? () =>
          signIn.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: redirectTo,
          })
      : undefined,
    isResourceLoaded: signInLoaded,
    runAuthAction,
    onErrorMessage: setErrorMessage,
  });

  const completeWithSession = async (sessionId: string | null) => {
    await completeAuthSession({
      sessionId,
      redirectTo,
      activateSession: setActive ? (activeSessionId) => setActive({ session: activeSessionId }) : undefined,
      onErrorMessage: setErrorMessage,
    });
  };

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setResendCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => window.clearTimeout(timeoutId);
  }, [resendCooldownSeconds]);

  const handleLogin = (values: LoginValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
      try {
        const result = await signIn.create({
          strategy: "password",
          identifier: values.email,
          password: values.password,
        });

        if (isCompletedSignIn(result)) {
          await completeWithSession(result.createdSessionId);
          return;
        }

        const emailCodeFactor = findClientTrustEmailCodeFactor({
          status: result.status,
          supportedSecondFactors: result.supportedSecondFactors,
        });
        if (emailCodeFactor) {
          await prepareClientTrustEmailCode(result, emailCodeFactor.emailAddressId);
          setLoginEmailAddressId(emailCodeFactor.emailAddressId);
          setLoginSafeIdentifier(maskEmailAddress(emailCodeFactor.safeIdentifier ?? values.email));
          setVerificationInfoMessage(undefined);
          setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
          setLoginStep("verify-email-code");
          return;
        }

        const status = result.status as string | null;
        setErrorMessage(
          status === "needs_client_trust" || status === "needs_second_factor"
            ? "この方法では本人確認を続けられません。お問い合わせください。"
            : "ログインを完了できませんでした。時間をおいてもう一度お試しください。",
        );
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleVerifyLogin = (values: EmailVerificationValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      try {
        const result = await verifyClientTrustEmailCode(signIn, values.code);
        if (isCompletedSignIn(result)) {
          await completeWithSession(result.createdSessionId);
          return;
        }

        setErrorMessage("本人確認が完了しませんでした。コードを確認してもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResendLoginCode = () =>
    runAuthAction(async () => {
      if (!signInLoaded || resendCooldownSeconds > 0) return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      if (!loginEmailAddressId) {
        setErrorMessage("確認コードを再送できませんでした。ログイン画面に戻ってもう一度お試しください。");
        return;
      }

      try {
        await prepareClientTrustEmailCode(signIn, loginEmailAddressId);
        setVerificationInfoMessage("新しい確認コードを送りました。");
        setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRestartLogin = () => {
    setErrorMessage(undefined);
    setVerificationInfoMessage(undefined);
    setResendCooldownSeconds(0);
    setLoginEmailAddressId(undefined);
    setLoginSafeIdentifier(undefined);
    setLoginStep("credentials");
  };

  return {
    errorMessage,
    isLineBrowser,
    isSubmitting,
    loginSafeIdentifier,
    loginStep,
    resendCooldownSeconds,
    verificationInfoMessage,
    onGoogle: handleGoogle,
    onLogin: handleLogin,
    onResendLoginCode: handleResendLoginCode,
    onRestartLogin: handleRestartLogin,
    onVerifyLogin: handleVerifyLogin,
  };
}
