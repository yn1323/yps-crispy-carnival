import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { ClerkCaptcha } from "../AuthFormControls";
import { SsoClientTrustView, SsoRecoveryView } from "./SsoCallbackView";
import { useSsoCallbackController } from "./useSsoCallbackController";

export function SsoCallbackPage({ redirectTo }: { redirectTo: string }) {
  const {
    errorMessage,
    isProcessing,
    isSubmitting,
    resendCooldownSeconds,
    safeIdentifier,
    verificationInfoMessage,
    viewState,
    onResendClientTrustCode,
    onRestart,
    onVerifyClientTrust,
  } = useSsoCallbackController({ redirectTo });

  return (
    <>
      <ClerkCaptcha />
      {isProcessing && <FullPageSpinner />}
      {viewState.kind === "client-trust" && (
        <SsoClientTrustView
          errorMessage={errorMessage}
          infoMessage={verificationInfoMessage}
          isSubmitting={isSubmitting}
          resendCooldownSeconds={resendCooldownSeconds}
          safeIdentifier={safeIdentifier}
          onBack={() => onRestart("login")}
          onResend={onResendClientTrustCode}
          onSubmit={onVerifyClientTrust}
        />
      )}
      {viewState.kind === "recovery" && (
        <SsoRecoveryView
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          target={viewState.target}
          onRestart={() => onRestart(viewState.target)}
        />
      )}
    </>
  );
}

export { SsoClientTrustView, SsoRecoveryView } from "./SsoCallbackView";
