import { Alert, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import { LoginMethodEmailCodeForm } from "./LoginMethodEmailCodeForm";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";

const emailSchema = z.object({ email: requiredEmailSchema });

type EmailValues = z.infer<typeof emailSchema>;
type LoginEmailChangeStep = "input" | "verification";
type LoginEmailChangeStatus = "idle" | "loading" | "success" | "error";

const LOGIN_EMAIL_INPUT_FORM_ID = "login-email-change-input";
const LOGIN_EMAIL_CODE_FORM_ID = "login-email-change-code";

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
  const [restoreInputFocus, setRestoreInputFocus] = useState(false);
  const isBusy = status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationBusy = isLoginMethodReverificationBusy(reverification);
  const dialogBusy = isReverifying ? isReverificationBusy : isBusy;
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationBusy) return;
      reverification.cancel();
      onClose(true);
      return;
    }
    if (!isBusy) {
      setRestoreInputFocus(false);
      onClose();
    }
  };
  const handleBackToInput = () => {
    setRestoreInputFocus(true);
    onBackToInput();
  };

  const footer = isReverifying ? (
    <LoginMethodReverificationActions controller={reverification} />
  ) : step === "verification" ? (
    <DialogActionArea
      layout="flow"
      mobileLayout="inline"
      startAction={
        <Button type="button" variant="outline" onClick={handleBackToInput} disabled={isBusy}>
          入力し直す
        </Button>
      }
      endAction={
        <Button type="submit" form={LOGIN_EMAIL_CODE_FORM_ID} colorPalette="teal" loading={isBusy} loadingText="確認中">
          メールを確認
        </Button>
      }
    />
  ) : undefined;

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : dialogTitle(step)}
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={dialogBusy}
      isLoading={dialogBusy}
      formId={!isReverifying && step === "input" ? LOGIN_EMAIL_INPUT_FORM_ID : undefined}
      submitLabel="次へ"
      footer={footer}
      mobileActionLayout="inline"
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "86dvh" }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 2, pb: { base: 6, md: 6 } }}
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying && isOpen && step === "input" ? (
        <EmailInputStep
          isBusy={isBusy}
          status={status}
          message={message}
          restoreFocus={restoreInputFocus}
          onFocusRestored={() => setRestoreInputFocus(false)}
          onSubmit={onSubmitEmail}
        />
      ) : null}
      {!isReverifying && isOpen && step === "verification" ? (
        <Stack gap={5}>
          <Text color="fg.muted">
            {targetEmailAddress ?? "入力したメールアドレス"}
            に確認コードを送りました。メールに届いたコードを入力してください。
          </Text>
          <LoginMethodEmailCodeForm
            formId={LOGIN_EMAIL_CODE_FORM_ID}
            errorMessage={status === "error" ? (message ?? undefined) : undefined}
            isBusy={isBusy}
            onSubmit={onSubmitCode}
            onResend={onResendCode}
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
  restoreFocus,
  onFocusRestored,
  onSubmit,
}: {
  isBusy: boolean;
  status: LoginEmailChangeStatus;
  message: string | null;
  restoreFocus: boolean;
  onFocusRestored: () => void;
  onSubmit: (email: string) => unknown | Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailRegistration = register("email");

  useEffect(() => {
    if (!restoreFocus) return;
    emailInputRef.current?.focus();
    onFocusRestored();
  }, [onFocusRestored, restoreFocus]);

  return (
    <Stack
      as="form"
      id={LOGIN_EMAIL_INPUT_FORM_ID}
      gap={5}
      onSubmit={handleSubmit(async ({ email }) => onSubmit(email))}
    >
      <Text color="fg.muted">
        新しいメールアドレスが未確認の場合は、確認コードを送ります。
        <br />
        変更が完了すると、以前のログイン用メールアドレスは削除されます。
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
          disabled={isBusy}
          {...emailRegistration}
          ref={(element) => {
            emailRegistration.ref(element);
            emailInputRef.current = element;
          }}
        />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
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
