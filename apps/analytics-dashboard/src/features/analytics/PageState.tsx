import { Alert, Grid, Skeleton, Stack } from "@chakra-ui/react";
import { AnalyticsApiError } from "@/api/analyticsClient";
import { PageHeading } from "@/components/PageHeading";
import { type AnalyticsMetadata, DataStatus, QueryError } from "./DataStatus";

export function AnalyticsPageLoading({ description, title }: { description: string; title: string }) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description={description} title={title} />
      <Skeleton borderRadius="lg" h="88px" />
      <Skeleton borderRadius="lg" h="176px" />
      <Grid gap={4} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton h="132px" key={index} />
        ))}
      </Grid>
      <Skeleton borderRadius="lg" h="360px" />
    </Stack>
  );
}

export function AnalyticsPageError({
  description,
  message,
  title,
}: {
  description: string;
  message: string;
  title: string;
}) {
  return (
    <Stack gap={6}>
      <PageHeading description={description} title={title} />
      <QueryError message={message} />
    </Stack>
  );
}

export function AnalyticsEntityUnavailable({
  description,
  metadata,
  title,
}: {
  description: string;
  metadata: AnalyticsMetadata;
  title: string;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description={description} title={title} />
      <DataStatus metadata={metadata} />
      <Alert.Root borderRadius="lg" status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>分析データを利用できません</Alert.Title>
          <Alert.Description>
            最新の夜間集計が完了していないか、選択期間に欠損があります。利用できない値を0件としては表示しません。
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    </Stack>
  );
}

export function analyticsErrorMessage(error: unknown) {
  if (error instanceof AnalyticsApiError) return `${error.message}（HTTP ${error.status}）`;
  return "分析データを読み込めませんでした。条件を確認して、もう一度お試しください。";
}
