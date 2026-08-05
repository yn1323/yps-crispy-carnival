import { Alert, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";

const emailSchema = z.object({ email: requiredEmailSchema });

type EmailValues = z.infer<typeof emailSchema>;
type LoginEmailChangeStep = "input" | "verification";
type LoginEmailChangeStatus = "idle" | "loading" | "success" | "error";

type LoginEmailChangeDialogProps = {
  isOpen: boolean;
  step: LoginEmailChangeStep;
  targetEmailAddress: string | null;
  status: LoginEmailChangeStatus;
  message: string | null;
  onClose: (force?: boolean) => void;
  onSubmitEmail: (email: string) => unknown | Promise<unknown>;
  onSubmitCode: (code: string) => unknown | Promise<unknown>;
  onResendCode: () => unknown | Promise<unknown>;
  onBackToInput: () => void;
  reverification: LoginMethodReverificationController;
};

export function LoginEmailChangeDialog({
  isOpen,
  step,
  targetEmailAddress,
  status,
  message,
  onClose,
  onSubmitEmail,
  onSubmitCode,
  onResendCode,
  onBackToInput,
  reverification,
}: LoginEmailChangeDialogProps) {
  const isBusy = status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationSubmitting =
    reverification.state.status === "submitting" || reverification.state.status === "completing";
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      reverification.cancel();
      onClose(true);
      return;
    }
    if (!isBusy) onClose();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : dialogTitle(step)}
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={isReverifying ? isReverificationSubmitting : isBusy}
      hideFooter
      keyboardAwareViewport
      maxW={{ base: "100vw", md: "560px" }}
      maxH={{ base: "100dvh", md: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", md: "auto" },
        my: { base: 0, md: "auto" },
        borderRadius: { base: 0, md: "l3" },
      }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 2, pb: { base: 6, md: 6 } }}
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying && isOpen && step === "input" ? (
        <EmailInputStep
          isBusy={isBusy}
          status={status}
          message={message}
          onClose={requestClose}
          onSubmit={onSubmitEmail}
        />
      ) : null}
      {!isReverifying && isOpen && step === "verification" ? (
        <Stack gap={5}>
          <Text color="fg.muted">
            {targetEmailAddress ?? "入力したメールアドレス"}
            に確認コードを送りました。メールに届いたコードを入力してください。
          </Text>
          <EmailCodeVerificationForm
            errorMessage={status === "error" ? (message ?? undefined) : undefined}
            isSubmitting={isBusy}
            submitLabel="メールを確認"
            submittingLabel="確認中"
            onSubmit={async ({ code }) => {
              await onSubmitCode(code);
            }}
            secondaryActions={
              <Stack direction={{ base: "column", sm: "row" }} justify="space-between" gap={2}>
                <Button type="button" variant="ghost" onClick={onBackToInput} disabled={isBusy}>
                  入力し直す
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void onResendCode();
                  }}
                  disabled={isBusy}
                >
                  確認コードを再送
                </Button>
              </Stack>
            }
          />
        </Stack>
      ) : null}
    </Dialog>
  );
}

function EmailInputStep({
  isBusy,
  status,
  message,
  onClose,
  onSubmit,
}: {
  isBusy: boolean;
  status: LoginEmailChangeStatus;
  message: string | null;
  onClose: () => void;
  onSubmit: (email: string) => unknown | Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(async ({ email }) => onSubmit(email))}>
      <Text color="fg.muted">
        新しいメールアドレスが未確認の場合は、確認コードを送ります。
        <br />
        シフト連絡先メールアドレスやGoogle連携は変わりません。
      </Text>
      <StepMessage status={status} message={message} />
      <Field.Root invalid={Boolean(errors.email)}>
        <Field.Label>新しいメールアドレス</Field.Label>
        <Input
          type="email"
          autoComplete="email"
          placeholder="例：login@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          {...register("email")}
        />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={isBusy} loadingText="確認中">
          次へ
        </Button>
      </Stack>
    </Stack>
  );
}

function StepMessage({ status, message }: { status: LoginEmailChangeStatus; message: string | null }) {
  if (!message || status !== "error") return null;

  return (
    <Alert.Root status="error" borderRadius="lg" alignItems="flex-start">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{message}</Alert.Description>
    </Alert.Root>
  );
}

function dialogTitle(step: LoginEmailChangeStep) {
  if (step === "verification") return "確認コードを入力";
  return "メールアドレスを変更";
}
