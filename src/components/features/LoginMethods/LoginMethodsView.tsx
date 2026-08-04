import { Alert, Badge, Box, Card, HStack, Icon, Separator, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuKeyRound, LuMail, LuRefreshCw, LuShieldCheck } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { EmailPasswordDialog } from "./EmailPasswordDialog";
import type { LoginMethodsCardState, LoginMethodsController } from "./types";

type Confirmation =
  | { kind: "google"; id: string }
  | { kind: "password" }
  | { kind: "email"; id: string; maskedEmail: string };

export function LoginMethodsView({ controller }: { controller: LoginMethodsController }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { viewModel } = controller;
  const hasEnabledOperation =
    viewModel.google.canConnect ||
    viewModel.google.canReconnect ||
    viewModel.google.accounts.some((account) => account.canDisconnect) ||
    viewModel.emailPassword.canSetPassword ||
    viewModel.emailPassword.canChangePassword ||
    viewModel.emailPassword.canRemovePassword ||
    [...viewModel.emailPassword.verifiedEmails, ...viewModel.emailPassword.unverifiedEmails].some(
      (email) => email.canRemove,
    );

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

      <GoogleCard
        controller={controller}
        onRequestDisconnect={async (id) => {
          if (await controller.prepareGoogleDisconnect(id)) {
            setConfirmation({ kind: "google", id });
          }
        }}
      />
      <EmailPasswordCard
        controller={controller}
        onConfirmRemovePassword={() => setConfirmation({ kind: "password" })}
        onConfirmRemoveEmail={(id, maskedEmail) => setConfirmation({ kind: "email", id, maskedEmail })}
      />

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

      <EmailPasswordDialog controller={controller} />
      <RemovalConfirmationDialog
        confirmation={confirmation}
        controller={controller}
        onClose={() => setConfirmation(null)}
      />
    </Stack>
  );
}

function GoogleCard({
  controller,
  onRequestDisconnect,
}: {
  controller: LoginMethodsController;
  onRequestDisconnect: (id: string) => Promise<void>;
}) {
  const { google } = controller.viewModel;
  return (
    <Card.Root variant="outline" borderRadius="xl">
      <Card.Header pb={3}>
        <HStack gap={3}>
          <Icon as={LuShieldCheck} color="teal.600" boxSize={5} />
          <Card.Title fontSize="lg">Google</Card.Title>
        </HStack>
      </Card.Header>
      <Card.Body pt={0}>
        <Stack gap={4}>
          <CardStateMessage state={controller.googleState} />
          {google.accounts.length === 0 ? (
            <Text color="fg.muted">Googleでのログインは設定されていません。</Text>
          ) : (
            google.accounts.map((account) => (
              <Stack key={account.id} gap={2}>
                <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
                  <Box minW={0}>
                    <Text fontWeight="medium">{account.maskedEmail}</Text>
                    <Badge mt={1} colorPalette={account.status === "connected" ? "green" : "orange"}>
                      {account.status === "connected" ? "接続済み" : "再確認が必要"}
                    </Badge>
                  </Box>
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
                      解除
                    </Button>
                  ) : null}
                </HStack>
                <Separator />
              </Stack>
            ))
          )}
          {google.canConnect ? (
            <Button
              alignSelf="flex-start"
              colorPalette="teal"
              onClick={() => {
                void controller.connectGoogle();
              }}
              loading={controller.googleState.status === "loading"}
            >
              Googleを連携
            </Button>
          ) : null}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

function EmailPasswordCard({
  controller,
  onConfirmRemovePassword,
  onConfirmRemoveEmail,
}: {
  controller: LoginMethodsController;
  onConfirmRemovePassword: () => void;
  onConfirmRemoveEmail: (id: string, maskedEmail: string) => void;
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
          <CardStateMessage state={controller.emailPasswordState} />
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
              allEmails.map((email) => (
                <HStack key={email.id} justify="space-between" align="start" gap={4} flexWrap="wrap">
                  <Box minW={0}>
                    <Text>{email.maskedEmail}</Text>
                    <HStack mt={1} gap={2} flexWrap="wrap">
                      <Badge colorPalette={email.verificationStatus === "verified" ? "green" : "orange"}>
                        {email.verificationStatus === "verified" ? "確認済み" : "メール確認が必要"}
                      </Badge>
                      {email.isLinked ? <Badge>Googleと接続中</Badge> : null}
                    </HStack>
                  </Box>
                  <HStack gap={2} flexWrap="wrap">
                    {email.verificationStatus === "unverified" && emailPassword.canSetPassword ? (
                      <Button
                        variant="outline"
                        loading={controller.emailPasswordState.status === "loading"}
                        onClick={() => {
                          void controller.continueEmailVerification(email.id);
                        }}
                      >
                        メール確認を続ける
                      </Button>
                    ) : null}
                    {email.canRemove ? (
                      <Button
                        variant="outline"
                        colorPalette="red"
                        onClick={() => onConfirmRemoveEmail(email.id, email.maskedEmail)}
                      >
                        削除
                      </Button>
                    ) : null}
                  </HStack>
                </HStack>
              ))
            )}
          </Stack>
          <Separator />
          <HStack gap={3} flexWrap="wrap">
            {emailPassword.canSetPassword ? (
              <Button colorPalette="teal" onClick={() => controller.openEmailPasswordSetup()}>
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
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

function CardStateMessage({ state }: { state: LoginMethodsCardState }) {
  if (!state.message || state.status === "idle" || state.status === "loading") return null;
  return (
    <Alert.Root status={state.status === "error" ? "error" : "success"} borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{state.message}</Alert.Description>
    </Alert.Root>
  );
}

function RemovalConfirmationDialog({
  confirmation,
  controller,
  onClose,
}: {
  confirmation: Confirmation | null;
  controller: LoginMethodsController;
  onClose: () => void;
}) {
  const isGoogle = confirmation?.kind === "google";
  const isPassword = confirmation?.kind === "password";
  const isBusy = isGoogle
    ? controller.googleState.status === "loading"
    : controller.emailPasswordState.status === "loading";
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

  return (
    <Dialog
      title={title}
      role="alertdialog"
      isOpen={confirmation !== null}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      onBackGuardRemoved={onClose}
      preventClose={isBusy}
      onSubmit={submit}
      submitLabel="削除する"
      submitColorPalette="red"
      isLoading={isBusy}
    >
      <Stack gap={4}>
        <Text>{description}</Text>
        <Alert.Root status="warning" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>
            実行直前に最新の状態を確認し、最後のログイン方法になる場合は停止します。
          </Alert.Description>
        </Alert.Root>
      </Stack>
    </Dialog>
  );
}
