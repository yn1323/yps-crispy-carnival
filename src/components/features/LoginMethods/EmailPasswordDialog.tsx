import { Alert, Checkbox, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { LoginMethodsController } from "./types";

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

type PasswordValues = z.infer<typeof passwordSchema>;

export function EmailPasswordDialog({
  controller,
  reverification,
}: {
  controller: LoginMethodsController;
  reverification: LoginMethodReverificationController;
}) {
  const dialog = controller.emailPasswordDialog;
  const isBusy = controller.emailPasswordState.status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationSubmitting =
    reverification.state.status === "submitting" || reverification.state.status === "completing";
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      reverification.cancel();
      controller.closeEmailPasswordDialog(true);
      return;
    }
    controller.closeEmailPasswordDialog();
  };
  const title = "パスワードを変更";

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : title}
      isOpen={dialog.isOpen}
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
      {!isReverifying && dialog.isOpen ? <PasswordStep controller={controller} isBusy={isBusy} /> : null}
    </Dialog>
  );
}

function PasswordStep({ controller, isBusy }: { controller: LoginMethodsController; isBusy: boolean }) {
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
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          signOutOfOtherSessions: values.signOutOfOtherSessions,
        }),
      )}
    >
      <Text color="fg.muted">現在のパスワードを確認して、新しいパスワードへ変更します。</Text>
      <CardMessage controller={controller} />
      <Field.Root>
        <Field.Label>現在のパスワード</Field.Label>
        <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
      </Field.Root>
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
        <Button type="button" variant="outline" onClick={() => controller.closeEmailPasswordDialog()} disabled={isBusy}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={isBusy} loadingText="保存中">
          パスワードを変更
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
