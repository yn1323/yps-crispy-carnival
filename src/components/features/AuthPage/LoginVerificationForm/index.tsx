import { Stack } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { EmailCodeVerificationForm, type EmailVerificationValues } from "../EmailCodeVerificationForm";
import { maskEmailAddress } from "../loginVerification";

type LoginVerificationFormProps = {
  errorMessage?: string;
  infoMessage?: string;
  isSubmitting?: boolean;
  resendCooldownSeconds?: number;
  safeIdentifier?: string;
  onBack: () => void | Promise<void>;
  onResend: () => void | Promise<void>;
  onSubmit: (values: EmailVerificationValues) => void | Promise<void>;
};

export function LoginVerificationForm({
  errorMessage,
  infoMessage,
  isSubmitting,
  resendCooldownSeconds = 0,
  safeIdentifier = "登録メールアドレス",
  onBack,
  onResend,
  onSubmit,
}: LoginVerificationFormProps) {
  const resendLabel = resendCooldownSeconds > 0 ? `${resendCooldownSeconds}秒後に再送できます` : "確認コードを再送";
  const maskedIdentifier = maskEmailAddress(safeIdentifier);

  return (
    <EmailCodeVerificationForm
      errorMessage={errorMessage}
      infoMessage={infoMessage}
      isSubmitting={isSubmitting}
      description={
        <>
          新しい端末からのログインを確認します。
          <br />
          {maskedIdentifier} に確認コードを送りました。
        </>
      }
      submitLabel="確認してログイン"
      submittingLabel="確認中"
      onSubmit={onSubmit}
      secondaryActions={
        <Stack gap={1}>
          <Button
            type="button"
            variant="ghost"
            colorPalette="teal"
            disabled={isSubmitting || resendCooldownSeconds > 0}
            onClick={onResend}
          >
            {resendLabel}
          </Button>
          <Button type="button" variant="ghost" color="gray.700" disabled={isSubmitting} onClick={onBack}>
            ログイン画面に戻る
          </Button>
        </Stack>
      }
    />
  );
}
