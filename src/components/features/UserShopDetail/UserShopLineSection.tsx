import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuMail, LuMessageCircle, LuQrCode } from "react-icons/lu";
import { LineLinkQrDialog } from "@/src/components/features/Line";
import { Button } from "@/src/components/ui/Button";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";

type Props = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
  authorizeUrl: string | null;
  showQr: boolean;
  isQrLoading: boolean;
  isSendingInvite: boolean;
  onShowQr: () => void | Promise<void>;
  onSendInvite: () => void | Promise<void>;
};

export function UserShopLineSection({
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
        <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
          LINE連携
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
          LINE連携は店舗ごとに設定してください。
          {!isLineActive && "\nいずれかの方法でスタッフを招待してください。"}
        </Text>
      </Stack>

      <Box
        borderWidth="1px"
        borderColor="border.default"
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
            <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
              {lineStatus.description}
            </Text>
          )}
        </Stack>
      </Box>

      {!isLineActive && (
        <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
          <Stack gap={6}>
            <LineConnectionMethod number="1" title="LINE連携リンクを表示">
              <Button
                alignSelf="flex-end"
                colorPalette="teal"
                gap={1.5}
                onClick={onShowQr}
                disabled={isReadOnly || showQr}
                loading={isQrLoading}
              >
                <LuQrCode aria-hidden />
                LINE連携リンクを表示
              </Button>
              {showQr && (
                <Stack gap={3} w="full">
                  <Stack gap={1} fontSize="sm" color="fg.muted" lineHeight="tall">
                    <Text>{data.person.name}さん専用のURL（QRコード）です。</Text>
                    <Text>スタッフ本人に直接共有してください。</Text>
                    <Text>ほかのスタッフには共有しないでください。</Text>
                  </Stack>
                  <LineLinkQrDialog authorizeUrl={authorizeUrl} isLoading={isQrLoading} />
                </Stack>
              )}
            </LineConnectionMethod>

            <LineConnectionMethod number="2" title="LINE連携リンクをメールで送る">
              <Button
                alignSelf="flex-end"
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
                  メールアドレスが未登録のため、メールでは送れません。
                  <br />
                  リンクを直接共有してください。
                </Text>
              )}
            </LineConnectionMethod>
          </Stack>
        </fieldset>
      )}
    </Stack>
  );
}

function LineConnectionMethod({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <Stack gap={3}>
      <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
        {number}. {title}
      </Heading>
      <Stack gap={3} align="flex-start">
        {children}
      </Stack>
    </Stack>
  );
}

function getLineStatus(membership: UserShopDetailMembership) {
  if (!membership.line.isLinked) {
    return { label: "LINE未連携", description: undefined, isActive: false };
  }
  if (!membership.line.isFollowing) {
    return {
      label: "LINE通知を利用できません",
      description: "LINEアカウントと連携済みですが、現在は通知を送れません。\nもう一度連携してください。",
      isActive: false,
    };
  }
  return {
    label: "LINE連携済み",
    description: "この店舗のシフト関連通知をLINEで受け取れます。",
    isActive: true,
  };
}
