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
  const heading = isFreeManagerExchange
    ? `${personName}さんへ管理者交代の案内を${isResend ? "再送しますか？" : "送りますか？"}`
    : isResend
      ? `${personName}さんへログイン案内を再送しますか？`
      : `${personName}さんを管理者として招待しますか？`;
  const description = isFreeManagerExchange
    ? `${personName}さんがログインして招待を受け入れると、このグループの唯一の管理者になります。\nその時点で、あなたはこのグループの管理者ではなくなり、グループ設定や店舗情報へアクセスできなくなります。`
    : isResend
      ? `${personEmail}へ新しいログイン案内を送ります。\n以前のURLは利用できなくなります。`
      : `${personEmail}へログイン案内を送ります。\n本人が案内先のメールアドレスでログインし、招待を受け入れると管理者になります。`;
  const confirmLabel = isFreeManagerExchange
    ? isResend
      ? "交代の案内を再送"
      : "交代の案内を送る"
    : isResend
      ? "ログイン案内を再送"
      : "管理者として招待";

  return (
    <Box
      borderWidth="1px"
      borderColor={isFreeManagerExchange ? "orange.200" : "border.default"}
      borderRadius="md"
      p={3}
    >
      <Stack gap={3}>
        <Stack gap={1}>
          <Heading as="h4" fontSize="sm" fontWeight="semibold" color="gray.900">
            {heading}
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
            {description}
          </Text>
          {isFreeManagerExchange && isResend && (
            <Text fontSize="sm" color="orange.700" lineHeight="tall">
              {personEmail}へ新しい管理者交代の案内を送ります。
              <br />
              以前のURLは利用できなくなります。
            </Text>
          )}
          {replacesStaleInvitation && !isResend && (
            <Text fontSize="sm" color="orange.700" lineHeight="tall">
              以前の案内を無効にして、現在のメールアドレスへ送り直します。
            </Text>
          )}
          {isFreeManagerExchange && (
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              交代が完了するまでは、あなたが引き続き管理できます。
              <br />
              現在の管理者のスタッフとしての所属、シフト対象の設定、通知設定は変更されません。
            </Text>
          )}
        </Stack>
        <HStack justify="flex-end" gap={2}>
          <Button variant="outline" onClick={onCancel} disabled={isRunning}>
            やめる
          </Button>
          <Button colorPalette="teal" loading={isRunning} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
