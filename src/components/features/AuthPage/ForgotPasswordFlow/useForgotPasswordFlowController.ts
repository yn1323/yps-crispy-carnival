import { useSignIn } from "@clerk/clerk-react";
import { useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { completeAuthSession } from "../completeAuthSession";
import { getClerkErrorMessage } from "../errorPresentation";
import type { ForgotRequestValues, ForgotResetValues } from "../ForgotPasswordForm";
import type { ForgotStep } from "../types";

type UseForgotPasswordFlowControllerParams = {
  redirectTo: string;
};

export function useForgotPasswordFlowController({ redirectTo }: UseForgotPasswordFlowControllerParams) {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [step, setStep] = useState<ForgotStep>("request");
  const [email, setEmail] = useState("");
  const { run: runAuthAction, isRunning: isSubmitting } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });

  const completeWithSession = async (sessionId: string | null) => {
    await completeAuthSession({
      sessionId,
      redirectTo,
      activateSession: setActive ? (activeSessionId) => setActive({ session: activeSessionId }) : undefined,
      onErrorMessage: setErrorMessage,
    });
  };

  const handleRequestReset = (values: ForgotRequestValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
      try {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: values.email,
        });
        setEmail(values.email);
        setStep("reset");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResetPassword = (values: ForgotResetValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
      try {
        const verified = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code: values.code,
        });
        const result =
          verified.status === "needs_new_password"
            ? await verified.resetPassword({ password: values.password })
            : verified;

        if (result.status === "complete") {
          await completeWithSession(result.createdSessionId);
          return;
        }

        setErrorMessage("パスワードを再設定できませんでした。コードを確認してもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  return {
    email,
    errorMessage,
    isSubmitting,
    step,
    onRequestReset: handleRequestReset,
    onResetPassword: handleResetPassword,
  };
}
