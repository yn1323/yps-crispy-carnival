import { useSignIn } from "@clerk/react";
import { useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { throwIfClerkOperationFailed } from "../clerkOperations";
import { completeAuthSession } from "../completeAuthSession";
import { getClerkErrorMessage } from "../errorPresentation";
import type { ForgotRequestValues, ForgotResetValues } from "../ForgotPasswordForm";
import type { ForgotStep } from "../types";

type UseForgotPasswordFlowControllerParams = {
  redirectTo: string;
};

export function useForgotPasswordFlowController({ redirectTo }: UseForgotPasswordFlowControllerParams) {
  const { fetchStatus, signIn } = useSignIn();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [step, setStep] = useState<ForgotStep>("request");
  const [email, setEmail] = useState("");
  const { run: runAuthAction, isRunning } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });

  const completeWithSession = async () => {
    await completeAuthSession({
      resource: signIn,
      redirectTo,
      onErrorMessage: setErrorMessage,
    });
  };

  const handleRequestReset = (values: ForgotRequestValues) =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      try {
        throwIfClerkOperationFailed(
          await signIn.create({
            identifier: values.email,
          }),
        );
        throwIfClerkOperationFailed(await signIn.resetPasswordEmailCode.sendCode());
        setEmail(values.email);
        setStep("reset");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResetPassword = (values: ForgotResetValues) =>
    runAuthAction(async () => {
      if (fetchStatus !== "idle") return;

      setErrorMessage(undefined);
      try {
        throwIfClerkOperationFailed(await signIn.resetPasswordEmailCode.verifyCode({ code: values.code }));
        if (signIn.status !== "needs_new_password") {
          setErrorMessage("パスワードを再設定できませんでした。\nコードを確認して、もう一度お試しください。");
          return;
        }
        throwIfClerkOperationFailed(await signIn.resetPasswordEmailCode.submitPassword({ password: values.password }));

        if ((signIn.status as string) === "complete") {
          await completeWithSession();
          return;
        }

        setErrorMessage("パスワードを再設定できませんでした。\nコードを確認して、もう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  return {
    email,
    errorMessage,
    isSubmitting: isRunning || fetchStatus === "fetching",
    step,
    onRequestReset: handleRequestReset,
    onResetPassword: handleResetPassword,
  };
}
