import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuMail, LuMessageCircle, LuQrCode } from "react-icons/lu";
import { LineLinkQrDialog } from "@/src/components/features/Line";
import { Button } from "@/src/components/ui/Button";
import type { StaffLineStatus } from "./staffDetailPresentation";

type Props = {
  lineStatus: StaffLineStatus;
  isLineActive: boolean;
  hasEmail: boolean;
  showLineQr: boolean;
  lineAuthorizeUrl: string | null;
  isLineQrLoading: boolean;
  onShowLineQr: () => void | Promise<void>;
  sendLineInviteAction: {
    isDisabled: boolean;
    isLoading: boolean;
    onAction: () => void | Promise<void>;
  };
};

export const StaffDetailLineTab = ({
  lineStatus,
  isLineActive,
  hasEmail,
  showLineQr,
  lineAuthorizeUrl,
  isLineQrLoading,
  onShowLineQr,
  sendLineInviteAction,
}: Props) => (
  <Stack gap={5}>
    <Box
      borderWidth="1px"
      borderColor={lineStatus.tone === "brand" ? "teal.100" : "blackAlpha.100"}
      bg={lineStatus.tone === "brand" ? "teal.50/60" : "blackAlpha.50"}
      borderRadius="md"
      p={3}
    >
      <Stack gap={1}>
        <HStack gap={2}>
          <LuMessageCircle />
          <Text fontWeight="semibold">{lineStatus.label}</Text>
        </HStack>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
          {lineStatus.description}
        </Text>
      </Stack>
    </Box>

    {!isLineActive && (
      <Stack gap={5}>
        <Stack gap={3}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            次のいずれかの方法でLINE連携できます。
          </Text>
          <Text fontSize="xs" color="fg.muted" lineHeight="tall">
            ※スタッフ登録時に、LINE連携リンクをメールで自動送信しています。
          </Text>
        </Stack>

        <LineConnectionMethod number="1" title="LINE連携リンクを表示" description="スタッフに直接共有してください。">
          <Button colorPalette="teal" gap={1.5} onClick={onShowLineQr}>
            <LuQrCode />
            LINE連携リンクを表示
          </Button>
          {showLineQr && <LineLinkQrDialog authorizeUrl={lineAuthorizeUrl} isLoading={isLineQrLoading} />}
        </LineConnectionMethod>

        <LineConnectionMethod
          number="2"
          title="LINE連携リンクをメールで送る"
          description="スタッフのメールアドレスにLINE連携リンクを送ります。"
        >
          <Button
            colorPalette="teal"
            gap={1.5}
            disabled={sendLineInviteAction.isDisabled}
            loading={sendLineInviteAction.isLoading}
            onClick={sendLineInviteAction.onAction}
          >
            <LuMail />
            メールでLINE連携リンクを送る
          </Button>
          {!hasEmail && (
            <Text fontSize="xs" color="fg.muted">
              メールアドレスが未登録のため、メールでは送れません。
              <br />
              リンクを直接共有してください。
            </Text>
          )}
        </LineConnectionMethod>
      </Stack>
    )}

    {isLineActive && (
      <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
        このスタッフはLINE連携済みです。
        <br />
        必要な場合は、通知タブからシフト関連の通知を再送できます。
      </Text>
    )}
  </Stack>
);

const LineConnectionMethod = ({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Stack gap={3}>
    <Stack gap={1}>
      <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
        {number}. {title}
      </Heading>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        {description}
      </Text>
    </Stack>
    <Stack gap={3} align="flex-start">
      {children}
    </Stack>
  </Stack>
);
