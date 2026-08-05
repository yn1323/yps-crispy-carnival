import { Alert, Badge, Box, Flex, HStack, Icon, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuMail } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { LoginEmailChangeDialog } from "./LoginEmailChangeDialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { LoginMethodsCardState, LoginMethodsController, LoginMethodsEmailViewModel } from "./types";

export function LoginMethodsView({
  controller,
  onStartFlow,
  reverification,
  isMigrationDialogOpen,
}: {
  controller: LoginMethodsController;
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
  reverification: LoginMethodReverificationController;
  isMigrationDialogOpen: boolean;
}) {
  const [googleToDisconnect, setGoogleToDisconnect] = useState<string | null>(null);

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
        onSetPassword={() => onStartFlow("add-email-password")}
        onConnectGoogle={() => onStartFlow("connect-google")}
        onRequestGoogleDisconnect={async (externalAccountId) => {
          if (await controller.prepareGoogleDisconnect(externalAccountId)) {
            setGoogleToDisconnect(externalAccountId);
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
      <GoogleDisconnectDialog
        externalAccountId={googleToDisconnect}
        controller={controller}
        reverification={reverification}
        onClose={() => setGoogleToDisconnect(null)}
      />
      {reverification.state.status !== "idle" &&
      !isMigrationDialogOpen &&
      !controller.emailChangeDialog.isOpen &&
      googleToDisconnect === null ? (
        <StandaloneReverificationDialog reverification={reverification} />
      ) : null}
    </Stack>
  );
}

function LoginMethodsCard({
  controller,
  onSetPassword,
  onConnectGoogle,
  onRequestGoogleDisconnect,
}: {
  controller: LoginMethodsController;
  onSetPassword: () => void;
  onConnectGoogle: () => void;
  onRequestGoogleDisconnect: (externalAccountId: string) => Promise<void>;
}) {
  return (
    <Stack gap={3}>
      <Text color="fg.muted" fontSize="sm">
        Google認証を解除してもメールアドレスでログインできます
      </Text>
      <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden" bg="white">
        <Box p={{ base: 3, md: 4 }} bg="white">
          <EmailContent controller={controller} onSetPassword={onSetPassword} />
        </Box>
        <Box borderTopWidth="1px" borderColor="blackAlpha.100" p={{ base: 3, md: 4 }}>
          <GoogleContent
            controller={controller}
            onConnect={onConnectGoogle}
            onRequestDisconnect={onRequestGoogleDisconnect}
          />
        </Box>
      </Stack>
    </Stack>
  );
}

function EmailContent({
  controller,
  onSetPassword,
}: {
  controller: LoginMethodsController;
  onSetPassword: () => void;
}) {
  const { emailPassword } = controller.viewModel;
  const primaryEmail = emailPassword.primaryEmail;
  const isGoogleOnly = controller.viewModel.methodState === "googleOnly";
  const canSetEmailPassword = isGoogleOnly && emailPassword.canSetPassword;
  const canChangeEmail = !isGoogleOnly && primaryEmail && emailPassword.canChangeLoginEmail;

  return (
    <Stack gap={2} as="section" aria-labelledby="login-methods-email-heading">
      <Flex align="center" gap={{ base: 3, md: 4 }} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <Box
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="lg"
          boxSize={{ base: 10, md: 12 }}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Icon as={LuMail} boxSize={{ base: 5, md: 6 }} aria-hidden />
        </Box>
        <Stack gap={2} flex="1" minW={0}>
          <Flex align="center" justify="space-between" gap={4} flexWrap={{ base: "wrap", md: "nowrap" }}>
            <Stack gap={1} minW={0} flex="1">
              <Text id="login-methods-email-heading" as="h3" fontSize="lg" fontWeight="semibold">
                メールアドレス
              </Text>
              {primaryEmail && !isGoogleOnly ? (
                <EmailAddressDetails email={primaryEmail} />
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  未設定
                </Text>
              )}
            </Stack>
            {canSetEmailPassword || canChangeEmail ? (
              <Button
                variant="outline"
                colorPalette="teal"
                onClick={canSetEmailPassword ? onSetPassword : controller.openLoginEmailChange}
                loading={controller.emailPasswordState.status === "loading"}
              >
                {canSetEmailPassword ? "設定する" : "変更する"}
              </Button>
            ) : null}
          </Flex>
        </Stack>
      </Flex>
      <CardError state={controller.emailPasswordState} />
    </Stack>
  );
}

function EmailAddressDetails({ email }: { email: LoginMethodsEmailViewModel }) {
  return (
    <Box minW={0} flex="1">
      <Text fontSize="sm" fontWeight="medium" overflowWrap="anywhere">
        {email.emailAddress}
      </Text>
      {email.verificationStatus === "unverified" ? (
        <Badge mt={1} colorPalette="orange">
          メール確認が必要
        </Badge>
      ) : null}
    </Box>
  );
}

function GoogleContent({
  controller,
  onConnect,
  onRequestDisconnect,
}: {
  controller: LoginMethodsController;
  onConnect: () => void;
  onRequestDisconnect: (externalAccountId: string) => Promise<void>;
}) {
  const { google } = controller.viewModel;
  const googleNeedsReconnection = google.accounts.some((account) => account.status === "needsReconnection");
  return (
    <Stack gap={2} as="section" aria-labelledby="login-methods-google-heading">
      <Flex align="center" gap={{ base: 3, md: 4 }} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <Box
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="lg"
          boxSize={{ base: 10, md: 12 }}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Icon as={FcGoogle} boxSize={{ base: 5, md: 6 }} aria-hidden />
        </Box>
        <Stack gap={1} flex="1" minW={0}>
          <HStack gap={2} flexWrap="wrap">
            <Text id="login-methods-google-heading" as="h3" fontSize="lg" fontWeight="semibold">
              Google認証
            </Text>
            {google.accounts.length > 0 ? (
              <Badge colorPalette={googleNeedsReconnection ? "orange" : "green"}>
                {googleNeedsReconnection ? "再確認が必要" : "連携済み"}
              </Badge>
            ) : null}
          </HStack>
          {google.accounts.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">
              Googleでのログインは設定されていません。
            </Text>
          ) : (
            google.accounts.map((account) => (
              <Text key={account.id} color="fg.muted" fontSize="sm" minW={0} overflowWrap="anywhere">
                {account.emailAddress}
              </Text>
            ))
          )}
        </Stack>
        {google.accounts.length > 0 ? (
          <HStack gap={3} flexWrap="wrap" alignSelf="center" flexShrink={0}>
            {google.accounts.map((account) => {
              if (account.status === "needsReconnection" && google.canReconnect) {
                return (
                  <Button
                    key={`${account.id}-action`}
                    variant="outline"
                    loading={controller.googleState.status === "loading"}
                    onClick={onConnect}
                  >
                    Googleを再接続
                  </Button>
                );
              }
              if (account.status === "connected") {
                return (
                  <Button
                    key={`${account.id}-action`}
                    variant="outline"
                    colorPalette="teal"
                    loading={controller.googleState.status === "loading"}
                    onClick={() => {
                      void onRequestDisconnect(account.id);
                    }}
                  >
                    解除する
                  </Button>
                );
              }
              return null;
            })}
          </HStack>
        ) : google.canConnect ? (
          <Button
            variant="outline"
            alignSelf="center"
            flexShrink={0}
            colorPalette="teal"
            onClick={onConnect}
            loading={controller.googleState.status === "loading"}
          >
            連携する
          </Button>
        ) : null}
      </Flex>
      <CardError state={controller.googleState} />
    </Stack>
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

function GoogleDisconnectDialog({
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
          <CardError state={controller.googleState} />
          <Text>
            このGoogleアカウントではログインできなくなります。
            <br />
            メールアドレスとパスワードは残ります。
          </Text>
        </Stack>
      ) : null}
    </Dialog>
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
