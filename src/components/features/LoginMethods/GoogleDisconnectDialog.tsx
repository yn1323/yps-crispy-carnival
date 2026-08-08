import { Alert, Button, Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { GoogleDisconnectMode, LoginMethodsCardState, LoginMethodsController } from "./types";

export function GoogleDisconnectDialog({
  externalAccountId,
  mode,
  googleEmailAddress,
  controller,
  reverification,
  onClose,
}: {
  externalAccountId: string | null;
  mode: GoogleDisconnectMode | null;
  googleEmailAddress: string | null;
  controller: LoginMethodsController;
  reverification: LoginMethodReverificationController;
  onClose: () => void;
}) {
  const isBusy = controller.googleState.status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationSubmitting =
    reverification.state.status === "submitting" || reverification.state.status === "completing";
  const isCleanupPending = controller.googleDisconnectPendingCleanup;
  const requestClose = () => {
    if (isCleanupPending) return;
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      reverification.cancel();
    }
    if (!isBusy) onClose();
  };
  const submit = async () => {
    if (!externalAccountId) return;
    if (await controller.disconnectGoogle(externalAccountId)) onClose();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : isCleanupPending ? "Google連携の解除を完了" : "Google連携を解除"}
      role="alertdialog"
      isOpen={externalAccountId !== null && mode !== null && googleEmailAddress !== null}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={isCleanupPending || (isReverifying ? isReverificationSubmitting : isBusy)}
      hideFooter={isReverifying}
      footer={
        <>
          {!isCleanupPending ? (
            <Button key="cancel" variant="outline" disabled={isBusy} onClick={requestClose}>
              キャンセル
            </Button>
          ) : null}
          <Button key="submit" colorPalette="red" loading={isBusy} onClick={submit}>
            {isCleanupPending ? "もう一度試す" : "解除する"}
          </Button>
        </>
      }
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying ? (
        <Stack gap={4}>
          {mode === "externalOnly" ? (
            <Text>
              Google連携を解除します。
              <br />
              現在のメールアドレス（
              <Text as="span" fontWeight="semibold" overflowWrap="anywhere">
                {googleEmailAddress}
              </Text>
              ）は削除されません。同じGoogleアカウントでログインすると、再び連携される場合があります。
            </Text>
          ) : (
            <Text>
              Google連携を解除し、このGoogleアカウントのメールアドレスもログイン方法から削除します。
              <br />
              削除するメールアドレス：
              <Text as="span" fontWeight="semibold" overflowWrap="anywhere">
                {googleEmailAddress}
              </Text>
              <br />
              現在のメールアドレスとパスワードは残ります。
            </Text>
          )}
          <CardError state={controller.googleState} />
        </Stack>
      ) : null}
    </Dialog>
  );
}

function CardError({ state }: { state: LoginMethodsCardState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <Alert.Root status="error" role="alert" aria-live="assertive" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{state.message}</Alert.Description>
    </Alert.Root>
  );
}
