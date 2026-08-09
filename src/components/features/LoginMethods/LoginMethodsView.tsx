import { Alert, Box, Skeleton, Stack } from "@chakra-ui/react";
import { useState } from "react";
import { Dialog } from "@/src/components/ui/Dialog";
import { GoogleDisconnectDialog } from "./GoogleDisconnectDialog";
import { LoginEmailChangeDialog } from "./LoginEmailChangeDialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import { LoginMethodsCard } from "./LoginMethodsCard";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { GoogleDisconnectPreparation, LoginMethodsController } from "./types";
import type { PasswordChangeController } from "./usePasswordChangeController";

export function LoginMethodsView({
  controller,
  passwordChangeController,
  onStartFlow,
  reverification,
  isMigrationDialogOpen,
}: {
  controller: LoginMethodsController;
  passwordChangeController: PasswordChangeController;
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
  reverification: LoginMethodReverificationController;
  isMigrationDialogOpen: boolean;
}) {
  const [googleToDisconnect, setGoogleToDisconnect] = useState<
    | ({
        externalAccountId: string;
      } & GoogleDisconnectPreparation)
    | null
  >(null);

  if (!controller.isLoaded) {
    return (
      <Stack gap={5} aria-label="ログイン方法を読み込み中">
        <Skeleton h="160px" borderRadius="xl" />
        <Skeleton h="220px" borderRadius="xl" />
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      {controller.viewModel.status === "unavailable" ? (
        <Alert.Root status="error" borderRadius="xl">
          <Alert.Indicator />
          <Box>
            <Alert.Title>利用できるログイン方法を確認できません</Alert.Title>
            <Alert.Description>画面を再読み込みして、もう一度お試しください。</Alert.Description>
          </Box>
        </Alert.Root>
      ) : null}

      <LoginMethodsCard
        controller={controller}
        passwordChangeController={passwordChangeController}
        onSetPassword={() => onStartFlow("add-email-password")}
        onConnectGoogle={() => onStartFlow("connect-google")}
        onRequestGoogleDisconnect={async (externalAccountId) => {
          const preparation = await controller.prepareGoogleDisconnect(externalAccountId);
          if (preparation) {
            setGoogleToDisconnect({ externalAccountId, ...preparation });
          }
        }}
      />

      <LoginEmailChangeDialog
        isOpen={controller.emailChangeDialog.isOpen}
        step={controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.step : "input"}
        targetEmailAddress={
          controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.targetEmailAddress : null
        }
        status={controller.emailPasswordState.status}
        message={controller.emailPasswordState.message}
        onClose={controller.closeLoginEmailChangeDialog}
        onSubmitEmail={controller.startLoginEmailChange}
        onSubmitCode={controller.verifyLoginEmailCode}
        onResendCode={controller.resendLoginEmailCode}
        onBackToInput={controller.backToLoginEmailInput}
        reverification={reverification}
      />
      <PasswordChangeDialog controller={passwordChangeController} reverification={reverification} />
      <GoogleDisconnectDialog
        externalAccountId={googleToDisconnect?.externalAccountId ?? null}
        mode={googleToDisconnect?.mode ?? null}
        googleEmailAddress={googleToDisconnect?.googleEmailAddress ?? null}
        controller={controller}
        reverification={reverification}
        onClose={() => {
          controller.closeGoogleDisconnect();
          setGoogleToDisconnect(null);
        }}
      />
      {reverification.state.status !== "idle" &&
      !isMigrationDialogOpen &&
      !controller.emailChangeDialog.isOpen &&
      !passwordChangeController.state.isOpen &&
      googleToDisconnect === null ? (
        <StandaloneReverificationDialog reverification={reverification} />
      ) : null}
    </Stack>
  );
}

function StandaloneReverificationDialog({ reverification }: { reverification: LoginMethodReverificationController }) {
  const preventClose = reverification.state.status === "submitting" || reverification.state.status === "completing";
  return (
    <Dialog
      title="確認が必要です"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !preventClose) reverification.cancel();
      }}
      onClose={reverification.cancel}
      onBackGuardRemoved={reverification.cancel}
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
    >
      <LoginMethodReverificationView controller={reverification} />
    </Dialog>
  );
}
