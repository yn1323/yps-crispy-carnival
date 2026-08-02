import { Button, Stack, Text } from "@chakra-ui/react";
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
        AI向けJSONLを出力
      </Button>
      <Text color="gray.500" fontSize="xs" textAlign={{ base: "left", md: "right" }}>
        選択期間の分析データを1行1レコードで保存します。グループ・店舗はIDだけを含み、名前・個人情報・要望は含みません。
      </Text>
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
