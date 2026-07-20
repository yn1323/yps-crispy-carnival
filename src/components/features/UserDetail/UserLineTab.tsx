import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuMail, LuMessageCircle, LuQrCode } from "react-icons/lu";
import { LineLinkQrDialog } from "@/src/components/features/Line";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailMembership } from "./types";

type Props = {
  data: UserDetailData;
  membership: UserDetailMembership;
  isReadOnly: boolean;
  authorizeUrl: string | null;
  showQr: boolean;
  isQrLoading: boolean;
  isSendingInvite: boolean;
  onShowQr: () => void | Promise<void>;
  onSendInvite: () => void | Promise<void>;
};

export function UserLineTab({
  data,
  membership,
  isReadOnly,
  authorizeUrl,
  showQr,
  isQrLoading,
  isSendingInvite,
  onShowQr,
  onSendInvite,
}: Props) {
  const lineStatus = getLineStatus(membership);
  const isLineActive = membership.line.isLinked && membership.line.isFollowing;
  const hasEmail = data.person.email.length > 0;

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Text as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
          LINE連携
        </Text>
        <Text fontSize="sm" color="fg.muted">
          LINE連携は店舗ごとに設定します。
        </Text>
      </Stack>

      <Box
        borderWidth="1px"
        borderColor={lineStatus.isActive ? "teal.100" : "blackAlpha.100"}
        bg={lineStatus.isActive ? "teal.50/60" : "blackAlpha.50"}
        borderRadius="md"
        p={3}
      >
        <Stack gap={1}>
          <HStack gap={2}>
            <LuMessageCircle aria-hidden />
            <Text fontWeight="semibold">{lineStatus.label}</Text>
          </HStack>
          {lineStatus.description && (
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              {lineStatus.description}
            </Text>
          )}
        </Stack>
      </Box>

      {!isLineActive ? (
        <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
          <Stack gap={6}>
            <LineConnectionMethod
              number="1"
              title="LINE連携リンクを表示"
              description="スタッフに直接共有してください。"
            >
              <Button colorPalette="teal" gap={1.5} onClick={onShowQr} disabled={isReadOnly}>
                <LuQrCode aria-hidden />
                LINE連携リンクを表示
              </Button>
              {showQr && <LineLinkQrDialog authorizeUrl={authorizeUrl} isLoading={isQrLoading} />}
            </LineConnectionMethod>

            <LineConnectionMethod number="2" title="LINE連携リンクをメールで送る">
              <Button
                colorPalette="teal"
                gap={1.5}
                disabled={isReadOnly || !hasEmail || isSendingInvite}
                loading={isSendingInvite}
                onClick={onSendInvite}
              >
                <LuMail aria-hidden />
                メールでLINE連携リンクを送る
              </Button>
              {!hasEmail && (
                <Text fontSize="xs" color="fg.muted">
                  メールアドレスがないため、メールでは送れません。リンクを直接共有してください。
                </Text>
              )}
            </LineConnectionMethod>
          </Stack>
        </fieldset>
      ) : (
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          この店舗ではLINE連携済みです。必要な場合は、通知からシフト関連の通知を再送できます。
        </Text>
      )}
    </Stack>
  );
}

function LineConnectionMethod({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Heading as="h4" fontSize="sm" fontWeight="semibold" color="gray.900">
          {number}. {title}
        </Heading>
        {description && (
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        )}
      </Stack>
      <Stack gap={3} align="flex-start">
        {children}
      </Stack>
    </Stack>
  );
}

function getLineStatus(membership: UserDetailMembership) {
  if (!membership.line.isLinked) {
    return {
      label: "LINE未連携",
      description: undefined,
      isActive: false,
    };
  }
  if (!membership.line.isFollowing) {
    return {
      label: "LINE通知を利用できません",
      description: "LINEアカウントとの連携はありますが、現在は通知を送れません。もう一度連携してください。",
      isActive: false,
    };
  }
  return {
    label: "LINE連携済み",
    description: "この店舗のシフト関連通知をLINEで受け取れます。",
    isActive: true,
  };
}
