import { Alert, Badge, Box, Flex, HStack, Icon, Separator, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuMail } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { EmailPasswordDialog } from "./EmailPasswordDialog";
import { LoginEmailChangeDialog } from "./LoginEmailChangeDialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { LoginMethodsCardState, LoginMethodsController, LoginMethodsEmailViewModel } from "./types";

export function LoginMethodsView({
  controller,
  onStartFlow,
  reverification,
}: {
  controller: LoginMethodsController;
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
  reverification: LoginMethodReverificationController;
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

      <EmailPasswordDialog controller={controller} reverification={reverification} />
      <LoginEmailChangeDialog
        isOpen={controller.emailChangeDialog.isOpen}
        step={controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.step : "input"}
        currentMaskedEmail={
          controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.currentMaskedEmail : null
        }
        targetEmailAddress={controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.targetMaskedEmail : null}
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
      !controller.emailPasswordDialog.isOpen &&
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
  const canDisconnectGoogle = controller.viewModel.google.accounts.some((account) => account.canDisconnect);

  return (
    <Stack gap={3}>
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
      {canDisconnectGoogle ? (
        <Text color="fg.muted" fontSize="sm">
          Google認証を解除してもメールアドレスでログインできます
        </Text>
      ) : null}
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
  const allEmails = [...emailPassword.verifiedEmails, ...emailPassword.unverifiedEmails];
  const primaryEmail = allEmails.find((email) => email.isPrimary) ?? allEmails[0] ?? null;
  const secondaryEmails = primaryEmail ? allEmails.filter((email) => email.id !== primaryEmail.id) : [];

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
              {primaryEmail ? (
                <EmailAddressDetails email={primaryEmail} />
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  確認できるメールアドレスがありません。
                </Text>
              )}
            </Stack>
            {primaryEmail ? <EmailAddressActions email={primaryEmail} controller={controller} /> : null}
          </Flex>
          {secondaryEmails.length > 0 ? (
            <Stack gap={2}>
              {secondaryEmails.map((email) => (
                <HStack key={email.id} justify="space-between" align="center" gap={4} flexWrap="wrap">
                  <EmailAddressDetails email={email} />
                  <EmailAddressActions email={email} controller={controller} />
                </HStack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Flex>
      <CardError state={controller.emailPasswordState} />
      {emailPassword.canSetPassword || emailPassword.canChangePassword ? (
        <>
          <Separator />
          <HStack gap={3} flexWrap="wrap">
            {emailPassword.canSetPassword ? (
              <Button colorPalette="teal" onClick={onSetPassword}>
                メールアドレスとパスワードを設定
              </Button>
            ) : null}
            {emailPassword.canChangePassword ? (
              <Button colorPalette="teal" onClick={controller.openPasswordChange}>
                パスワードを変更
              </Button>
            ) : null}
          </HStack>
        </>
      ) : null}
    </Stack>
  );
}

function EmailAddressDetails({ email }: { email: LoginMethodsEmailViewModel }) {
  return (
    <Box minW={0} flex="1">
      <Text fontSize="sm" fontWeight="medium" overflowWrap="anywhere">
        {email.maskedEmail}
      </Text>
      {email.verificationStatus === "unverified" ? (
        <Badge mt={1} colorPalette="orange">
          メール確認が必要
        </Badge>
      ) : null}
    </Box>
  );
}

function EmailAddressActions({
  email,
  controller,
}: {
  email: LoginMethodsEmailViewModel;
  controller: LoginMethodsController;
}) {
  return (
    <HStack gap={2} flexWrap="wrap">
      {email.isPrimary && controller.viewModel.emailPassword.canChangeLoginEmail ? (
        <Button
          variant="outline"
          colorPalette="teal"
          onClick={controller.openLoginEmailChange}
          loading={controller.emailPasswordState.status === "loading"}
        >
          変更する
        </Button>
      ) : email.loginEmailChangeAction ? (
        <Button
          variant="outline"
          loading={controller.emailPasswordState.status === "loading"}
          onClick={() => {
            void controller.continueLoginEmailChange(email.id);
          }}
        >
          {email.loginEmailChangeAction === "verify" ? "メール確認を続ける" : "このメールに変更"}
        </Button>
      ) : null}
    </HStack>
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
          <Text id="login-methods-google-heading" as="h3" fontSize="lg" fontWeight="semibold">
            Google認証
          </Text>
          {google.accounts.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">
              Googleでのログインは設定されていません。
            </Text>
          ) : (
            google.accounts.map((account) => (
              <HStack key={account.id} justify="space-between" align="center" gap={4} flexWrap="wrap">
                <Text color="fg.muted" fontSize="sm" minW={0} overflowWrap="anywhere">
                  {account.maskedEmail}
                </Text>
                <HStack gap={3} flexWrap="wrap">
                  <Badge colorPalette={account.status === "connected" ? "green" : "orange"}>
                    {account.status === "connected" ? "連携済み" : "再確認が必要"}
                  </Badge>
                  {account.status === "needsReconnection" && google.canReconnect ? (
                    <Button variant="outline" loading={controller.googleState.status === "loading"} onClick={onConnect}>
                      Googleを再接続
                    </Button>
                  ) : null}
                  {account.canDisconnect ? (
                    <Button
                      variant="outline"
                      colorPalette="red"
                      loading={controller.googleState.status === "loading"}
                      onClick={() => {
                        void onRequestDisconnect(account.id);
                      }}
                    >
                      連携を解除
                    </Button>
                  ) : null}
                </HStack>
              </HStack>
            ))
          )}
        </Stack>
        {google.accounts.length === 0 && google.canConnect ? (
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
          <Text>このGoogleアカウントではログインできなくなります。メールアドレスとパスワードは残ります。</Text>
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>解除の直前に、メールアドレスとパスワードをもう一度確認します。</Alert.Description>
          </Alert.Root>
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
