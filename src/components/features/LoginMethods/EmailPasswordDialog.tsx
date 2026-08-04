import { Alert, Checkbox, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { LoginMethodsController } from "./types";

const emailSchema = z.object({ email: requiredEmailSchema });
const passwordSchema = z
  .object({
    currentPassword: z.string(),
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

export function EmailPasswordDialog({ controller }: { controller: LoginMethodsController }) {
  const dialog = controller.emailPasswordDialog;
  const isBusy = controller.emailPasswordState.status === "loading";
  const title = dialog.isOpen && dialog.passwordMode === "change" ? "パスワードを変更" : "メールとパスワードを設定";

  return (
    <Dialog
      title={title}
      isOpen={dialog.isOpen}
      onOpenChange={({ open }) => {
        if (!open) controller.closeEmailPasswordDialog();
      }}
      onClose={controller.closeEmailPasswordDialog}
      onBackGuardRemoved={controller.closeEmailPasswordDialog}
      preventClose={isBusy}
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
      {dialog.isOpen && dialog.step === "email" ? <EmailStep controller={controller} isBusy={isBusy} /> : null}
      {dialog.isOpen && dialog.step === "verification" ? (
        <EmailCodeVerificationForm
          description={`${dialog.targetMaskedEmail ?? "入力したメールアドレス"}に確認コードを送りました。\nコードはこの画面だけで使用し、保存しません。`}
          errorMessage={
            controller.emailPasswordState.status === "error"
              ? (controller.emailPasswordState.message ?? undefined)
              : undefined
          }
          infoMessage={
            controller.emailPasswordState.status === "success"
              ? (controller.emailPasswordState.message ?? undefined)
              : undefined
          }
          isSubmitting={isBusy}
          submitLabel="メールを確認"
          submittingLabel="確認中"
          onSubmit={async ({ code }) => {
            await controller.verifyEmailCode(code);
          }}
          secondaryActions={
            <Stack direction={{ base: "column", sm: "row" }} justify="space-between" gap={2}>
              <Button type="button" variant="ghost" onClick={controller.closeEmailPasswordDialog} disabled={isBusy}>
                閉じる
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void controller.resendEmailCode();
                }}
                disabled={isBusy}
              >
                確認コードを再送
              </Button>
            </Stack>
          }
        />
      ) : null}
      {dialog.isOpen && dialog.step === "password" ? (
        <PasswordStep controller={controller} isBusy={isBusy} mode={dialog.passwordMode} />
      ) : null}
    </Dialog>
  );
}

function EmailStep({ controller, isBusy }: { controller: LoginMethodsController; isBusy: boolean }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(async ({ email }) => controller.startEmailVerification(email))}>
      <Text color="fg.muted">
        ログインに使うメールアドレスを入力します。確認済みのメールがある場合は、その設定を再利用します。
      </Text>
      <CardMessage controller={controller} />
      <Field.Root invalid={Boolean(errors.email)}>
        <Field.Label>ログインに使うメールアドレス</Field.Label>
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
        <Button type="button" variant="outline" onClick={controller.closeEmailPasswordDialog} disabled={isBusy}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={isBusy} loadingText="送信中">
          確認コードを送信
        </Button>
      </Stack>
    </Stack>
  );
}

function PasswordStep({
  controller,
  isBusy,
  mode,
}: {
  controller: LoginMethodsController;
  isBusy: boolean;
  mode: "set" | "change";
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmation: "",
      signOutOfOtherSessions: false,
    },
  });

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={handleSubmit(async (values) =>
        controller.updatePassword({
          currentPassword: mode === "change" ? values.currentPassword : undefined,
          newPassword: values.newPassword,
          signOutOfOtherSessions: values.signOutOfOtherSessions,
        }),
      )}
    >
      <Text color="fg.muted">
        {mode === "change"
          ? "新しいパスワードを設定します。"
          : "メールの確認は完了しています。続けてパスワードを設定します。"}
      </Text>
      <CardMessage controller={controller} />
      {mode === "change" ? (
        <Field.Root>
          <Field.Label>現在のパスワード</Field.Label>
          <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
        </Field.Root>
      ) : null}
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
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="outline" onClick={controller.closeEmailPasswordDialog} disabled={isBusy}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={isBusy} loadingText="保存中">
          {mode === "change" ? "パスワードを変更" : "パスワードを設定"}
        </Button>
      </Stack>
    </Stack>
  );
}

function CardMessage({ controller }: { controller: LoginMethodsController }) {
  const state = controller.emailPasswordState;
  if (!state.message || state.status === "idle" || state.status === "loading") return null;
  return (
    <Alert.Root status={state.status === "error" ? "error" : "success"} borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{state.message}</Alert.Description>
    </Alert.Root>
  );
}
