import { Alert, Badge, Box, Flex, Skeleton, Stack, Text } from "@chakra-ui/react";

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
  complete: { color: "green", label: "集計済み" },
  error: { color: "red", label: "取得失敗" },
  partial: { color: "orange", label: "一部のみ集計" },
  pending: { color: "blue", label: "集計中" },
  unavailable: { color: "gray", label: "算出できない" },
};

const PAGE_STATUS_PRESENTATION: Record<
  string,
  { description: string; status: "error" | "info" | "warning"; title: string }
> = {
  error: {
    description: "集計処理の状態を確認してください。値を0としては扱いません。",
    status: "error",
    title: "集計状態を確認できません",
  },
  partial: {
    description: "取得できた範囲だけを表示しています。未完了の値は個別に除外します。",
    status: "warning",
    title: "一部の集計が未完了です",
  },
  pending: {
    description: "集計が完了すると、この画面へ値が表示されます。",
    status: "info",
    title: "初回集計中です",
  },
  unavailable: {
    description: "蓄積期間と表示条件を確認してください。値がない区間は0として扱いません。",
    status: "warning",
    title: "選択期間の値を算出できません",
  },
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

export function analyticsWarningMessage(warning: string | { code: string; message: string }) {
  const message = typeof warning === "string" ? warning : warning.message;
  return message.replace(/^filtered_page_incomplete:\s*/, "");
}

export function isPeriodWarning(warning: string | { code: string; message: string }) {
  const message = analyticsWarningMessage(warning);
  return message.startsWith("データ蓄積開始日") || message.startsWith("指定期間");
}

function isPaginationWarning(warning: string | { code: string; message: string }) {
  const message = typeof warning === "string" ? warning : warning.message;
  return message.startsWith("filtered_page_incomplete:");
}

export function CompletenessBadge({ value }: { value: DataCompleteness }) {
  const presentation = COMPLETENESS_PRESENTATION[value] ?? { color: "gray", label: value };
  return (
    <Badge colorPalette={presentation.color} variant="subtle">
      {presentation.label}
    </Badge>
  );
}

export function DataStatus({ isLoading, metadata }: { isLoading?: boolean; metadata?: AnalyticsMetadata }) {
  if (isLoading) return <Skeleton borderRadius="lg" h="88px" w="full" />;
  if (!metadata) return null;
  const pageStatus = PAGE_STATUS_PRESENTATION[metadata.completeness];
  const operationalWarnings = metadata.warnings.filter(
    (warning) => !isPeriodWarning(warning) && !isPaginationWarning(warning),
  );
  return (
    <Stack gap={3}>
      {pageStatus ? (
        <Alert.Root borderRadius="lg" status={pageStatus.status}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{pageStatus.title}</Alert.Title>
            <Alert.Description>{pageStatus.description}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}
      <Flex
        align={{ base: "start", md: "center" }}
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        direction={{ base: "column", md: "row" }}
        gap={3}
        justify="space-between"
        px={4}
        py={3}
      >
        <Text color="gray.600" fontSize="sm">
          {metadata.latestCompleteSnapshotDate
            ? `${metadata.latestCompleteSnapshotDate}時点`
            : `基準日時 ${formatTimestamp(metadata.asOf)}`}
          {metadata.computedAt ? ` · 集計完了 ${formatTimestamp(metadata.computedAt)}` : ""}
        </Text>
        <Box as="details" color="gray.600" fontSize="xs">
          <Box as="summary" cursor="pointer" fontWeight="bold">
            集計の詳細
          </Box>
          <Stack gap={1} mt={2} minW={{ md: "240px" }}>
            <Text>蓄積開始日: {metadata.dataStartDate ?? "未開始"}</Text>
            <Text>最新の完全な集計日: {metadata.latestCompleteSnapshotDate ?? "未集計"}</Text>
            <Text>基準日時: {formatTimestamp(metadata.asOf)}</Text>
          </Stack>
        </Box>
      </Flex>
      {operationalWarnings.length > 0 ? (
        <Alert.Root borderRadius="lg" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>集計処理の注意事項</Alert.Title>
            <Alert.Description>
              <Box as="ul" listStylePosition="inside">
                {operationalWarnings.map((warning) => {
                  const message = analyticsWarningMessage(warning);
                  return <li key={message}>{message}</li>;
                })}
              </Box>
            </Alert.Description>
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
        <Alert.Description>
          <Text>{message}</Text>
          <Text mt={1}>表示条件を確認するか、ページを再読み込みしてください。</Text>
        </Alert.Description>
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
    return "データ蓄積前、または集計中です";
  }
  if (metadata.completeness === "unavailable") return "この期間の値は算出できません";
  if (pageInfo?.returnedCount === 0 && !pageInfo.isDone && pageInfo.continueCursor) {
    return "このページには一致するデータがありません。次の候補を確認できます";
  }
  if (metadata.completeness === "partial") return "一部のみ集計されているため、対象の有無を確定できません";
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
  const warnings = [
    ...new Set(
      all.flatMap((metadata) =>
        metadata.warnings.map((warning) => (typeof warning === "string" ? warning : warning.message)),
      ),
    ),
  ];
  return { ...primary, completeness, warnings };
}
