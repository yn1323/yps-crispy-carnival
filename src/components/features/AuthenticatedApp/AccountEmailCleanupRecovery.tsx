import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { AccountEmailChange } from "@/src/components/features/AccountEmailChange";

// 再読み込みで失われた旧メール削除の途中状態を、通常画面へ戻す前に復旧する。
export function AccountEmailCleanupRecovery() {
  return (
    <Box minH="100dvh" bg="gray.50" px={4} py={{ base: 8, md: 16 }}>
      <Stack maxW="640px" mx="auto" gap={6} bg="white" borderWidth="1px" borderRadius="xl" p={{ base: 5, md: 8 }}>
        <Box>
          <Heading as="h1" size="lg">
            メールアドレスの削除を完了してください
          </Heading>
          <Text mt={3} color="fg.muted" lineHeight="tall">
            前回のメールアドレス変更で、不要になったメールアドレスの削除が完了していません。安全確認後、削除を再試行します。
          </Text>
        </Box>

        <AccountEmailChange
          isOpen
          source="recovery"
          resumeCleanup
          onClose={() => undefined}
          onFinished={() => undefined}
        />
      </Stack>
    </Box>
  );
}
