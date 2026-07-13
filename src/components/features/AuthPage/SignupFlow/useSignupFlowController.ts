import { useSignUp } from "@clerk/clerk-react";
import { useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { completeAuthSession } from "../completeAuthSession";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { getClerkErrorMessage } from "../errorPresentation";
import type { SignupValues } from "../SignupForm";
import { useGoogleOAuthController } from "../useGoogleOAuthController";

type UseSignupFlowControllerParams = {
  redirectTo: string;
};

export function useSignupFlowController({ redirectTo }: UseSignupFlowControllerParams) {
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const { run: runAuthAction, isRunning: isSubmitting } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });
  const { handleGoogle, isLineBrowser } = useGoogleOAuthController({
    authenticateWithRedirect: signUp
      ? () =>
          signUp.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: redirectTo,
          })
      : undefined,
    isResourceLoaded: signUpLoaded,
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

  const handleSignup = (values: SignupValues) =>
    runAuthAction(async () => {
      if (!signUpLoaded) return;

      setErrorMessage(undefined);
      try {
        const result = await signUp.create({
          emailAddress: values.email,
          password: values.password,
        });

        if (result.status === "complete") {
          await completeWithSession(result.createdSessionId);
          return;
        }

        if (result.unverifiedFields.includes("email_address")) {
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
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
      if (!signUpLoaded) return;

      setErrorMessage(undefined);
      try {
        const result = await signUp.attemptEmailAddressVerification({ code: values.code });
        if (result.status === "complete") {
          await completeWithSession(result.createdSessionId);
          return;
        }

        setErrorMessage("メール確認が完了しませんでした。コードを確認してもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRestartSignup = () => {
    setErrorMessage(undefined);
    setIsVerificationStep(false);
  };

  return {
    errorMessage,
    isLineBrowser,
    isSubmitting,
    isVerificationStep,
    onGoogle: handleGoogle,
    onRestartSignup: handleRestartSignup,
    onSignup: handleSignup,
    onVerifyEmail: handleVerifyEmail,
  };
}
