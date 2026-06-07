import { Box, Code, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  /** 認可フローの URL（state 入りの完成形） */
  authorizeUrl: string | null;
  /** mutation 中の場合 true */
  isLoading?: boolean;
  /** スタッフ名（表示用） */
  staffName: string;
};

export const LineLinkQrDialog = ({ authorizeUrl, isLoading, staffName }: Props) => {
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
    <Stack gap={4}>
      <Text fontSize="sm" color="fg.muted">
        {staffName}さんにLINE連携リンクを共有してください。72時間以内に1回だけ使えます。
      </Text>
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
          <QrSkeleton />
        )}
        <Text fontSize="xs" color="fg.muted">
          スマホのカメラで読み取ってください
        </Text>
      </Stack>
      <Code
        p={2}
        fontSize="xs"
        whiteSpace="pre-wrap"
        wordBreak="break-all"
        bg="blackAlpha.50"
        borderRadius="md"
        color="gray.800"
      >
        {authorizeUrl}
      </Code>
      <HStack>
        <Button onClick={handleCopy} variant="outline" size="sm" colorPalette="teal" gap={1.5}>
          {copied ? <LuCheck /> : <LuCopy />}
          {copied ? "コピーしました" : "リンクをコピー"}
        </Button>
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
  <Stack gap={4} aria-busy="true">
    <Stack gap={2}>
      <Skeleton h="16px" w="92%" />
      <Skeleton h="16px" w="64%" />
    </Stack>
    <Stack align="center" gap={3}>
      <QrSkeleton />
      <Skeleton h="14px" w="152px" />
    </Stack>
    <Skeleton h="56px" w="full" borderRadius="md" />
    <Skeleton h="32px" w="120px" borderRadius="md" />
  </Stack>
);
