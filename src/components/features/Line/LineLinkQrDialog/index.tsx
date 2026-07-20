import { Box, Code, HStack, Skeleton, Stack } from "@chakra-ui/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";

type Props = {
  /** 認可フローの URL（state 入りの完成形） */
  authorizeUrl: string | null;
  /** mutation 中の場合 true */
  isLoading?: boolean;
};

export const LineLinkQrDialog = ({ authorizeUrl, isLoading }: Props) => {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authorizeUrl) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    QRCode.toString(authorizeUrl, { type: "svg", margin: 1, width: 200 })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authorizeUrl]);

  const handleCopy = async () => {
    if (!authorizeUrl) return;
    try {
      await navigator.clipboard.writeText(authorizeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  };

  if (isLoading || !authorizeUrl) {
    return <LineLinkQrDialogSkeleton />;
  }

  return (
    <Stack gap={4} w="full" maxW="full" minW={0} alignSelf="stretch">
      <Stack align="center" w="full">
        {qrSvg ? (
          <Box
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG from qrcode lib
            dangerouslySetInnerHTML={{ __html: qrSvg }}
            role="img"
            aria-label="LINE連携用QRコード"
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
      </Stack>
      <HStack gap={2} align="center" w="full" maxW="full" minW={0}>
        <Code
          title={authorizeUrl}
          p={2}
          fontSize="xs"
          display="block"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
          bg="blackAlpha.50"
          borderRadius="md"
          color="gray.800"
          flex={1}
          minW={0}
        >
          {authorizeUrl}
        </Code>
        <Tooltip content={copied ? "コピーしました" : "リンクをコピー"}>
          <IconButton
            aria-label={copied ? "コピーしました" : "リンクをコピー"}
            onClick={handleCopy}
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
};

const QrSkeleton = () => (
  <Box width="200px" height="200px" borderRadius="md" borderWidth="1px" borderColor="blackAlpha.100" bg="white">
    <Skeleton width="full" height="full" borderRadius="md" />
  </Box>
);

const LineLinkQrDialogSkeleton = () => (
  <Stack gap={4} w="full" maxW="full" minW={0} alignSelf="stretch" aria-busy="true">
    <Stack align="center" w="full">
      <QrSkeleton />
    </Stack>
    <Skeleton h="36px" w="full" borderRadius="md" />
  </Stack>
);
