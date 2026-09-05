import { Alert, Badge, Box, Button, Checkbox, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import type { FeatureRequestRowDto } from "@/api/analyticsTypes";
import { formatDateTime } from "@/features/analytics/format";

export function RequestsView({
  errorMessage,
  hasMore,
  isLoading,
  isLoadingMore,
  onLoadMore,
  rows,
  pending,
  errors,
  onSetDeleted,
}: {
  errorMessage: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  rows: FeatureRequestRowDto[];
  pending: ReadonlySet<string>;
  errors: Record<string, string>;
  onSetDeleted: (id: string, isDeleted: boolean) => void;
}) {
  const check = (row: FeatureRequestRowDto) => (
    <Checkbox.Root
      checked={row.isDeleted}
      disabled={pending.has(row.id)}
      onCheckedChange={(event) => onSetDeleted(row.id, event.checked === true)}
      size="lg"
    >
      <Checkbox.HiddenInput
        aria-label={`${formatDateTime(row.createdAt)}の${row.shopName}の要望を${row.isDeleted ? "未チェックに戻す" : "チェック済みにする"}`}
      />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label fontSize="xs">
        {pending.has(row.id) ? "保存中" : row.isDeleted ? "チェック済み" : "未チェック"}
      </Checkbox.Label>
    </Checkbox.Root>
  );
  return (
    <Stack gap={5}>
      {errorMessage && (
        <Alert.Root borderRadius="md" status="error">
          <Alert.Indicator />
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Root>
      )}
      {isLoading ? (
        <Stack gap={3} aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton h="64px" key={index} w="full" />
          ))}
        </Stack>
      ) : rows.length === 0 && !errorMessage ? (
        <Box bg="white" borderRadius="md" p={8} textAlign="center">
          <Text color="gray.600">届いた要望はまだありません。</Text>
        </Box>
      ) : (
        <>
          <Stack display={{ base: "flex", lg: "none" }} gap={3}>
            {rows.map((row) => (
              <Stack key={row.id} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" gap={3} p={4}>
                <Text color="gray.600" fontSize="xs">
                  {formatDateTime(row.createdAt)}
                </Text>
                <HStack align="start" justify="space-between">
                  <Stack gap={1}>
                    <Text fontWeight="bold">{row.shopName}</Text>
                    {row.organizationName && (
                      <Text fontSize="xs" color="gray.600">
                        {row.organizationName}
                      </Text>
                    )}
                  </Stack>
                  <Badge>{row.senderType === "staff" ? "スタッフ" : "管理者"}</Badge>
                </HStack>
                <Text
                  color="gray.800"
                  fontSize="sm"
                  lineHeight="tall"
                  whiteSpace="pre-wrap"
                  overflowWrap="anywhere"
                  textDecoration={row.isDeleted ? "line-through" : "none"}
                >
                  {row.comment}
                </Text>
                {check(row)}
                {errors[row.id] && (
                  <Text role="alert" color="red.700" fontSize="xs">
                    {errors[row.id]}
                  </Text>
                )}
              </Stack>
            ))}
          </Stack>
          <Box
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            display={{ base: "none", lg: "block" }}
            overflowX="auto"
          >
            <Table.Root minW="760px" size="sm" variant="line">
              <Table.Header>
                <Table.Row bg="gray.50">
                  <Table.ColumnHeader w="160px">受付日時</Table.ColumnHeader>
                  <Table.ColumnHeader w="180px">対象</Table.ColumnHeader>
                  <Table.ColumnHeader w="90px">送信者</Table.ColumnHeader>
                  <Table.ColumnHeader>要望</Table.ColumnHeader>
                  <Table.ColumnHeader w="150px">チェック</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.id} verticalAlign="top">
                    <Table.Cell color="gray.600" fontVariantNumeric="tabular-nums">
                      {formatDateTime(row.createdAt)}
                    </Table.Cell>
                    <Table.Cell overflowWrap="anywhere">
                      <Text fontWeight="bold">{row.shopName}</Text>
                      {row.organizationName && (
                        <Text color="gray.600" fontSize="xs">
                          {row.organizationName}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>{row.senderType === "staff" ? "スタッフ" : "管理者"}</Table.Cell>
                    <Table.Cell
                      color="gray.800"
                      lineHeight="tall"
                      maxW="640px"
                      whiteSpace="pre-wrap"
                      overflowWrap="anywhere"
                    >
                      <Text textDecoration={row.isDeleted ? "line-through" : "none"}>{row.comment}</Text>
                      {errors[row.id] && (
                        <Text role="alert" color="red.700" fontSize="xs" mt={2}>
                          {errors[row.id]}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>{check(row)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </>
      )}
      {hasMore && (
        <Button alignSelf="center" loading={isLoadingMore} onClick={onLoadMore} variant="outline">
          次の50件
        </Button>
      )}
    </Stack>
  );
}
