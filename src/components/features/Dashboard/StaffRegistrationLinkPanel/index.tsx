import { Alert, Box, Code, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";

type Props = {
  registrationUrl: string | null;
  isLoading?: boolean;
  hasError?: boolean;
  onRetry?: () => void | Promise<void>;
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

export function StaffRegistrationLinkPanel({ registrationUrl, isLoading, hasError = false, onRetry }: Props) {
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

  if (hasError) return <StaffRegistrationLinkPanelError onRetry={onRetry} />;

  if (isLoading || !registrationUrl) return <StaffRegistrationLinkPanelSkeleton />;

  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <Text fontSize="sm" color="gray.800" lineHeight="tall" whiteSpace="pre-line">
          {
            "QRコードを対面で読み取ってもらうと、スタッフ本人がその場で登録できます。\n人数が多い場合は、招待リンクをまとめて共有する方法が便利です。"
          }
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          登録申請の承認後、LINE未連携の場合はスタッフに連携の案内を送ります。
          <br />
          募集中のシフトがある場合は、シフト提出リンクもあわせて送ります。
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
    </Stack>
  );
}

const StaffRegistrationLinkPanelError = ({ onRetry }: { onRetry?: () => void | Promise<void> }) => (
  <Alert.Root status="error" role="alert" alignItems="flex-start">
    <Alert.Indicator />
    <Alert.Content gap={3}>
      <Stack gap={1}>
        <Alert.Title>招待リンクを読み込めませんでした</Alert.Title>
        <Alert.Description>もう一度お試しください。</Alert.Description>
      </Stack>
      {onRetry && (
        <Box>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            もう一度読み込む
          </Button>
        </Box>
      )}
    </Alert.Content>
  </Alert.Root>
);

const QrSkeleton = () => (
  <Box width="200px" height="200px" borderRadius="md" borderWidth="1px" borderColor="blackAlpha.100" bg="white">
    <Skeleton width="full" height="full" borderRadius="md" />
  </Box>
);

const StaffRegistrationLinkPanelSkeleton = () => (
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
  </Stack>
);
