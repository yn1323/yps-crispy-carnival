import { useSignIn } from "@clerk/react";
import { useEffect, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { buildSsoCallbackUrl } from "@/src/lib/auth/redirect";
import { throwIfClerkOperationFailed } from "../clerkOperations";
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
  const { fetchStatus, signIn } = useSignIn();
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [loginSafeIdentifier, setLoginSafeIdentifier] = useState<string>();
  const [verificationInfoMessage, setVerificationInfoMessage] = useState<string>();
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const { run: runAuthAction, isRunning } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });
  const { handleGoogle, isLineBrowser } = useGoogleOAuthController({
    authenticateWithRedirect: async () => {
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: buildSsoCallbackUrl(redirectTo),
        redirectUrl: redirectTo,
      });
      throwIfClerkOperationFailed(result);
    },
    isResourceLoaded: fetchStatus === "idle",
    runAuthAction,
    onErrorMessage: setErrorMessage,
  });

  const completeWithSession = async () => {
    await completeAuthSession({
      resource: signIn,
      redirectTo,
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
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      try {
        const result = await signIn.password({
          emailAddress: values.email,
          password: values.password,
        });
        throwIfClerkOperationFailed(result);

        if (isCompletedSignIn(signIn)) {
          await completeWithSession();
          return;
        }

        const emailCodeFactor = findClientTrustEmailCodeFactor({
          status: signIn.status,
          supportedSecondFactors: signIn.supportedSecondFactors,
        });
        if (emailCodeFactor) {
          await prepareClientTrustEmailCode(signIn);
          setLoginSafeIdentifier(maskEmailAddress(emailCodeFactor.safeIdentifier ?? values.email));
          setVerificationInfoMessage(undefined);
          setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
          setLoginStep("verify-email-code");
          return;
        }

        const status = signIn.status as string | null;
        setErrorMessage(
          status === "needs_client_trust" || status === "needs_second_factor"
            ? "この方法では本人確認を続けられません。\nお問い合わせください。"
            : "ログインを完了できませんでした。\n時間をおいて、もう一度お試しください。",
        );
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleVerifyLogin = (values: EmailVerificationValues) =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      try {
        const result = await verifyClientTrustEmailCode(signIn, values.code);
        if (isCompletedSignIn(result)) {
          await completeWithSession();
          return;
        }

        setErrorMessage("本人確認が完了しませんでした。\nコードを確認して、もう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResendLoginCode = () =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle" || resendCooldownSeconds > 0) return;

      setErrorMessage(undefined);
      setVerificationInfoMessage(undefined);
      if (loginStep !== "verify-email-code") {
        setErrorMessage("確認コードを再送できませんでした。\nログイン画面に戻って、もう一度お試しください。");
        return;
      }

      try {
        await prepareClientTrustEmailCode(signIn);
        setVerificationInfoMessage("新しい確認コードを送りました。");
        setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRestartLogin = () =>
    runAuthAction(async () => {
      setErrorMessage(undefined);
      try {
        throwIfClerkOperationFailed(await signIn.reset());
        setVerificationInfoMessage(undefined);
        setResendCooldownSeconds(0);
        setLoginSafeIdentifier(undefined);
        setLoginStep("credentials");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  return {
    errorMessage,
    isLineBrowser,
    isSubmitting: isRunning || fetchStatus === "fetching",
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
