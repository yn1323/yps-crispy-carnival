import { AuthShell } from "../AuthShell";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { SignupForm, type SignupValues } from "../SignupForm";

type SignupFlowViewProps = {
  errorMessage?: string;
  isLineBrowser?: boolean;
  isSubmitting?: boolean;
  isVerificationStep?: boolean;
  redirectTo: string;
  onGoogle: () => void | Promise<void>;
  onRestartSignup: () => void | Promise<void>;
  onSignup: (values: SignupValues) => void | Promise<void>;
  onVerifyEmail: (values: EmailVerificationValues) => void | Promise<void>;
};

export function SignupFlowView({
  errorMessage,
  isLineBrowser,
  isSubmitting,
  isVerificationStep,
  redirectTo,
  onGoogle,
  onRestartSignup,
  onSignup,
  onVerifyEmail,
}: SignupFlowViewProps) {
  return (
    <AuthShell title="シフトリをはじめる">
      <SignupForm
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        isVerificationStep={isVerificationStep}
        isLineBrowser={isLineBrowser}
        redirectTo={redirectTo}
        onGoogle={onGoogle}
        onSubmit={onSignup}
        onVerifyEmail={onVerifyEmail}
        onRestartSignup={onRestartSignup}
      />
    </AuthShell>
  );
}
