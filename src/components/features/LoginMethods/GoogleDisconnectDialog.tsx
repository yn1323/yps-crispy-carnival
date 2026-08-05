import { Alert, Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { LoginMethodsCardState, LoginMethodsController } from "./types";

export function GoogleDisconnectDialog({
  externalAccountId,
  controller,
  reverification,
  onClose,
}: {
  externalAccountId: string | null;
  controller: LoginMethodsController;
  reverification: LoginMethodReverificationController;
  onClose: () => void;
}) {
  const isBusy = controller.googleState.status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationSubmitting =
    reverification.state.status === "submitting" || reverification.state.status === "completing";
  const requestClose = () => {
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
      title={isReverifying ? "確認が必要です" : "Google連携を解除"}
      role="alertdialog"
      isOpen={externalAccountId !== null}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={isReverifying ? isReverificationSubmitting : isBusy}
      onSubmit={isReverifying ? undefined : submit}
      submitLabel="解除する"
      submitColorPalette="red"
      isLoading={isBusy && !isReverifying}
      hideFooter={isReverifying}
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
