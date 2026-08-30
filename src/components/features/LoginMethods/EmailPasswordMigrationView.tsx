import { Alert, Field, Skeleton, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { Input } from "@/src/components/ui/FormControls";
import { LoginMethodEmailCodeForm } from "./LoginMethodEmailCodeForm";
import { MigrationFeedbackError } from "./LoginMethodMigrationState";
import { type PasswordSetupValues, passwordSetupSchema } from "./passwordSchema";
import type { EmailPasswordMigrationController } from "./useEmailPasswordMigrationController";

const emailSchema = z.object({ email: requiredEmailSchema });

type EmailValues = z.infer<typeof emailSchema>;

export const EMAIL_MIGRATION_EMAIL_FORM_ID = "login-method-migration-email";
export const EMAIL_MIGRATION_CODE_FORM_ID = "login-method-migration-code";
export const EMAIL_MIGRATION_PASSWORD_FORM_ID = "login-method-migration-password";

export function EmailPasswordMigrationView({ controller }: { controller: EmailPasswordMigrationController }) {
  const { state } = controller;
  return (
    <Stack gap={5}>
      {state.phase !== "unavailable" && state.phase !== "verifyingEmail" ? (
        <MigrationFeedbackError feedback={state.feedback} />
      ) : null}
      {state.phase === "loading" ? <EmailPasswordMigrationSkeleton /> : null}
      {state.phase === "choosingEmail" ? <EmailChoiceStep controller={controller} /> : null}
      {state.phase === "verifyingEmail" ? <EmailVerificationStep controller={controller} /> : null}
      {state.phase === "settingPassword" ? <PasswordStep controller={controller} /> : null}
      {state.phase === "unavailable" ? (
        <Alert.Root status="error" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>メールアドレスとパスワードを設定できませんでした。</Alert.Description>
        </Alert.Root>
      ) : null}
    </Stack>
  );
}

function EmailChoiceStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const selectDifferentEmail = controller.useDifferentEmail;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: controller.state.targetEmailAddress ?? "" },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack
      as="form"
      id={EMAIL_MIGRATION_EMAIL_FORM_ID}
      gap={4}
      onSubmit={handleSubmit(async ({ email }) => {
        await selectDifferentEmail(email);
      })}
    >
      <Field.Root invalid={Boolean(errors.email)}>
        <Field.Label>メールアドレス</Field.Label>
        <Input
          type="email"
          autocompletePolicy="auth"
          autoComplete="email"
          placeholder="login@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          disabled={busy}
          {...register("email")}
        />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Text color="fg.muted">メール・パスワードでもログインできるようにします</Text>
    </Stack>
  );
}

function EmailVerificationStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const feedback = controller.state.feedback;
  return (
    <Stack gap={5}>
      <Text color="fg.muted">
        {controller.state.targetEmailAddress ?? "入力したメールアドレス"}
        に確認コードを送りました。
        <br />
        届いたコードを入力してください。
      </Text>
      <LoginMethodEmailCodeForm
        formId={EMAIL_MIGRATION_CODE_FORM_ID}
        errorMessage={feedback.status === "error" ? (feedback.message ?? undefined) : undefined}
        isBusy={feedback.status === "loading"}
        onSubmit={controller.verifyEmail}
        onResend={controller.resendEmailCode}
      />
    </Stack>
  );
}

function PasswordStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordSetupValues>({
    resolver: zodResolver(passwordSetupSchema),
    defaultValues: { newPassword: "", confirmation: "" },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack
      as="form"
      id={EMAIL_MIGRATION_PASSWORD_FORM_ID}
      gap={5}
      onSubmit={handleSubmit(async ({ newPassword }) => {
        await controller.setPassword(newPassword);
      })}
    >
      <Field.Root invalid={Boolean(errors.newPassword)}>
        <Field.Label>新しいパスワード</Field.Label>
        <Input
          type="password"
          autocompletePolicy="auth"
          autoComplete="new-password"
          placeholder="******"
          disabled={busy}
          {...register("newPassword")}
        />
        <Field.ErrorText>{errors.newPassword?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={Boolean(errors.confirmation)}>
        <Field.Label>新しいパスワード（確認）</Field.Label>
        <Input
          type="password"
          autocompletePolicy="auth"
          autoComplete="new-password"
          placeholder="******"
          disabled={busy}
          {...register("confirmation")}
        />
        <Field.ErrorText>{errors.confirmation?.message}</Field.ErrorText>
      </Field.Root>
    </Stack>
  );
}

function EmailPasswordMigrationSkeleton() {
  return (
    <Stack gap={5} aria-label="メールアドレス設定フォームを読み込み中">
      <Stack gap={2}>
        <Skeleton h="20px" w="112px" />
        <Skeleton h="40px" w="full" borderRadius="md" />
      </Stack>
      <Skeleton h="16px" w="184px" />
    </Stack>
  );
}
