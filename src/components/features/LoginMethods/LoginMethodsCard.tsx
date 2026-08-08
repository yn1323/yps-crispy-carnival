import { Badge, Box, Flex, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import { FcGoogle } from "react-icons/fc";
import { LuKeyRound, LuMail } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { LoginMethodsController, LoginMethodsEmailViewModel } from "./types";
import type { PasswordChangeController } from "./usePasswordChangeController";

export function LoginMethodsCard({
  controller,
  passwordChangeController,
  onSetPassword,
  onConnectGoogle,
  onRequestGoogleDisconnect,
}: {
  controller: LoginMethodsController;
  passwordChangeController: PasswordChangeController;
  onSetPassword: () => void;
  onConnectGoogle: () => void;
  onRequestGoogleDisconnect: (externalAccountId: string) => Promise<void>;
}) {
  return (
    <Stack gap={3}>
      <Text color="fg.muted" fontSize="sm">
        Google認証、メールアドレス両方でログインできます。
        <br />
        シフト通知は、個別のユーザーに設定されているメール、LINEに送ります。
      </Text>
      <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden" bg="white">
        <Box p={{ base: 3, md: 4 }} bg="white">
          <EmailContent controller={controller} onSetPassword={onSetPassword} />
        </Box>
        {controller.viewModel.emailPassword.canChangePassword ? (
          <Box borderTopWidth="1px" borderColor="blackAlpha.100" p={{ base: 3, md: 4 }}>
            <PasswordContent controller={passwordChangeController} />
          </Box>
        ) : null}
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
    </Stack>
  );
}

function PasswordContent({ controller }: { controller: PasswordChangeController }) {
  return (
    <Stack gap={2} as="section" aria-labelledby="login-methods-password-heading">
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
          <Icon as={LuKeyRound} boxSize={{ base: 5, md: 6 }} aria-hidden />
        </Box>
        <Stack gap={1} flex="1" minW={0}>
          <Text id="login-methods-password-heading" as="h3" fontSize="lg" fontWeight="semibold">
            パスワード
          </Text>
          <Text color="fg.muted" fontSize="sm">
            設定済み
          </Text>
        </Stack>
        <Button
          variant="outline"
          colorPalette="teal"
          aria-label="パスワードを変更"
          loading={controller.state.isOpen && controller.state.status === "loading"}
          onClick={controller.open}
        >
          変更する
        </Button>
      </Flex>
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
    </Stack>
  );
}
