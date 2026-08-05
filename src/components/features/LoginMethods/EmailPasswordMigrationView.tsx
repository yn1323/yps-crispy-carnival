import { Field, HStack, Input, Skeleton, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { Button } from "@/src/components/ui/Button";
import { MigrationFeedbackError, MigrationUnavailableState } from "./LoginMethodMigrationState";
import type { EmailPasswordMigrationController } from "./useEmailPasswordMigrationController";

const emailSchema = z.object({ email: requiredEmailSchema });
const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください。"),
    confirmation: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ["confirmation"],
    message: "確認用パスワードが一致しません。",
  });

type EmailValues = z.infer<typeof emailSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export function EmailPasswordMigrationView({
  controller,
  onCancel,
}: {
  controller: EmailPasswordMigrationController;
  onCancel: () => void;
}) {
  const { state } = controller;
  return (
    <Stack gap={5}>
      {state.phase !== "unavailable" && state.phase !== "verifyingEmail" ? (
        <MigrationFeedbackError feedback={state.feedback} />
      ) : null}
      {state.phase === "loading" ? <EmailPasswordMigrationSkeleton /> : null}
      {state.phase === "choosingEmail" ? <EmailChoiceStep controller={controller} onCancel={onCancel} /> : null}
      {state.phase === "verifyingEmail" ? <EmailVerificationStep controller={controller} /> : null}
      {state.phase === "settingPassword" ? <PasswordStep controller={controller} /> : null}
      {state.phase === "unavailable" ? (
        <MigrationUnavailableState
          message="メールアドレスとパスワードを設定できません。Google認証は変更されていません。"
          onRetry={controller.refresh}
        />
      ) : null}
    </Stack>
  );
}

function EmailChoiceStep({
  controller,
  onCancel,
}: {
  controller: EmailPasswordMigrationController;
  onCancel: () => void;
}) {
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
      gap={4}
      onSubmit={handleSubmit(async ({ email }) => {
        await selectDifferentEmail(email);
      })}
    >
      <Field.Root invalid={Boolean(errors.email)}>
        <Field.Label>メールアドレス</Field.Label>
        <Input
          type="email"
          autoComplete="email"
          placeholder="例：login@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          {...register("email")}
        />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Text color="fg.muted">Google認証は解除しません。</Text>
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={busy} loadingText="確認中">
          決定
        </Button>
      </Stack>
    </Stack>
  );
}

function EmailVerificationStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const feedback = controller.state.feedback;
  return (
    <Stack gap={5}>
      <Text color="fg.muted">
        {controller.state.targetEmailAddress
          ? maskEmailAddress(controller.state.targetEmailAddress)
          : "入力したメールアドレス"}
        に確認コードを送りました。メールに届いたコードを入力してください。
      </Text>
      <EmailCodeVerificationForm
        errorMessage={feedback.status === "error" ? (feedback.message ?? undefined) : undefined}
        isSubmitting={feedback.status === "loading"}
        submitLabel="メールを確認"
        submittingLabel="確認中"
        onSubmit={async ({ code }) => {
          await controller.verifyEmail(code);
        }}
        secondaryActions={
          <HStack justify="flex-end" flexWrap="wrap">
            <Button
              type="button"
              variant="ghost"
              disabled={feedback.status === "loading"}
              onClick={() => {
                void controller.resendEmailCode();
              }}
            >
              確認コードを再送
            </Button>
          </HStack>
        }
      />
    </Stack>
  );
}

function PasswordStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmation: "" },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={handleSubmit(async ({ newPassword }) => {
        await controller.setPassword(newPassword);
      })}
    >
      <Field.Root invalid={Boolean(errors.newPassword)}>
        <Field.Label>新しいパスワード</Field.Label>
        <Input type="password" autoComplete="new-password" {...register("newPassword")} />
        <Field.ErrorText>{errors.newPassword?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={Boolean(errors.confirmation)}>
        <Field.Label>新しいパスワード（確認）</Field.Label>
        <Input type="password" autoComplete="new-password" {...register("confirmation")} />
        <Field.ErrorText>{errors.confirmation?.message}</Field.ErrorText>
      </Field.Root>
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="ghost" disabled={busy} onClick={controller.reset}>
          戻る
        </Button>
        <Button type="submit" colorPalette="teal" size="lg" loading={busy} loadingText="設定中">
          決定
        </Button>
      </Stack>
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
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Skeleton h="40px" w="96px" borderRadius="md" />
        <Skeleton h="40px" w="72px" borderRadius="md" />
      </Stack>
    </Stack>
  );
}
