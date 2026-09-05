import { Alert, Box, Button, Flex, Heading, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { AnalyticsApiError } from "@/api/analyticsClient";
import { PageHeading } from "@/components/PageHeading";

export function AnalyticsPageLoading({ title, description }: { title: string; description: string }) {
  return (
    <Stack gap={6} aria-busy="true" aria-label="読み込み中">
      <PageHeading title={title} description={description} />
      <Skeleton height="100px" borderRadius="lg" />
      <Skeleton height="300px" borderRadius="lg" />
    </Stack>
  );
}
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert.Root status="error" borderRadius="md">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{analyticsErrorMessage(error)}</Alert.Description>
      </Alert.Content>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          再取得
        </Button>
      )}
    </Alert.Root>
  );
}
export function analyticsErrorMessage(error: unknown) {
  return error instanceof AnalyticsApiError ? error.message : "読み込めませんでした。もう一度お試しください。";
}
export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Stack
      gap={4}
      bg="white"
      p={{ base: 4, md: 5 }}
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      minW={0}
    >
      <Box>
        <Heading as="h2" size="md">
          {title}
        </Heading>
        {description && (
          <Text fontSize="sm" color="gray.600" mt={1}>
            {description}
          </Text>
        )}
      </Box>
      {children}
    </Stack>
  );
}
export function Details({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <Box as="dl">
      {items.map((item) => (
        <Flex key={item.label} gap={4} py={2} direction={{ base: "column", sm: "row" }}>
          <Text as="dt" color="gray.600" fontSize="sm" minW="10rem">
            {item.label}
          </Text>
          <Box as="dd" fontSize="sm" fontWeight="medium" overflowWrap="anywhere">
            {item.value ?? "記録なし"}
          </Box>
        </Flex>
      ))}
    </Box>
  );
}
export function MoreButton({
  hasMore,
  loading,
  onClick,
  count,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <Flex align="center" justify="space-between" gap={4}>
      <Text color="gray.600" fontSize="xs">
        {count.toLocaleString("ja-JP")}件を表示{hasMore ? "・続きがあります" : ""}
      </Text>
      {hasMore && (
        <Button size="sm" variant="outline" loading={loading} onClick={onClick}>
          {count === 0 ? "次の候補を確認" : "続きを見る"}
        </Button>
      )}
    </Flex>
  );
}
