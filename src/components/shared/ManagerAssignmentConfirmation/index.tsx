import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";

type Props = {
  personName: string;
  personEmail: string;
  mode: "addition" | "freeManagerExchange";
  replacesStaleInvitation?: boolean;
  isResend?: boolean;
  isRunning: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ManagerAssignmentConfirmation({
  personName,
  personEmail,
  mode,
  replacesStaleInvitation = false,
  isResend = false,
  isRunning,
  onCancel,
  onConfirm,
}: Props) {
  const isFreeManagerExchange = mode === "freeManagerExchange";

  return (
    <Box borderWidth="1px" borderColor={isFreeManagerExchange ? "orange.200" : "teal.200"} borderRadius="md" p={3}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Heading as="h4" fontSize="sm" fontWeight="semibold" color="gray.900">
            {isResend
              ? `${personName}さんへログイン案内を再送しますか？`
              : isFreeManagerExchange
                ? `${personName}さんを次の管理者として招待しますか？`
                : `${personName}さんを管理者として招待しますか？`}
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isResend
              ? `${personEmail}へ新しいログイン案内を送ります。以前のURLは利用できなくなります。`
              : isFreeManagerExchange
                ? `${personName}さんを次の管理者に設定します。本人のアカウント連携が完了すると自動で交代します。現在の管理者のスタッフ所属、シフト対象、通知設定は変更されません。`
                : `${personEmail}へログイン案内を送ります。本人がログインし、アカウントと店舗人物の連携が完了した時点で管理者になります。`}
          </Text>
          {replacesStaleInvitation && !isResend && (
            <Text fontSize="sm" color="orange.700" lineHeight="tall">
              以前の案内を無効にして、現在のメールアドレスへ送り直します。
            </Text>
          )}
          {isFreeManagerExchange && (
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              本人のアカウント連携が完了するまでは、現在の管理者が引き続き利用できます。
            </Text>
          )}
        </Stack>
        <HStack justify="flex-end" gap={2}>
          <Button variant="outline" onClick={onCancel} disabled={isRunning}>
            やめる
          </Button>
          <Button colorPalette="teal" loading={isRunning} onClick={onConfirm}>
            {isResend ? "ログイン案内を再送" : isFreeManagerExchange ? "次の管理者として招待" : "管理者として招待"}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
