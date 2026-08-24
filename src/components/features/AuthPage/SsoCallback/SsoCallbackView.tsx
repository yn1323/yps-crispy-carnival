import { Box, Spinner, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/Button";
import { AuthError } from "../AuthFormControls";
import { AuthShell } from "../AuthShell";
import type { EmailVerificationValues } from "../EmailCodeVerificationForm";
import { LoginVerificationForm } from "../LoginVerificationForm";
import type { SsoCallbackRecoveryTarget } from "./useSsoCallbackController";

export function SsoProcessingView({ captcha }: { captcha: ReactNode }) {
  return (
    <Stack as="main" minH="100dvh" align="center" justify="center" gap={6} px={{ base: 4, md: 6 }} py={8} bg="gray.50">
      <Stack role="status" aria-label="認証情報を確認中" align="center" gap={3} textAlign="center">
        <Spinner size="xl" color="teal.600" borderWidth="3px" />
        <Text color="gray.700" textStyle="bodySm">
          認証情報を確認しています
        </Text>
      </Stack>
      <Box w="full" maxW="md">
        {captcha}
      </Box>
    </Stack>
  );
}

type SsoClientTrustViewProps = {
  errorMessage?: string;
  infoMessage?: string;
  isSubmitting?: boolean;
  resendCooldownSeconds?: number;
  safeIdentifier?: string;
  onBack: () => void | Promise<void>;
  onResend: () => void | Promise<void>;
  onSubmit: (values: EmailVerificationValues) => void | Promise<void>;
};

export function SsoClientTrustView({
  errorMessage,
  infoMessage,
  isSubmitting,
  resendCooldownSeconds,
  safeIdentifier,
  onBack,
  onResend,
  onSubmit,
}: SsoClientTrustViewProps) {
  return (
    <AuthShell title="本人確認">
      <LoginVerificationForm
        errorMessage={errorMessage}
        infoMessage={infoMessage}
        isSubmitting={isSubmitting}
        resendCooldownSeconds={resendCooldownSeconds}
        safeIdentifier={safeIdentifier}
        onBack={onBack}
        onResend={onResend}
        onSubmit={onSubmit}
      />
    </AuthShell>
  );
}

type SsoRecoveryViewProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  target: SsoCallbackRecoveryTarget;
  onRestart: () => void | Promise<void>;
};

export function SsoRecoveryView({ errorMessage, isSubmitting, target, onRestart }: SsoRecoveryViewProps) {
  const isSignup = target === "signup";

  return (
    <AuthShell
      title="認証を続けられませんでした"
      description="Google認証の状態を安全に確認できなかったため、この画面では処理を完了していません。"
    >
      <Stack gap={5}>
        <AuthError message={errorMessage} />
        <Text color="gray.700" textStyle="bodySm" lineHeight="1.8">
          {isSignup ? "新規登録画面" : "ログイン画面"}に戻り、Google認証を最初からやり直してください。
        </Text>
        <Button type="button" colorPalette="teal" size="lg" loading={isSubmitting} onClick={onRestart}>
          {isSignup ? "新規登録をやり直す" : "ログインをやり直す"}
        </Button>
      </Stack>
    </AuthShell>
  );
}
