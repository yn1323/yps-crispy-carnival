import { Alert, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
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
  const isReverificationBusy = isLoginMethodReverificationBusy(reverification);
  const isCleanupPending = controller.googleDisconnectPendingCleanup;
  const dialogBusy = isCleanupPending || (isReverifying ? isReverificationBusy : isBusy);
  const requestClose = () => {
    if (isCleanupPending) return;
    if (isReverifying) {
      if (isReverificationBusy) return;
      reverification.cancel();
    }
    if (!isBusy) onClose();
  };
  const submit = async () => {
    if (!externalAccountId) return;
    if (await controller.disconnectGoogle(externalAccountId)) onClose();
  };
  const footer = isReverifying ? (
    <LoginMethodReverificationActions controller={reverification} />
  ) : isCleanupPending ? (
    <DialogActionArea
      layout="standard"
      mobileLayout="inline"
      endAction={
        <Button type="button" colorPalette="red" loading={isBusy} loadingText="もう一度試す" onClick={submit}>
          もう一度試す
        </Button>
      }
    />
  ) : undefined;

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
      preventClose={dialogBusy}
      isLoading={isReverifying ? isReverificationBusy : isBusy}
      onSubmit={!isReverifying && !isCleanupPending ? submit : undefined}
      submitLabel="解除する"
      submitColorPalette="red"
      footer={footer}
      mobileActionLayout="inline"
      mobileFullScreen={isReverifying}
      maxW={{ md: "560px" }}
      maxH={isReverifying ? { md: "86dvh" } : undefined}
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying ? (
        <Stack gap={4}>
          <Text>
            このGoogleアカウントではログインできなくなります。
            <br />
            メールアドレスとパスワードは残ります。
          </Text>
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
