import { Alert, Box, Heading, Stack, Text } from "@chakra-ui/react";
import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AccountEmailChange } from "@/src/components/features/AccountEmailChange";
import { Button } from "@/src/components/ui/Button";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

type Props = {
  clerkEmail: string;
  convexEmail: string;
};

export function AccountEmailMismatchRecovery({ clerkEmail, convexEmail }: Props) {
  const syncMyPrimaryEmail = useAction(api.accountEmail.actions.syncMyPrimaryEmail);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const { run: syncCurrentLoginEmail, isRunning } = useSingleFlight(async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await syncMyPrimaryEmail({ requestId: crypto.randomUUID() });
      if (result.status === "synced") {
        setInfoMessage("現在のログインメールをシフトリへ反映しました。画面を更新しています。");
        return true;
      }
      setErrorMessage(
        result.status === "rateLimited"
          ? "操作回数が上限に達しました。時間をおいて、もう一度お試しください。"
          : "メールアドレスを同期できませんでした。もう一度お試しください。",
      );
      return false;
    } catch {
      setErrorMessage("メールアドレスを同期できませんでした。もう一度お試しください。");
      return false;
    }
  });

  return (
    <Box minH="100dvh" bg="gray.50" px={4} py={{ base: 8, md: 16 }}>
      <Stack maxW="640px" mx="auto" gap={6} bg="white" borderWidth="1px" borderRadius="xl" p={{ base: 5, md: 8 }}>
        <Box>
          <Heading as="h1" size="lg">
            メールアドレスの確認が必要です
          </Heading>
          <Text mt={3} color="fg.muted" lineHeight="tall">
            ログインに使っているメールアドレスと、シフトリに登録されているメールアドレスが異なります。
            自動では上書きせず、どちらを使うか本人に確認しています。
          </Text>
        </Box>

        <Stack gap={3}>
          <EmailValue label="現在のログインメール" value={clerkEmail} />
          <EmailValue label="シフトリに登録されているメール" value={convexEmail} />
        </Stack>

        {errorMessage && (
          <Alert.Root status="error" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Root>
        )}
        {infoMessage && (
          <Alert.Root status="success" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>{infoMessage}</Alert.Description>
          </Alert.Root>
        )}

        <Stack gap={3}>
          <Button colorPalette="teal" onClick={() => setIsChangeOpen(true)} disabled={isRunning}>
            シフトリの登録メールをログインにも使う
          </Button>
          <Button variant="outline" onClick={syncCurrentLoginEmail} loading={isRunning}>
            現在のログインメールをシフトリへ反映
          </Button>
        </Stack>

        <Text fontSize="sm" color="fg.muted">
          ログインメールを変更する場合は、新しいメールでの確認コード入力とClerkの本人確認が必要です。
        </Text>
      </Stack>

      <AccountEmailChange
        isOpen={isChangeOpen}
        initialEmail={convexEmail}
        lockTargetEmail
        source="recovery"
        onClose={() => setIsChangeOpen(false)}
        onFinished={() => setIsChangeOpen(false)}
      />
    </Box>
  );
}

function EmailValue({ label, value }: { label: string; value: string }) {
  return (
    <Box borderWidth="1px" borderRadius="lg" px={4} py={3}>
      <Text fontSize="sm" color="fg.muted">
        {label}
      </Text>
      <Text mt={1} fontWeight="medium">
        {value}
      </Text>
    </Box>
  );
}
