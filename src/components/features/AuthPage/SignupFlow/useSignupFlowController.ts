import { useSignUp } from "@clerk/react";
import { useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { buildSsoCallbackUrl } from "@/src/lib/auth/redirect";
import { throwIfClerkOperationFailed } from "../clerkOperations";
import { completeAuthSession } from "../completeAuthSession";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { getClerkErrorMessage } from "../errorPresentation";
import type { SignupValues } from "../SignupForm";
import { useGoogleOAuthController } from "../useGoogleOAuthController";

type UseSignupFlowControllerParams = {
  redirectTo: string;
};

export function useSignupFlowController({ redirectTo }: UseSignupFlowControllerParams) {
  const { fetchStatus, signUp } = useSignUp();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const { run: runAuthAction, isRunning } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });
  const { handleGoogle, isLineBrowser } = useGoogleOAuthController({
    authenticateWithRedirect: async () => {
      const result = await signUp.sso({
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
      resource: signUp,
      redirectTo,
      onErrorMessage: setErrorMessage,
    });
  };

  const handleSignup = (values: SignupValues) =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      try {
        const result = await signUp.password({
          emailAddress: values.email,
          password: values.password,
        });
        throwIfClerkOperationFailed(result);

        if (signUp.status === "complete") {
          await completeWithSession();
          return;
        }

        if (signUp.unverifiedFields.includes("email_address")) {
          throwIfClerkOperationFailed(await signUp.verifications.sendEmailCode());
          setIsVerificationStep(true);
          return;
        }

        setErrorMessage("登録に追加情報が必要です。Google登録を使うか、時間をおいてもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleVerifyEmail = (values: EmailVerificationValues) =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      try {
        const result = await signUp.verifications.verifyEmailCode({ code: values.code });
        throwIfClerkOperationFailed(result);
        if (signUp.status === "complete") {
          await completeWithSession();
          return;
        }

        setErrorMessage("メール確認が完了しませんでした。コードを確認してもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRestartSignup = () =>
    runAuthAction(async () => {
      setErrorMessage(undefined);
      try {
        throwIfClerkOperationFailed(await signUp.reset());
        setIsVerificationStep(false);
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  return {
    errorMessage,
    isLineBrowser,
    isSubmitting: isRunning || fetchStatus === "fetching",
    isVerificationStep,
    onGoogle: handleGoogle,
    onRestartSignup: handleRestartSignup,
    onSignup: handleSignup,
    onVerifyEmail: handleVerifyEmail,
  };
}
