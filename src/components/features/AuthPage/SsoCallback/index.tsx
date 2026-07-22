import { SignIn, SignUp } from "@clerk/react";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { LoginFlow } from "../LoginFlow";
import { useSsoCallbackController } from "./useSsoCallbackController";

export function SsoCallbackPage({ redirectTo }: { redirectTo: string }) {
  const { continuation, errorMessage, isProcessing } = useSsoCallbackController({ redirectTo });

  return (
    <>
      <div id="clerk-captcha" />
      {isProcessing && !errorMessage && <FullPageSpinner />}
      {continuation === "sign-in" && <SignIn routing="hash" forceRedirectUrl={redirectTo} />}
      {continuation === "sign-up" && <SignUp routing="hash" forceRedirectUrl={redirectTo} />}
      {errorMessage && <LoginFlow redirectTo={redirectTo} initialErrorMessage={errorMessage} />}
    </>
  );
}
