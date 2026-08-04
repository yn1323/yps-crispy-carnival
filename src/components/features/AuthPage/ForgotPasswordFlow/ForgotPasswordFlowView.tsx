import { AuthShell } from "../AuthShell";
import { ForgotPasswordForm, type ForgotRequestValues, type ForgotResetValues } from "../ForgotPasswordForm";
import type { ForgotStep } from "../types";

type ForgotPasswordFlowViewProps = {
  email?: string;
  errorMessage?: string;
  isSubmitting?: boolean;
  redirectTo: string;
  step?: ForgotStep;
  onRequestReset: (values: ForgotRequestValues) => void | Promise<void>;
  onResetPassword: (values: ForgotResetValues) => void | Promise<void>;
};

export function ForgotPasswordFlowView({
  email,
  errorMessage,
  isSubmitting,
  redirectTo,
  step,
  onRequestReset,
  onResetPassword,
}: ForgotPasswordFlowViewProps) {
  return (
    <AuthShell title="パスワードを再設定" description="ログインに使うメールアドレスに再設定コードを送信します。">
      <ForgotPasswordForm
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        step={step}
        email={email}
        redirectTo={redirectTo}
        onRequestReset={onRequestReset}
        onResetPassword={onResetPassword}
      />
    </AuthShell>
  );
}
