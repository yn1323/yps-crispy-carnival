import { Alert, Badge, Box, Flex, HStack, Icon, Separator, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuMail } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { EmailPasswordDialog } from "./EmailPasswordDialog";
import { LoginEmailChangeDialog } from "./LoginEmailChangeDialog";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import { hasGmailEmailAddress } from "./script";
import type {
  LoginMethodsCardState,
  LoginMethodsController,
  LoginMethodsEmailViewModel,
  PendingLoginMethodRemovalKind,
} from "./types";

type Confirmation =
  | { kind: "google"; id: string }
  | { kind: "password" }
  | { kind: "email"; id: string; maskedEmail: string };

export function LoginMethodsView({
  controller,
  onStartFlow,
  reverification,
  pendingRemovalKind = null,
  onPendingRemovalClaimed,
}: {
  controller: LoginMethodsController;
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
  reverification: LoginMethodReverificationController;
  pendingRemovalKind?: PendingLoginMethodRemovalKind | null;
  onPendingRemovalClaimed?: () => void;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pendingRemovalClaimedRef = useRef(false);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const { viewModel } = controller;
  const showLoginMethods = hasGmailEmailAddress(viewModel);
  const hasEnabledOperation =
    viewModel.google.canConnect ||
    viewModel.google.canReconnect ||
    viewModel.google.canReplace ||
    viewModel.google.accounts.some((account) => account.canDisconnect) ||
    viewModel.emailPassword.canChangeLoginEmail ||
    viewModel.emailPassword.canSetPassword ||
    viewModel.emailPassword.canChangePassword ||
    viewModel.emailPassword.canRemovePassword ||
    [...viewModel.emailPassword.verifiedEmails, ...viewModel.emailPassword.unverifiedEmails].some(
      (email) => email.canRemove,
    );

  useEffect(() => {
    if (!pendingRemovalKind) {
      pendingRemovalClaimedRef.current = false;
      return;
    }
    if (!controller.isLoaded || pendingRemovalClaimedRef.current) return;

    pendingRemovalClaimedRef.current = true;
    let cancelled = false;
    const precheckAndOpen = async () => {
      const currentController = controllerRef.current;
      if (pendingRemovalKind === "password") {
        const canRemove = await currentController.preparePasswordRemoval();
        if (!cancelled && canRemove) setConfirmation({ kind: "password" });
      } else {
        const account =
          currentController.viewModel.google.accounts.find((candidate) => candidate.canDisconnect) ??
          currentController.viewModel.google.accounts[0];
        if (account) {
          const canDisconnect = await currentController.prepareGoogleDisconnect(account.id);
          if (!cancelled && canDisconnect) setConfirmation({ kind: "google", id: account.id });
        }
      }
      if (!cancelled) onPendingRemovalClaimed?.();
    };
    void precheckAndOpen();

    return () => {
      cancelled = true;
    };
  }, [controller.isLoaded, onPendingRemovalClaimed, pendingRemovalKind]);

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
      {!hasEnabledOperation ? (
        <Alert.Root status="warning" borderRadius="xl">
          <Alert.Indicator />
          <Alert.Description>
            現在はログイン方法の確認のみ利用できます。Google連携やパスワードなどの変更は、安全性の確認が完了してから利用できるようになります。
          </Alert.Description>
        </Alert.Root>
      ) : null}

      {viewModel.status === "unavailable" ? (
        <Alert.Root status="error" borderRadius="xl">
          <Alert.Indicator />
          <Box>
            <Alert.Title>利用できるログイン方法を確認できません</Alert.Title>
            <Alert.Description>削除操作は停止しています。最新の状態を読み込んでください。</Alert.Description>
          </Box>
        </Alert.Root>
      ) : null}

      {showLoginMethods ? (
        <LoginMethodsCard
          controller={controller}
          onSetPassword={() => onStartFlow("add-email-password")}
          onConfirmRemovePassword={() => setConfirmation({ kind: "password" })}
          onConfirmRemoveEmail={(id, maskedEmail) => setConfirmation({ kind: "email", id, maskedEmail })}
          onConnect={() => onStartFlow("connect-google")}
          onReplace={() => onStartFlow("replace-google")}
          onRequestDisconnect={async (id) => {
            if (await controller.prepareGoogleDisconnect(id)) {
              setConfirmation({ kind: "google", id });
            }
          }}
        />
      ) : (
        <EmailPasswordCard
          controller={controller}
          onSetPassword={() => onStartFlow("add-email-password")}
          onConfirmRemovePassword={() => setConfirmation({ kind: "password" })}
          onConfirmRemoveEmail={(id, maskedEmail) => setConfirmation({ kind: "email", id, maskedEmail })}
        />
      )}

      <EmailPasswordDialog controller={controller} reverification={reverification} />
      <LoginEmailChangeDialog
        isOpen={controller.emailChangeDialog.isOpen}
        step={controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.step : "input"}
        currentMaskedEmail={
          controller.emailChangeDialog.isOpen ? controller.emailChangeDialog.currentMaskedEmail : null
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
      <RemovalConfirmationDialog
        confirmation={confirmation}
        controller={controller}
        onClose={() => setConfirmation(null)}
        reverification={reverification}
      />
      {reverification.state.status !== "idle" &&
      !controller.emailPasswordDialog.isOpen &&
      !controller.emailChangeDialog.isOpen &&
      confirmation === null ? (
        <StandaloneReverificationDialog reverification={reverification} />
      ) : null}
    </Stack>
  );
}

type EmailPasswordActions = {
  controller: LoginMethodsController;
  onSetPassword: () => void;
  onConfirmRemovePassword: () => void;
  onConfirmRemoveEmail: (id: string, maskedEmail: string) => void;
};

type GoogleActions = {
  controller: LoginMethodsController;
  onConnect: () => void;
  onReplace: () => void;
  onRequestDisconnect: (id: string) => Promise<void>;
};

function LoginMethodsCard({
  controller,
  onSetPassword,
  onConfirmRemovePassword,
  onConfirmRemoveEmail,
  onConnect,
  onReplace,
  onRequestDisconnect,
}: EmailPasswordActions & GoogleActions) {
  const { google } = controller.viewModel;
  return (
    <Stack gap={3}>
      <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden" bg="white">
        <Box p={{ base: 3, md: 4 }} bg="white">
          <EmailPasswordContent
            controller={controller}
            onSetPassword={onSetPassword}
            onConfirmRemovePassword={onConfirmRemovePassword}
            onConfirmRemoveEmail={onConfirmRemoveEmail}
            compact
          />
        </Box>
        <Box borderTopWidth="1px" borderColor="blackAlpha.100" p={{ base: 3, md: 4 }}>
          <GoogleContent
            controller={controller}
            onConnect={onConnect}
            onReplace={onReplace}
            onRequestDisconnect={onRequestDisconnect}
          />
        </Box>
      </Stack>
      {google.accounts.length > 0 ? (
        <Text color="fg.muted" fontSize="sm">
          Google認証を解除してもメールアドレスでログインできます
        </Text>
      ) : null}
    </Stack>
  );
}

function GoogleContent({ controller, onConnect, onReplace, onRequestDisconnect }: GoogleActions) {
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        void controller.reconnectGoogle(account.id);
                      }}
                      loading={controller.googleState.status === "loading"}
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
                      連携を解除
                    </Button>
                  ) : null}
                </HStack>
              </HStack>
            ))
          )}
        </Stack>
        {google.accounts.length === 0 ? (
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
      <CardStateMessage state={controller.googleState} />
      {google.canReplace ? (
        <Button alignSelf="flex-start" colorPalette="teal" onClick={onReplace}>
          Googleアカウントを変更
        </Button>
      ) : null}
    </Stack>
  );
}

function EmailPasswordCard({
  controller,
  onSetPassword,
  onConfirmRemovePassword,
  onConfirmRemoveEmail,
}: EmailPasswordActions) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <Stack gap={4} p={{ base: 4, md: 5 }}>
        <EmailPasswordContent
          controller={controller}
          onSetPassword={onSetPassword}
          onConfirmRemovePassword={onConfirmRemovePassword}
          onConfirmRemoveEmail={onConfirmRemoveEmail}
        />
      </Stack>
    </Box>
  );
}

function EmailPasswordContent({
  controller,
  onSetPassword,
  onConfirmRemovePassword,
  onConfirmRemoveEmail,
  compact = false,
}: EmailPasswordActions & { compact?: boolean }) {
  const { emailPassword } = controller.viewModel;
  const allEmails = [...emailPassword.verifiedEmails, ...emailPassword.unverifiedEmails];
  const compactPrimaryEmail = allEmails.find((email) => email.isPrimary) ?? allEmails[0] ?? null;
  const compactSecondaryEmails = compactPrimaryEmail
    ? allEmails.filter((email) => email.id !== compactPrimaryEmail.id)
    : [];
  const hasPasswordActions =
    emailPassword.canSetPassword || emailPassword.canChangePassword || emailPassword.canRemovePassword;

  return (
    <Stack gap={compact ? 2 : 4} as="section" aria-labelledby="login-methods-email-heading">
      {compact ? (
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
                {compactPrimaryEmail ? (
                  <EmailAddressDetails email={compactPrimaryEmail} />
                ) : (
                  <Text color="fg.muted" fontSize="sm">
                    確認できるメールアドレスがありません。
                  </Text>
                )}
              </Stack>
              {compactPrimaryEmail ? (
                <EmailAddressActions
                  email={compactPrimaryEmail}
                  emailPassword={emailPassword}
                  controller={controller}
                  onSetPassword={onSetPassword}
                  onConfirmRemoveEmail={onConfirmRemoveEmail}
                />
              ) : null}
            </Flex>
            {compactSecondaryEmails.length > 0 ? (
              <Stack gap={2}>
                {compactSecondaryEmails.map((email) => (
                  <EmailAddressRow
                    key={email.id}
                    email={email}
                    emailPassword={emailPassword}
                    controller={controller}
                    onSetPassword={onSetPassword}
                    onConfirmRemoveEmail={onConfirmRemoveEmail}
                  />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Flex>
      ) : (
        <HStack gap={3}>
          <LuMail aria-hidden />
          <Text id="login-methods-email-heading" as="h3" fontSize="lg" fontWeight="semibold">
            メールアドレス
          </Text>
        </HStack>
      )}
      <CardStateMessage state={controller.emailPasswordState} />
      {!compact && allEmails.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          確認できるメールアドレスがありません。
        </Text>
      ) : !compact ? (
        <Stack gap={3}>
          {allEmails.map((email) => (
            <EmailAddressRow
              key={email.id}
              email={email}
              emailPassword={emailPassword}
              controller={controller}
              onSetPassword={onSetPassword}
              onConfirmRemoveEmail={onConfirmRemoveEmail}
            />
          ))}
        </Stack>
      ) : null}
      {hasPasswordActions ? (
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
            {emailPassword.canRemovePassword ? (
              <Button variant="outline" colorPalette="red" onClick={onConfirmRemovePassword}>
                パスワードを削除
              </Button>
            ) : null}
          </HStack>
        </>
      ) : null}
    </Stack>
  );
}

function EmailAddressRow({
  email,
  emailPassword,
  controller,
  onSetPassword,
  onConfirmRemoveEmail,
}: {
  email: LoginMethodsEmailViewModel;
  emailPassword: LoginMethodsController["viewModel"]["emailPassword"];
  controller: LoginMethodsController;
  onSetPassword: () => void;
  onConfirmRemoveEmail: (id: string, maskedEmail: string) => void;
}) {
  return (
    <HStack justify="space-between" align="center" gap={4} flexWrap="wrap">
      <EmailAddressDetails email={email} />
      <EmailAddressActions
        email={email}
        emailPassword={emailPassword}
        controller={controller}
        onSetPassword={onSetPassword}
        onConfirmRemoveEmail={onConfirmRemoveEmail}
      />
    </HStack>
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
  emailPassword,
  controller,
  onSetPassword,
  onConfirmRemoveEmail,
}: {
  email: LoginMethodsEmailViewModel;
  emailPassword: LoginMethodsController["viewModel"]["emailPassword"];
  controller: LoginMethodsController;
  onSetPassword: () => void;
  onConfirmRemoveEmail: (id: string, maskedEmail: string) => void;
}) {
  return (
    <HStack gap={2} flexWrap="wrap">
      {email.isPrimary && emailPassword.canChangeLoginEmail ? (
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
      ) : email.verificationStatus === "unverified" && emailPassword.canSetPassword ? (
        <Button variant="outline" loading={controller.emailPasswordState.status === "loading"} onClick={onSetPassword}>
          メール確認を続ける
        </Button>
      ) : null}
      {email.canRemove ? (
        <Button variant="outline" colorPalette="red" onClick={() => onConfirmRemoveEmail(email.id, email.maskedEmail)}>
          削除
        </Button>
      ) : null}
    </HStack>
  );
}

function CardStateMessage({ state }: { state: LoginMethodsCardState }) {
  if (!state.message || state.status === "idle" || state.status === "loading") return null;
  return (
    <Alert.Root
      status={state.status === "error" ? "error" : "success"}
      role={state.status === "error" ? "alert" : "status"}
      aria-live={state.status === "error" ? "assertive" : "polite"}
      borderRadius="lg"
    >
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{state.message}</Alert.Description>
    </Alert.Root>
  );
}

function RemovalConfirmationDialog({
  confirmation,
  controller,
  onClose,
  reverification,
}: {
  confirmation: Confirmation | null;
  controller: LoginMethodsController;
  onClose: () => void;
  reverification: LoginMethodReverificationController;
}) {
  const isGoogle = confirmation?.kind === "google";
  const isPassword = confirmation?.kind === "password";
  const isBusy = isGoogle
    ? controller.googleState.status === "loading"
    : controller.emailPasswordState.status === "loading";
  const isReverifying = reverification.state.status !== "idle";
  const isReverificationSubmitting =
    reverification.state.status === "submitting" || reverification.state.status === "completing";
  const title = isGoogle ? "Google連携を解除" : isPassword ? "パスワードを削除" : "メールアドレスを削除";
  const description = isGoogle
    ? "このGoogleアカウントではログインできなくなります。ほかのログイン方法は残ります。"
    : isPassword
      ? "メールアドレスとパスワードではログインできなくなります。Googleでのログインは残ります。"
      : `${confirmation?.kind === "email" ? confirmation.maskedEmail : "このメールアドレス"}をログイン設定から削除します。`;

  const submit = async () => {
    if (!confirmation) return;
    if (confirmation.kind === "google") await controller.disconnectGoogle(confirmation.id);
    if (confirmation.kind === "password") await controller.removePassword();
    if (confirmation.kind === "email") await controller.removeEmailAddress(confirmation.id);
    onClose();
  };
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      reverification.cancel();
    }
    onClose();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : title}
      role="alertdialog"
      isOpen={confirmation !== null}
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={isReverifying ? isReverificationSubmitting : isBusy}
      onSubmit={isReverifying ? undefined : submit}
      submitLabel={isGoogle ? "解除する" : "削除する"}
      submitColorPalette="red"
      isLoading={isBusy && !isReverifying}
      hideFooter={isReverifying}
    >
      {isReverifying ? <LoginMethodReverificationView controller={reverification} /> : null}
      {!isReverifying ? (
        <Stack gap={4}>
          <Text>{description}</Text>
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>
              実行直前に最新の状態を確認し、最後のログイン方法になる場合は停止します。
            </Alert.Description>
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
