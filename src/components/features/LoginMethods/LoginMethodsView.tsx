import { Alert, Box, Flex, Skeleton, Stack } from "@chakra-ui/react";
import { useState } from "react";
import { Dialog } from "@/src/components/ui/Dialog";
import { GoogleDisconnectDialog } from "./GoogleDisconnectDialog";
import { LoginEmailChangeDialog } from "./LoginEmailChangeDialog";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
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
    return <LoginMethodsSkeleton />;
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

function LoginMethodsSkeleton() {
  return (
    <Stack gap={3} aria-label="ログイン方法を読み込み中" aria-busy="true">
      <Stack gap={1}>
        <Skeleton h="16px" w="320px" maxW="100%" />
        <Skeleton h="16px" w={{ base: "100%", md: "480px" }} />
      </Stack>
      <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden" bg="white">
        <LoginMethodRowSkeleton titleWidth="112px" detailWidth="184px" />
        <LoginMethodRowSkeleton titleWidth="88px" detailWidth="64px" hasDivider />
        <LoginMethodRowSkeleton titleWidth="96px" detailWidth="176px" showBadge hasDivider />
      </Stack>
    </Stack>
  );
}

function LoginMethodRowSkeleton({
  titleWidth,
  detailWidth,
  showBadge = false,
  hasDivider = false,
}: {
  titleWidth: string;
  detailWidth: string;
  showBadge?: boolean;
  hasDivider?: boolean;
}) {
  return (
    <Box borderTopWidth={hasDivider ? "1px" : undefined} borderColor="blackAlpha.100" p={{ base: 3, md: 4 }} bg="white">
      <Flex align="center" gap={{ base: 3, md: 4 }} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <Skeleton boxSize={{ base: 10, md: 12 }} borderRadius="lg" flexShrink={0} />
        <Stack gap={1} flex={1} minW={0}>
          <Flex align="center" gap={2} flexWrap="wrap">
            <Skeleton h="24px" w={titleWidth} maxW="100%" />
            {showBadge && <Skeleton h="20px" w="56px" borderRadius="full" />}
          </Flex>
          <Skeleton h="20px" w={detailWidth} maxW="100%" />
        </Stack>
        <Skeleton h="40px" w="88px" flexShrink={0} />
      </Flex>
    </Box>
  );
}

function StandaloneReverificationDialog({ reverification }: { reverification: LoginMethodReverificationController }) {
  const preventClose = isLoginMethodReverificationBusy(reverification);
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
      isLoading={preventClose}
      footer={<LoginMethodReverificationActions controller={reverification} />}
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "86dvh" }}
    >
      <LoginMethodReverificationView controller={reverification} />
    </Dialog>
  );
}
