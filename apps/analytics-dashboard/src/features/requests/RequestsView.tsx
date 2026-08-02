import { Alert, Box, Button, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import type { FeatureRequestRowDto } from "@/api/analyticsTypes";
import { formatDateTime } from "@/features/analytics/format";

export function RequestsView({
  errorMessage,
  hasMore,
  isLoading,
  isLoadingMore,
  onLoadMore,
  rows,
}: {
  errorMessage: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  rows: FeatureRequestRowDto[];
}) {
  return (
    <Stack gap={5}>
      {errorMessage ? (
        <Alert.Root borderRadius="md" status="error">
          <Alert.Indicator />
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Root>
      ) : null}

      {isLoading ? (
        <Stack gap={3}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton h="64px" key={index} w="full" />
          ))}
        </Stack>
      ) : rows.length === 0 && !errorMessage ? (
        <Box bg="gray.50" borderRadius="md" p={{ base: 5, md: 8 }} textAlign="center">
          <Text color="gray.600">届いた要望はまだありません。</Text>
        </Box>
      ) : (
        <Box border="1px solid" borderColor="gray.200" borderRadius="md" overflowX="auto">
          <Table.Root minW="560px" size="sm" variant="line">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader w="180px">受付日時</Table.ColumnHeader>
                <Table.ColumnHeader w="180px">店舗</Table.ColumnHeader>
                <Table.ColumnHeader w="90px">ユーザー</Table.ColumnHeader>
                <Table.ColumnHeader>要望</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} verticalAlign="top">
                  <Table.Cell color="gray.600" fontVariantNumeric="tabular-nums" whiteSpace="nowrap">
                    {formatDateTime(row.createdAt)}
                  </Table.Cell>
                  <Table.Cell maxW="180px">
                    <Text color="gray.900" fontWeight="bold" title={row.shopName} truncate>
                      {row.shopName}
                    </Text>
                  </Table.Cell>
                  <Table.Cell color="gray.700" whiteSpace="nowrap">
                    {row.senderType === "staff" ? "スタッフ" : "管理者"}
                  </Table.Cell>
                  <Table.Cell color="gray.800" lineHeight="tall" maxW="640px" whiteSpace="pre-wrap">
                    {row.comment}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {hasMore ? (
        <Button alignSelf="center" loading={isLoadingMore} onClick={onLoadMore} variant="outline">
          もっと見る
        </Button>
      ) : null}
    </Stack>
  );
}
