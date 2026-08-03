import { Alert, Box, Field, Input, Spinner, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { AccountEmailChangeController } from "./useAccountEmailChangeController";

const inputSchema = z.object({ email: requiredEmailSchema });
type InputValues = z.infer<typeof inputSchema>;

type Props = {
  isOpen: boolean;
  controller: AccountEmailChangeController;
  initialEmail?: string;
  lockTargetEmail?: boolean;
  onClose: () => void;
  onFinish: () => void;
};

export function AccountEmailChangeView({
  isOpen,
  controller,
  initialEmail = "",
  lockTargetEmail = false,
  onClose,
  onFinish,
}: Props) {
  const preventClose = [
    "updating",
    "syncFailed",
    "rollbackSyncFailed",
    "cleanupFailed",
    "rollbackCleanupFailed",
  ].includes(controller.step);
  const close = () => {
    controller.reset();
    onClose();
  };

  return (
    <Dialog
      title="メールアドレスを変更"
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) close();
      }}
      onClose={close}
      onBackGuardRemoved={close}
      preventClose={preventClose}
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
      {controller.step === "input" && (
        <EmailInputStep
          key={initialEmail}
          currentEmail={controller.currentEmail}
          initialEmail={initialEmail}
          lockTargetEmail={lockTargetEmail}
          errorMessage={controller.errorMessage}
          isBusy={controller.isBusy}
          onSubmit={(email) => controller.start(email)}
          onCancel={close}
        />
      )}

      {controller.step === "verify" && (
        <VerificationStep
          maskedEmail={controller.targetMaskedEmail}
          needsCode={controller.needsVerificationCode}
          errorMessage={controller.errorMessage}
          infoMessage={controller.infoMessage}
          isBusy={controller.isBusy}
          onVerify={(code) => controller.verify(code)}
          onResend={() => controller.resendCode()}
          onBack={controller.backToInput}
        />
      )}

      {controller.step === "updating" && (
        <Stack align="center" justify="center" gap={4} minH="280px" textAlign="center">
          <Spinner size="lg" color="teal.600" />
          <Box>
            <Text fontWeight="semibold">{controller.updatingLabel}</Text>
            <Text mt={1} fontSize="sm" color="fg.muted">
              この画面を閉じずにお待ちください。
            </Text>
          </Box>
        </Stack>
      )}

      {controller.step === "syncFailed" && (
        <RecoveryStep
          title="シフトリ内の同期が完了していません"
          description={
            controller.errorMessage ??
            "ログインメールは変更済みです。同期を再試行するか、以前のメールアドレスへ戻してください。"
          }
          primaryLabel="同期を再試行"
          secondaryLabel="以前のメールへ戻す"
          isBusy={controller.isBusy}
          onPrimary={() => controller.retrySync()}
          onSecondary={() => controller.rollback()}
        />
      )}

      {controller.step === "cleanupFailed" && (
        <RecoveryStep
          title="以前のメールアドレスが残っています"
          description={
            controller.errorMessage ??
            "新しいメールへの変更とシフトリ内の同期は完了しました。安全のため、以前のメールアドレスの削除を完了してください。"
          }
          primaryLabel="削除を再試行"
          isBusy={controller.isBusy}
          onPrimary={() => controller.retryCleanup()}
        />
      )}

      {controller.step === "rollbackSyncFailed" && (
        <RecoveryStep
          title="以前のメールへの同期が完了していません"
          description={
            controller.errorMessage ??
            "ログインメールは以前のメールへ戻っています。シフトリ内の同期を完了してから、追加したメールを削除します。"
          }
          primaryLabel="同期を再試行"
          isBusy={controller.isBusy}
          onPrimary={() => controller.retryRollbackSync()}
        />
      )}

      {controller.step === "rollbackCleanupFailed" && (
        <RecoveryStep
          title="以前のメールへ戻しました"
          description={
            controller.errorMessage ??
            "追加したメールアドレスがまだ残っています。削除を完了してから画面を閉じてください。"
          }
          primaryLabel="削除を再試行"
          isBusy={controller.isBusy}
          onPrimary={() => controller.retryRollbackCleanup()}
        />
      )}

      {controller.step === "complete" && (
        <CompletionStep
          title="メールアドレスを変更しました"
          description="次回から、新しいメールアドレスで通常ログインできます。"
          actionLabel="閉じる"
          onAction={onFinish}
        />
      )}

      {controller.step === "rolledBack" && (
        <CompletionStep
          title="以前のメールアドレスへ戻しました"
          description="ログインメールとシフトリ内のメールは変更前の状態です。"
          actionLabel="閉じる"
          onAction={onFinish}
        />
      )}
    </Dialog>
  );
}

function EmailInputStep({
  currentEmail,
  initialEmail,
  lockTargetEmail,
  errorMessage,
  isBusy,
  onSubmit,
  onCancel,
}: {
  currentEmail: string | null;
  initialEmail: string;
  lockTargetEmail: boolean;
  errorMessage: string | null;
  isBusy: boolean;
  onSubmit: (email: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InputValues>({ resolver: zodResolver(inputSchema), defaultValues: { email: initialEmail } });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(async ({ email }) => await onSubmit(email))}>
      <Alert.Root status="info" borderRadius="lg">
        <Alert.Indicator />
        <Alert.Description>
          変更後のメールアドレスは、ログインとシフトリからの連絡の両方に使われます。
        </Alert.Description>
      </Alert.Root>
      <Box>
        <Text fontSize="sm" color="fg.muted">
          現在のメールアドレス
        </Text>
        <Text mt={1} fontWeight="medium">
          {currentEmail ?? "確認中"}
        </Text>
      </Box>
      {errorMessage && <ErrorAlert message={errorMessage} />}
      <Field.Root invalid={Boolean(errors.email)}>
        <Field.Label>新しいメールアドレス</Field.Label>
        <Input
          type="email"
          autoComplete="email"
          placeholder="例：hanako@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          readOnly={lockTargetEmail}
          {...register("email")}
        />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
          キャンセル
        </Button>
        <Button type="submit" colorPalette="teal" loading={isBusy} loadingText="送信中">
          確認コードを送信
        </Button>
      </Stack>
    </Stack>
  );
}

function VerificationStep({
  maskedEmail,
  needsCode,
  errorMessage,
  infoMessage,
  isBusy,
  onVerify,
  onResend,
  onBack,
}: {
  maskedEmail: string;
  needsCode: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  isBusy: boolean;
  onVerify: (code?: string) => Promise<unknown>;
  onResend: () => Promise<unknown>;
  onBack: () => void;
}) {
  if (!needsCode) {
    return (
      <Stack gap={5}>
        <Alert.Root status="info" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>
            {maskedEmail}は確認済みです。続けるとClerkによる本人確認の後、ログインメールを変更します。
          </Alert.Description>
        </Alert.Root>
        {errorMessage && <ErrorAlert message={errorMessage} />}
        <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
          <Button type="button" variant="outline" onClick={onBack} disabled={isBusy}>
            入力へ戻る
          </Button>
          <Button
            colorPalette="teal"
            onClick={() => {
              void onVerify();
            }}
            loading={isBusy}
          >
            変更を続ける
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <EmailCodeVerificationForm
      description={`${maskedEmail}に確認コードを送りました。\nこの確認は、新しいメールアドレスの所有者であることを確かめるために必要です。`}
      errorMessage={errorMessage ?? undefined}
      infoMessage={infoMessage ?? undefined}
      isSubmitting={isBusy}
      submitLabel="確認する"
      submittingLabel="確認中"
      onSubmit={async ({ code }) => {
        await onVerify(code);
      }}
      secondaryActions={
        <Stack direction={{ base: "column", sm: "row" }} justify="space-between" gap={2}>
          <Button type="button" variant="ghost" onClick={onBack} disabled={isBusy}>
            入力へ戻る
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void onResend();
            }}
            disabled={isBusy}
          >
            確認コードを再送
          </Button>
        </Stack>
      }
    />
  );
}

function RecoveryStep({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  isBusy,
  onPrimary,
  onSecondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  isBusy: boolean;
  onPrimary: () => Promise<unknown>;
  onSecondary?: () => Promise<unknown>;
}) {
  return (
    <Stack gap={5}>
      <Alert.Root status="warning" borderRadius="lg">
        <Alert.Indicator />
        <Box>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description whiteSpace="pre-line">{description}</Alert.Description>
        </Box>
      </Alert.Root>
      <Stack gap={3}>
        <Button
          colorPalette="teal"
          onClick={() => {
            void onPrimary();
          }}
          loading={isBusy}
        >
          {primaryLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button
            variant="outline"
            onClick={() => {
              void onSecondary();
            }}
            disabled={isBusy}
          >
            {secondaryLabel}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function CompletionStep({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Stack gap={5}>
      <Alert.Root status="success" borderRadius="lg">
        <Alert.Indicator />
        <Box>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{description}</Alert.Description>
        </Box>
      </Alert.Root>
      <Button colorPalette="teal" onClick={onAction}>
        {actionLabel}
      </Button>
    </Stack>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert.Root status="error" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{message}</Alert.Description>
    </Alert.Root>
  );
}
