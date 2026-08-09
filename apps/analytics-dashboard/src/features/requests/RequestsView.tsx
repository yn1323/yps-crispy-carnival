import { Alert, Badge, Box, Button, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
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
        <>
          <Stack display={{ base: "flex", lg: "none" }} gap={3}>
            {rows.map((row) => (
              <Stack key={row.id} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" gap={3} p={4}>
                <Stack gap={1}>
                  <Text color="gray.500" fontSize="xs" fontVariantNumeric="tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </Text>
                  <HStack align="start" justify="space-between">
                    <Text fontWeight="bold">{row.shopName}</Text>
                    <Badge variant="surface">{row.senderType === "staff" ? "スタッフ" : "管理者"}</Badge>
                  </HStack>
                </Stack>
                <Text color="gray.800" fontSize="sm" lineHeight="tall" whiteSpace="pre-wrap">
                  {row.comment}
                </Text>
              </Stack>
            ))}
          </Stack>
          <Box
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            display={{ base: "none", lg: "block" }}
            overflowX="auto"
          >
            <Table.Root minW="560px" size="sm" variant="line">
              <Table.Header>
                <Table.Row bg="gray.50">
                  <Table.ColumnHeader w="180px">受付日時</Table.ColumnHeader>
                  <Table.ColumnHeader w="180px">店舗</Table.ColumnHeader>
                  <Table.ColumnHeader w="90px">送信者</Table.ColumnHeader>
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
        </>
      )}

      {hasMore ? (
        <Button alignSelf="center" loading={isLoadingMore} onClick={onLoadMore} variant="outline">
          次の50件
        </Button>
      ) : null}
    </Stack>
  );
}
