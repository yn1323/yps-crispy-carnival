import { Alert, Badge, Box, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";

export type DataCompleteness = "complete" | "partial" | "unavailable" | "pending" | "error" | string;

export type AnalyticsMetadata = {
  asOf: number | string | null;
  dataStartDate: string | null;
  latestCompleteSnapshotDate: string | null;
  computedAt: number | string | null;
  completeness: DataCompleteness;
  warnings: Array<string | { code: string; message: string }>;
};

const COMPLETENESS_PRESENTATION: Record<string, { color: string; label: string }> = {
  complete: { color: "green", label: "完全" },
  error: { color: "red", label: "取得失敗" },
  partial: { color: "orange", label: "一部集計" },
  pending: { color: "blue", label: "集計待ち" },
  unavailable: { color: "gray", label: "算出不可" },
};

function formatTimestamp(value: number | string | null) {
  if (value === null || value === "") return "未集計";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function warningMessage(warning: string | { code: string; message: string }) {
  const message = typeof warning === "string" ? warning : warning.message;
  return message.replace(/^filtered_page_incomplete:\s*/, "");
}

export function CompletenessBadge({ value }: { value: DataCompleteness }) {
  const presentation = COMPLETENESS_PRESENTATION[value] ?? { color: "gray", label: value };
  return (
    <Badge colorPalette={presentation.color} variant="subtle">
      {presentation.label}
    </Badge>
  );
}

export function DataStatus({
  envLabel,
  isLoading,
  metadata,
}: {
  envLabel?: string;
  isLoading?: boolean;
  metadata?: AnalyticsMetadata;
}) {
  if (isLoading) return <Skeleton borderRadius="lg" h="88px" w="full" />;
  if (!metadata) return null;
  const stalled = metadata.completeness !== "complete";
  return (
    <Stack gap={3}>
      <Flex
        align={{ base: "start", lg: "center" }}
        bg={stalled ? "orange.50" : "white"}
        border="1px solid"
        borderColor={stalled ? "orange.200" : "gray.200"}
        borderRadius="lg"
        direction={{ base: "column", lg: "row" }}
        gap={4}
        justify="space-between"
        p={4}
      >
        <HStack gap={2} wrap="wrap">
          <CompletenessBadge value={metadata.completeness} />
          {envLabel ? <Badge variant="surface">{envLabel}</Badge> : null}
          <Badge variant="surface">蓄積開始 {metadata.dataStartDate ?? "未開始"}</Badge>
          <Badge variant="surface">最新完全日 {metadata.latestCompleteSnapshotDate ?? "未集計"}</Badge>
        </HStack>
        <Box>
          <Text color="gray.600" fontSize="xs">
            基準日時 {formatTimestamp(metadata.asOf)}
          </Text>
          <Text color="gray.500" fontSize="xs" mt={1}>
            集計完了 {formatTimestamp(metadata.computedAt)}
          </Text>
        </Box>
      </Flex>
      {metadata.warnings.length > 0 ? (
        <Alert.Root borderRadius="lg" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>データの注意事項</Alert.Title>
            <Alert.Description>{metadata.warnings.map(warningMessage).join(" / ")}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}
    </Stack>
  );
}

export function QueryError({ message }: { message: string }) {
  return (
    <Alert.Root borderRadius="lg" status="error">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>データを取得できませんでした</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function analyticsEmptyText(
  metadata: AnalyticsMetadata,
  filteredText: string,
  pageInfo?: { continueCursor: string | null; isDone: boolean; returnedCount: number },
) {
  if (metadata.completeness === "pending" || metadata.dataStartDate === null) {
    return "データ蓄積前、または集計待ちです";
  }
  if (metadata.completeness === "unavailable") return "この期間の値は算出できません";
  if (pageInfo?.returnedCount === 0 && !pageInfo.isDone && pageInfo.continueCursor) {
    return "このページには一致するデータがありません。次の候補を確認できます";
  }
  if (metadata.completeness === "partial") return "一部集計のため、対象の有無を確定できません";
  return filteredText;
}

export function mergeMetadata(primary: AnalyticsMetadata, ...others: AnalyticsMetadata[]): AnalyticsMetadata {
  const completenessRank: Record<string, number> = { complete: 0, partial: 1, pending: 2, unavailable: 3 };
  const all = [primary, ...others];
  const completeness = all.reduce(
    (worst, metadata) =>
      (completenessRank[metadata.completeness] ?? 3) > (completenessRank[worst] ?? 3) ? metadata.completeness : worst,
    primary.completeness,
  );
  const warnings = [...new Set(all.flatMap((metadata) => metadata.warnings.map(warningMessage)))];
  return { ...primary, completeness, warnings };
}
