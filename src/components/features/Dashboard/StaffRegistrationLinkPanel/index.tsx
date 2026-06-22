import { Box, Code, Flex, HStack, Separator, Skeleton, Stack, Text } from "@chakra-ui/react";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";

type Props = {
  registrationUrl: string | null;
  isLoading?: boolean;
  manualEntryAction?: ReactNode;
};

function InviteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={3}>
      <HStack gap={3} align="center">
        <Box w="3px" h="24px" borderRadius="full" bg="teal.500" flexShrink={0} />
        <Text fontSize="md" fontWeight="semibold" color="gray.900">
          {title}
        </Text>
      </HStack>
      {children}
    </Stack>
  );
}

export function StaffRegistrationLinkPanel({ registrationUrl, isLoading, manualEntryAction }: Props) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!registrationUrl) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    QRCode.toString(registrationUrl, { type: "svg", margin: 1, width: 200 })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [registrationUrl]);

  const handleCopy = async () => {
    if (!registrationUrl) return;
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // コピーできない環境ではURL表示を見てもらう。
    }
  };

  if (isLoading || !registrationUrl) {
    return <StaffRegistrationLinkPanelSkeleton showManualEntryAction={Boolean(manualEntryAction)} />;
  }

  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <Text fontSize="sm" color="gray.800" lineHeight="tall">
          スタッフにQRコードを読み取ってもらうと、スタッフ本人が登録できます。
          <br />
          人数が多い場合は、招待リンクの共有がおすすめです。
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          申請を承認すると、LINE連携案内を送ります。募集中シフトがある場合は提出リンクも送ります。
        </Text>
      </Stack>

      <InviteSection title="QRコードで招待">
        <Stack align="center" gap={2}>
          {qrSvg ? (
            <Box
              // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG from qrcode lib
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              width="200px"
              height="200px"
              borderRadius="md"
              borderWidth="1px"
              borderColor="blackAlpha.100"
              bg="white"
            />
          ) : (
            <QrSkeleton />
          )}
          <Text fontSize="xs" color="fg.muted">
            スタッフに読み取ってもらってください
          </Text>
        </Stack>
      </InviteSection>

      <InviteSection title="招待リンクを共有">
        <HStack
          gap={0}
          align="stretch"
          minW={0}
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="md"
          overflow="hidden"
        >
          <Code
            px={3}
            py={2.5}
            fontSize="sm"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            bg="white"
            color="gray.800"
            flex={1}
            minW={0}
          >
            {registrationUrl}
          </Code>
          <Tooltip content={copied ? "コピーしました" : "リンクをコピー"}>
            <IconButton
              aria-label={copied ? "コピーしました" : "リンクをコピー"}
              onClick={handleCopy}
              variant="ghost"
              size="sm"
              colorPalette="teal"
              borderRadius={0}
              borderLeftWidth="1px"
              borderLeftColor="border.default"
              flexShrink={0}
              alignSelf="stretch"
              minW="56px"
            >
              {copied ? <LuCheck /> : <LuCopy />}
            </IconButton>
          </Tooltip>
        </HStack>
      </InviteSection>

      {manualEntryAction && (
        <>
          <Separator />
          <Flex
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify="flex-end"
            gap={3}
          >
            <Text fontSize="sm" color="gray.800">
              自分で追加したい場合はこちら
            </Text>
            {manualEntryAction}
          </Flex>
        </>
      )}
    </Stack>
  );
}

const QrSkeleton = () => (
  <Box width="200px" height="200px" borderRadius="md" borderWidth="1px" borderColor="blackAlpha.100" bg="white">
    <Skeleton width="full" height="full" borderRadius="md" />
  </Box>
);

const StaffRegistrationLinkPanelSkeleton = ({ showManualEntryAction }: { showManualEntryAction: boolean }) => (
  <Stack gap={5} aria-busy="true">
    <Stack gap={2}>
      <Skeleton h="16px" w="94%" />
      <Skeleton h="16px" w="74%" />
      <Skeleton h="16px" w="86%" />
    </Stack>

    <InviteSection title="QRコードで招待">
      <Stack align="center" gap={2}>
        <QrSkeleton />
        <Skeleton h="14px" w="172px" />
      </Stack>
    </InviteSection>

    <InviteSection title="招待リンクを共有">
      <HStack gap={0} align="stretch" minW={0} borderWidth="1px" borderColor="border.default" borderRadius="md">
        <Skeleton h="40px" flex={1} borderRadius={0} />
        <Skeleton boxSize="40px" borderRadius={0} />
      </HStack>
    </InviteSection>

    {showManualEntryAction && (
      <>
        <Separator />
        <Stack gap={3}>
          <Skeleton h="16px" w="128px" />
          <Skeleton h="16px" w="88%" />
          <Skeleton h="36px" w="144px" borderRadius="md" />
        </Stack>
      </>
    )}
  </Stack>
);
