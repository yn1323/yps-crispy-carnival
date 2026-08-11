import { Alert, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Dialog } from "@/src/components/ui/Dialog";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
import { type PasswordChangeValues, passwordChangeSchema } from "./passwordSchema";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { PasswordChangeController } from "./usePasswordChangeController";

const PASSWORD_CHANGE_FORM_ID = "password-change-form";

export function PasswordChangeDialog({
  controller,
  reverification,
}: {
  controller: PasswordChangeController;
  reverification: LoginMethodReverificationController;
}) {
  const isOpen = controller.state.isOpen;
  const isBusy = isOpen && controller.state.status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationBusy = isLoginMethodReverificationBusy(reverification);
  const dialogBusy = isReverifying ? isReverificationBusy : isBusy;
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationBusy) return;
      reverification.cancel();
      controller.close(true);
      return;
    }
    controller.close();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : "パスワードを変更"}
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={dialogBusy}
      isLoading={dialogBusy}
      formId={!isReverifying ? PASSWORD_CHANGE_FORM_ID : undefined}
      submitLabel="変更する"
      footer={isReverifying ? <LoginMethodReverificationActions controller={reverification} /> : undefined}
      mobileActionLayout="inline"
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "86dvh" }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 2, pb: { base: 6, md: 6 } }}
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying && isOpen ? <PasswordChangeForm controller={controller} /> : null}
    </Dialog>
  );
}

function PasswordChangeForm({ controller }: { controller: PasswordChangeController }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmation: "" },
    shouldFocusError: true,
  });
  const isBusy = controller.state.isOpen && controller.state.status === "loading";
  const errorMessage = controller.state.isOpen && controller.state.status === "error" ? controller.state.message : null;

  return (
    <Stack
      as="form"
      id={PASSWORD_CHANGE_FORM_ID}
      gap={5}
      onSubmit={handleSubmit(async (values) => {
        await controller.changePassword(values);
      })}
    >
      <Text color="fg.muted">変更後、この端末以外ではログアウトされます。</Text>
      {errorMessage ? (
        <Alert.Root status="error" role="alert" aria-live="assertive" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description whiteSpace="pre-line">{errorMessage}</Alert.Description>
        </Alert.Root>
      ) : null}
      <Field.Root invalid={Boolean(errors.currentPassword)}>
        <Field.Label>現在のパスワード</Field.Label>
        <Input type="password" autoComplete="current-password" disabled={isBusy} {...register("currentPassword")} />
        <Field.ErrorText>{errors.currentPassword?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={Boolean(errors.newPassword)}>
        <Field.Label>新しいパスワード</Field.Label>
        <Input type="password" autoComplete="new-password" disabled={isBusy} {...register("newPassword")} />
        <Field.ErrorText>{errors.newPassword?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={Boolean(errors.confirmation)}>
        <Field.Label>新しいパスワード（確認）</Field.Label>
        <Input type="password" autoComplete="new-password" disabled={isBusy} {...register("confirmation")} />
        <Field.ErrorText>{errors.confirmation?.message}</Field.ErrorText>
      </Field.Root>
    </Stack>
  );
}
