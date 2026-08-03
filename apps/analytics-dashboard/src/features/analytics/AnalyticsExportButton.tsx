import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { useRef, useState } from "react";
import { AnalyticsApiError } from "@/api/analyticsClient";
import { AnalyticsExportError, buildAnalyticsJsonlExport, downloadAnalyticsJsonl } from "./buildAnalyticsJsonlExport";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";

function exportErrorMessage(error: unknown) {
  if (error instanceof AnalyticsApiError) return `${error.message}（HTTP ${error.status}）`;
  if (error instanceof AnalyticsExportError) return error.message;
  return "JSONLを作成できませんでした。分析データの状態を確認して、もう一度お試しください。";
}

export function AnalyticsExportButton({ search }: { search: AnalyticsSearchState }) {
  const runningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setIsRunning(true);
    setStatus("JSONL出力を準備しています");
    try {
      const value = await buildAnalyticsJsonlExport(search, setStatus);
      downloadAnalyticsJsonl(value, search);
      setStatus("JSONLを保存しました");
    } catch (caught) {
      setError(exportErrorMessage(caught));
      setStatus(null);
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  return (
    <Stack align={{ base: "stretch", md: "end" }} gap={1} maxW={{ base: "full", md: "360px" }}>
      <Button
        colorPalette="blue"
        disabled={isRunning}
        loading={isRunning}
        loadingText="JSONLを作成中"
        onClick={run}
        size="sm"
        variant="outline"
      >
        データを書き出す
      </Button>
      <Box as="details" color="gray.500" fontSize="xs" textAlign={{ base: "left", md: "right" }}>
        <Box as="summary" cursor="pointer">
          書き出す内容
        </Box>
        <Text mt={1}>選択期間の分析データをJSONLで保存します。名前、個人情報、要望は含みません。</Text>
      </Box>
      {status ? (
        <Text aria-live="polite" color="blue.700" fontSize="xs" textAlign={{ base: "left", md: "right" }}>
          {status}
        </Text>
      ) : null}
      {error ? (
        <Text color="red.600" fontSize="xs" role="alert" textAlign={{ base: "left", md: "right" }}>
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
