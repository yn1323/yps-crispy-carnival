import { AuthShell } from "../AuthShell";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { LoginForm, type LoginValues } from "../LoginForm";
import { LoginVerificationForm } from "../LoginVerificationForm";
import type { LoginStep } from "../types";

type LoginFlowViewProps = {
  errorMessage?: string;
  isLineBrowser?: boolean;
  isSubmitting?: boolean;
  loginSafeIdentifier?: string;
  loginStep?: LoginStep;
  redirectTo: string;
  resendCooldownSeconds?: number;
  verificationInfoMessage?: string;
  onGoogle: () => void | Promise<void>;
  onLogin: (values: LoginValues) => void | Promise<void>;
  onResendLoginCode: () => void | Promise<void>;
  onRestartLogin: () => void | Promise<void>;
  onVerifyLogin: (values: EmailVerificationValues) => void | Promise<void>;
};

export function LoginFlowView({
  errorMessage,
  isLineBrowser,
  isSubmitting,
  loginSafeIdentifier,
  loginStep = "credentials",
  redirectTo,
  resendCooldownSeconds,
  verificationInfoMessage,
  onGoogle,
  onLogin,
  onResendLoginCode,
  onRestartLogin,
  onVerifyLogin,
}: LoginFlowViewProps) {
  const isVerificationStep = loginStep === "verify-email-code";

  return (
    <AuthShell title={isVerificationStep ? "本人確認" : "シフトリにログイン"}>
      {isVerificationStep ? (
        <LoginVerificationForm
          errorMessage={errorMessage}
          infoMessage={verificationInfoMessage}
          isSubmitting={isSubmitting}
          resendCooldownSeconds={resendCooldownSeconds}
          safeIdentifier={loginSafeIdentifier}
          onBack={onRestartLogin}
          onResend={onResendLoginCode}
          onSubmit={onVerifyLogin}
        />
      ) : (
        <LoginForm
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          isLineBrowser={isLineBrowser}
          redirectTo={redirectTo}
          onGoogle={onGoogle}
          onSubmit={onLogin}
        />
      )}
    </AuthShell>
  );
}
