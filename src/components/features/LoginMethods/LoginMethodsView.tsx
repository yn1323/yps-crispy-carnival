import { Alert, Badge, Box, Card, HStack, Icon, Separator, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuKeyRound, LuMail, LuRefreshCw, LuShieldCheck } from "react-icons/lu";
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
      <Alert.Root status="info" borderRadius="xl">
        <Alert.Indicator />
        <Alert.Description>
          ここで変更しても、グループで使うシフト連絡先メールアドレスは変わりません。
        </Alert.Description>
      </Alert.Root>

      {controller.viewModel.status === "unavailable" ? (
        <Alert.Root status="error" borderRadius="xl">
          <Alert.Indicator />
          <Box>
            <Alert.Title>利用できるログイン方法を確認できません</Alert.Title>
            <Alert.Description>画面を再読み込みして、もう一度お試しください。</Alert.Description>
          </Box>
        </Alert.Root>
      ) : null}

      <GoogleCard
        controller={controller}
        onConnect={() => onStartFlow("connect-google")}
        onRequestDisconnect={async (externalAccountId) => {
          if (await controller.prepareGoogleDisconnect(externalAccountId)) {
            setGoogleToDisconnect(externalAccountId);
          }
        }}
      />
      <EmailPasswordCard controller={controller} onSetPassword={() => onStartFlow("add-email-password")} />

      <HStack justify="flex-end">
        <Button
          variant="outline"
          onClick={() => {
            void controller.reload();
          }}
          loading={controller.googleState.status === "loading" || controller.emailPasswordState.status === "loading"}
        >
          <LuRefreshCw aria-hidden />
          最新の状態を読み込む
        </Button>
      </HStack>

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

function GoogleCard({
  controller,
  onConnect,
  onRequestDisconnect,
}: {
  controller: LoginMethodsController;
  onConnect: () => void;
  onRequestDisconnect: (externalAccountId: string) => Promise<void>;
}) {
  const { google } = controller.viewModel;
  const canDisconnectGoogle = google.accounts.some((account) => account.canDisconnect);

  return (
    <Stack gap={3}>
      <Card.Root variant="outline" borderRadius="xl">
        <Card.Header pb={3}>
          <HStack gap={3}>
            <Icon as={LuShieldCheck} color="teal.600" boxSize={5} />
            <Card.Title fontSize="lg">Google</Card.Title>
          </HStack>
        </Card.Header>
        <Card.Body pt={0}>
          <Stack gap={4}>
            <CardError state={controller.googleState} />
            {google.accounts.length === 0 ? (
              <Text color="fg.muted">Googleでのログインは設定されていません。</Text>
            ) : (
              google.accounts.map((account) => (
                <Stack key={account.id} gap={2}>
                  <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
                    <Box minW={0}>
                      <Text fontWeight="medium" overflowWrap="anywhere">
                        {account.maskedEmail}
                      </Text>
                      <Badge mt={1} colorPalette={account.status === "connected" ? "green" : "orange"}>
                        {account.status === "connected" ? "接続済み" : "再確認が必要"}
                      </Badge>
                    </Box>
                    <HStack gap={2} flexWrap="wrap">
                      {account.status === "needsReconnection" && google.canReconnect ? (
                        <Button
                          variant="outline"
                          loading={controller.googleState.status === "loading"}
                          onClick={onConnect}
                        >
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
                          解除
                        </Button>
                      ) : null}
                    </HStack>
                  </HStack>
                  <Separator />
                </Stack>
              ))
            )}
            {google.accounts.length === 0 && google.canConnect ? (
              <Button
                alignSelf="flex-start"
                colorPalette="teal"
                onClick={onConnect}
                loading={controller.googleState.status === "loading"}
              >
                Googleを連携
              </Button>
            ) : null}
          </Stack>
        </Card.Body>
      </Card.Root>
      {canDisconnectGoogle ? (
        <Text color="fg.muted" fontSize="sm">
          Google認証を解除してもメールアドレスでログインできます
        </Text>
      ) : null}
    </Stack>
  );
}

function EmailPasswordCard({
  controller,
  onSetPassword,
}: {
  controller: LoginMethodsController;
  onSetPassword: () => void;
}) {
  const { emailPassword } = controller.viewModel;
  const allEmails = [...emailPassword.verifiedEmails, ...emailPassword.unverifiedEmails];

  return (
    <Card.Root variant="outline" borderRadius="xl">
      <Card.Header pb={3}>
        <HStack gap={3}>
          <Icon as={LuKeyRound} color="teal.600" boxSize={5} />
          <Card.Title fontSize="lg">メールアドレスとパスワード</Card.Title>
        </HStack>
      </Card.Header>
      <Card.Body pt={0}>
        <Stack gap={4}>
          <CardError state={controller.emailPasswordState} />
          <HStack justify="space-between" gap={4} flexWrap="wrap">
            <Text fontWeight="medium">パスワード</Text>
            <Badge colorPalette={emailPassword.passwordEnabled ? "green" : "gray"}>
              {emailPassword.passwordEnabled ? "設定済み" : "未設定"}
            </Badge>
          </HStack>
          <Separator />
          <Stack gap={3}>
            <HStack gap={2}>
              <LuMail aria-hidden />
              <Text fontWeight="medium">登録済みのメールアドレス</Text>
            </HStack>
            {allEmails.length === 0 ? (
              <Text color="fg.muted">確認できるメールアドレスがありません。</Text>
            ) : (
              allEmails.map((email) => <EmailAddressRow key={email.id} email={email} controller={controller} />)
            )}
          </Stack>
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
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

function EmailAddressRow({
  email,
  controller,
}: {
  email: LoginMethodsEmailViewModel;
  controller: LoginMethodsController;
}) {
  return (
    <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
      <Box minW={0}>
        <Text overflowWrap="anywhere">{email.maskedEmail}</Text>
        <HStack mt={1} gap={2} flexWrap="wrap">
          <Badge colorPalette={email.verificationStatus === "verified" ? "green" : "orange"}>
            {email.verificationStatus === "verified" ? "確認済み" : "メール確認が必要"}
          </Badge>
          {email.isLinked ? <Badge>Googleと接続中</Badge> : null}
        </HStack>
      </Box>
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
    </HStack>
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
