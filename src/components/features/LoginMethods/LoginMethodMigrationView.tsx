import { Alert, Box, Checkbox, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodMigrationFeedback } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { EmailPasswordMigrationController } from "./useEmailPasswordMigrationController";
import type { GoogleConnectionController } from "./useGoogleConnectionController";

const emailSchema = z.object({ email: requiredEmailSchema });
const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください。"),
    confirmation: z.string(),
    signOutOfOtherSessions: z.boolean(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ["confirmation"],
    message: "確認用パスワードが一致しません。",
  });

type EmailValues = z.infer<typeof emailSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export type LoginMethodMigrationViewProps = {
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
} & (
  | { flow: "add-email-password"; controller: EmailPasswordMigrationController }
  | { flow: "connect-google"; controller: GoogleConnectionController }
);

export function LoginMethodMigrationView(props: LoginMethodMigrationViewProps) {
  const isReverifying = props.reverification.state.status !== "idle";
  const isReverificationSubmitting =
    props.reverification.state.status === "submitting" || props.reverification.state.status === "completing";
  const isBusy = props.controller.state.feedback.status === "loading";
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      props.reverification.cancel();
    }
    if (!isBusy) props.onBackToOverview();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : flowTitle(props.flow)}
      isOpen
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
      {isReverifying ? <LoginMethodReverificationView controller={props.reverification} /> : null}
      {!isReverifying && props.flow === "add-email-password" ? (
        <EmailPasswordMigrationContent controller={props.controller} />
      ) : null}
      {!isReverifying && props.flow === "connect-google" ? (
        <GoogleConnectionContent controller={props.controller} />
      ) : null}
    </Dialog>
  );
}

function EmailPasswordMigrationContent({ controller }: { controller: EmailPasswordMigrationController }) {
  const { state } = controller;
  return (
    <Stack gap={5}>
      {state.phase !== "unavailable" && state.phase !== "verifyingEmail" ? (
        <FeedbackError feedback={state.feedback} />
      ) : null}
      {state.phase === "choosingEmail" ? <EmailChoiceStep controller={controller} /> : null}
      {state.phase === "verifyingEmail" ? <EmailVerificationStep controller={controller} /> : null}
      {state.phase === "settingPassword" ? <PasswordStep controller={controller} /> : null}
      {state.phase === "unavailable" ? (
        <UnavailableState
          message="メールアドレスとパスワードを設定できません。Google認証は変更されていません。"
          onRetry={controller.refresh}
        />
      ) : null}
    </Stack>
  );
}

function GoogleConnectionContent({ controller }: { controller: GoogleConnectionController }) {
  const { state } = controller;
  const busy = state.feedback.status === "loading";
  return (
    <Stack gap={5}>
      {state.phase !== "unavailable" ? <FeedbackError feedback={state.feedback} /> : null}
      {state.phase === "readyToConnect" ? (
        <Stack gap={5}>
          <Box>
            <Text fontSize="lg" fontWeight="semibold">
              Googleアカウントを選択します
            </Text>
            <Text mt={2} color="fg.muted">
              Google側の画面で、シフトリへのログインに使うアカウントを選択してください。現在のメールアドレスとパスワードは残ります。
            </Text>
          </Box>
          <Button
            alignSelf={{ base: "stretch", sm: "flex-start" }}
            colorPalette="teal"
            size="lg"
            loading={busy}
            loadingText="確認中"
            onClick={() => {
              void controller.start();
            }}
          >
            Googleアカウントを選ぶ
          </Button>
        </Stack>
      ) : null}
      {state.phase === "redirecting" ? (
        <StatusState title="Googleの画面を開いています" description="アカウント選択画面へ移動します。" />
      ) : null}
      {state.phase === "settling" ? (
        <StatusState
          title="Googleログインを確認しています"
          description="確認が終わるまでこの画面を閉じないでください。"
        />
      ) : null}
      {state.phase === "unavailable" ? (
        <UnavailableState
          message={state.feedback.message ?? "Googleログインは現在追加できません。"}
          onRetry={controller.refresh}
        />
      ) : null}
    </Stack>
  );
}

function EmailChoiceStep({ controller }: { controller: EmailPasswordMigrationController }) {
  const selectCurrentEmail = controller.useCurrentEmail;
  const selectDifferentEmail = controller.useDifferentEmail;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack gap={5}>
      <Box>
        <Text fontSize="lg" fontWeight="semibold">
          ログインに使うメールアドレス
        </Text>
        <Text mt={2} color="fg.muted">
          登録済みの確認済みメールを使うか、別のメールアドレスを追加できます。Google認証は解除しません。
        </Text>
      </Box>
      <Button
        variant="outline"
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        disabled={busy}
        onClick={() => {
          void selectCurrentEmail();
        }}
      >
        現在のメールを使う
      </Button>
      <Stack
        as="form"
        gap={4}
        onSubmit={handleSubmit(async ({ email }) => {
          await selectDifferentEmail(email);
        })}
      >
        <Field.Root invalid={Boolean(errors.email)}>
          <Field.Label>別のメールアドレス</Field.Label>
          <Input
            type="email"
            autoComplete="email"
            placeholder="例：login@example.com"
            maxLength={EMAIL_MAX_LENGTH}
            {...register("email")}
          />
          <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
        </Field.Root>
        <Button
          type="submit"
          colorPalette="teal"
          alignSelf={{ base: "stretch", sm: "flex-start" }}
          loading={busy}
          loadingText="確認中"
        >
          このメールを使う
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
        {controller.state.targetEmailAddress ?? "入力したメールアドレス"}
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
          <HStack justify="space-between" flexWrap="wrap">
            <Button type="button" variant="ghost" disabled={feedback.status === "loading"} onClick={controller.reset}>
              メールアドレスを選び直す
            </Button>
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
    defaultValues: { newPassword: "", confirmation: "", signOutOfOtherSessions: false },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={handleSubmit(async ({ newPassword, signOutOfOtherSessions }) => {
        await controller.setPassword({ newPassword, signOutOfOtherSessions });
      })}
    >
      <Box>
        <Text fontSize="lg" fontWeight="semibold">
          パスワードを設定します
        </Text>
        <Text mt={2} color="fg.muted">
          確認済みのメールアドレスと組み合わせる新しいパスワードを入力してください。
        </Text>
      </Box>
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
      <Checkbox.Root>
        <Checkbox.HiddenInput {...register("signOutOfOtherSessions")} />
        <Checkbox.Control />
        <Checkbox.Label>ほかの端末からログアウトする</Checkbox.Label>
      </Checkbox.Root>
      <HStack gap={3} flexWrap="wrap">
        <Button type="button" variant="ghost" disabled={busy} onClick={controller.reset}>
          メールアドレスを選び直す
        </Button>
        <Button type="submit" colorPalette="teal" size="lg" loading={busy} loadingText="設定中">
          パスワードを設定
        </Button>
      </HStack>
    </Stack>
  );
}

function FeedbackError({ feedback }: { feedback: LoginMethodMigrationFeedback }) {
  if (feedback.status !== "error" || !feedback.message) return null;
  return (
    <Alert.Root status="error" role="alert" aria-live="assertive" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{feedback.message}</Alert.Description>
    </Alert.Root>
  );
}

function StatusState({ title, description }: { title: string; description: string }) {
  return (
    <Stack gap={2} aria-live="polite">
      <Text fontSize="lg" fontWeight="semibold">
        {title}
      </Text>
      <Text color="fg.muted">{description}</Text>
    </Stack>
  );
}

function UnavailableState({ message, onRetry }: { message: string; onRetry: () => Promise<boolean | undefined> }) {
  return (
    <Stack gap={4}>
      <Alert.Root status="error" borderRadius="lg">
        <Alert.Indicator />
        <Alert.Description>{message}</Alert.Description>
      </Alert.Root>
      <Button
        variant="outline"
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        onClick={() => {
          void onRetry();
        }}
      >
        もう一度試す
      </Button>
    </Stack>
  );
}

function flowTitle(flow: LoginMethodMigrationViewProps["flow"]) {
  return flow === "add-email-password" ? "メールアドレスとパスワードを設定" : "Googleログインを追加";
}
