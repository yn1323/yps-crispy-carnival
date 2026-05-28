import { Box, Code, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import { STAFF_ADDITION_EMAIL_NOTICE } from "../staffAdditionCopy";

type Props = {
  registrationUrl: string | null;
  isLoading?: boolean;
};

export function StaffRegistrationLinkPanel({ registrationUrl, isLoading }: Props) {
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
    return (
      <Stack align="center" py={10} gap={3}>
        <Spinner color="teal.500" />
        <Text fontSize="sm" color="fg.muted">
          登録用リンクを準備しています
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <Stack gap={1.5}>
        <Text fontSize="sm" color="gray.700" lineHeight="tall">
          QRコードまたは、URLからスタッフ追加が可能です。人数が多い場合、QRコード・URLから登録いただくのがおすすめです。
          シフト担当者が直接スタッフを追加することも可能です。
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {STAFF_ADDITION_EMAIL_NOTICE}
        </Text>
      </Stack>

      <Stack align="center" gap={3}>
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
          <Spinner color="teal.500" />
        )}
        <Text fontSize="xs" color="fg.muted">
          スマホのカメラで読み取ってください
        </Text>
      </Stack>

      <HStack gap={2} align="center" minW={0}>
        <Code
          p={2}
          fontSize="xs"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
          bg="blackAlpha.50"
          borderRadius="md"
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
            variant="outline"
            size="sm"
            colorPalette="teal"
            flexShrink={0}
          >
            {copied ? <LuCheck /> : <LuCopy />}
          </IconButton>
        </Tooltip>
      </HStack>
    </Stack>
  );
}
