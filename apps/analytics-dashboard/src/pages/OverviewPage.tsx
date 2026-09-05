import { Badge, Box, Button, Flex, Grid, Link, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchOverview } from "@/api/analyticsClient";
import type { AnalyticsDayDto, AnalyticsRangeDays, OverviewResponse } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { ChartPanel } from "@/components/ChartPanel";
import { DataTable } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import { TrendChart } from "@/components/TrendChart";
import { dayShopsPath, formatCount, formatDate, formatDateTime, METRICS } from "@/features/analytics/format";
import { AnalyticsPageLoading, Panel, QueryError } from "@/features/analytics/PageState";

const DAY_LABELS: Record<AnalyticsDayDto["status"], string> = {
  before_start: "計測開始前",
  pending: "未集計",
  running: "集計中",
  failed: "集計できませんでした",
  complete: "集計済み",
  partial: "初日は途中から計測",
};
function DayStatus({ day }: { day: AnalyticsDayDto }) {
  return (
    <Badge
      colorPalette={day.status === "failed" ? "red" : day.status === "complete" ? "gray" : "orange"}
      variant="subtle"
    >
      {DAY_LABELS[day.status]}
    </Badge>
  );
}
function downloadSummary(data: OverviewResponse) {
  // 匿名の集計専用。問い合わせDTOや内訳の識別子を出力に渡さない。
  const rows = [
    {
      type: "measurement",
      definitionVersion: data.definitionVersion,
      timezone: "Asia/Tokyo",
      startedAt: data.startedAt,
      range: data.range,
      asOf: data.asOf,
    },
    { type: "period", ...data.period },
    ...data.series.map((day) => ({
      type: "day",
      date: day.date,
      status: day.status,
      counts: day.counts,
      observationStartAt: day.observationStartAt,
      observationEndAt: day.observationEndAt,
      computedAt: day.computedAt,
    })),
  ];
  const url = URL.createObjectURL(
    new Blob([`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`], {
      type: "application/x-ndjson;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `shiftori-daily-${data.range.to}-${data.range.days}days.jsonl`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OverviewPage({ navigate }: { navigate: (path: string) => void }) {
  const selected = Number(new URLSearchParams(window.location.search).get("rangeDays"));
  const rangeDays: AnalyticsRangeDays = selected === 7 || selected === 90 ? selected : 30;
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(clock);
  const query = useQuery({
    queryKey: ["analytics", "overview", rangeDays, today],
    queryFn: ({ signal }) => fetchOverview(rangeDays, signal),
    refetchInterval: 60_000,
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  const data = query.data?.data;
  if (!data && query.isPending)
    return <AnalyticsPageLoading title="日次分析" description="前日までの登録・提出・確定を確認します。" />;
  if (!data)
    return (
      <Stack gap={5}>
        <PageHeading title="日次分析" description="前日までの登録・提出・確定を確認します。" />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </Stack>
    );
  return (
    <Stack gap={7}>
      <PageHeading
        title="日次分析"
        description="登録・提出・確定があった店舗を、日ごとに重複を除いて数えます。"
        action={
          <Button variant="outline" size="sm" onClick={() => downloadSummary(data)}>
            集計JSONLを出力
          </Button>
        }
      />
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      <Flex
        gap={3}
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        bg="white"
        borderRadius="lg"
        p={4}
      >
        <Stack gap={1}>
          <Text fontWeight="medium" fontSize="sm">
            {data.startedAt === null ? "計測開始待ち" : `${formatDateTime(data.startedAt)}から計測`}
          </Text>
          <Text fontSize="xs" color="gray.600">
            {data.startedAt === null
              ? "店舗登録・提出・確定、または定期実行から自動で開始します。店舗・スタッフは今すぐ閲覧できます。"
              : "開始前の実績は復元せず、開始後の操作を記録します。"}
          </Text>
        </Stack>
        <Text fontSize="xs" color="gray.600">
          次の集計：{formatDateTime(data.nextAggregationAt)}（日本時間）
        </Text>
      </Flex>
      <Stack gap={3}>
        <Flex gap={3} align="center" wrap="wrap">
          <Text fontSize="lg" fontWeight="bold">
            前日・{formatDate(data.yesterday.date)}
          </Text>
          <DayStatus day={data.yesterday} />
        </Flex>
        {data.yesterday.status === "partial" && (
          <Text fontSize="sm" color="gray.600">
            {formatDateTime(data.yesterday.observationStartAt)}以降の実績です。完全な一日との増減比較は行いません。
          </Text>
        )}
        <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={4}>
          {METRICS.map((metric) => (
            <Stack
              key={metric.key}
              gap={2}
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="lg"
              p={5}
            >
              <Text color="gray.700" fontWeight="bold">
                {metric.label}
              </Text>
              {data.yesterday.counts ? (
                <Link
                  href={dayShopsPath(data.yesterday.date, metric.key)}
                  color="gray.950"
                  alignSelf="start"
                  fontSize="4xl"
                  fontWeight="bold"
                  aria-label={`${metric.label} ${data.yesterday.counts[metric.key]}店舗の内訳`}
                >
                  {formatCount(data.yesterday.counts[metric.key])}
                  <Text as="span" fontSize="sm" ml={2}>
                    店舗
                  </Text>
                </Link>
              ) : (
                <Text fontSize="4xl" fontWeight="bold">
                  —
                </Text>
              )}
              <Text color="gray.600" fontSize="xs">
                {metric.description}
              </Text>
            </Stack>
          ))}
        </Grid>
      </Stack>
      <Panel title="日別推移" description="期間内の店舗数も重複を除きます。同じ店舗が毎日使っても期間内では1店舗です。">
        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Flex gap={2} role="group" aria-label="集計期間">
            {([7, 30, 90] as const).map((days) => (
              <Button
                key={days}
                size="sm"
                variant={days === rangeDays ? "solid" : "outline"}
                aria-pressed={days === rangeDays}
                onClick={() => navigate(`/?rangeDays=${days}`)}
              >
                {days}日
              </Button>
            ))}
          </Flex>
          <Text fontSize="sm" color="gray.600">
            {formatDate(data.range.from)}〜{formatDate(data.range.to)}
          </Text>
        </Flex>
        <Box bg="gray.50" p={4} borderRadius="md">
          <Text fontSize="sm" fontWeight="bold" mb={2}>
            期間内の店舗数{data.period.status === "partial" ? "（観測できた期間のみ）" : ""}
          </Text>
          {data.period.counts ? (
            <Flex gap={{ base: 4, md: 8 }} wrap="wrap">
              {METRICS.map((metric) => (
                <Text key={metric.key} fontSize="sm">
                  {metric.label} <Text as="strong">{formatCount(data.period.counts?.[metric.key])}店舗</Text>
                </Text>
              ))}
            </Flex>
          ) : (
            <Text fontSize="sm" color="gray.600">
              未確定：未集計・失敗の日を含むか、観測済みのデータがありません。
            </Text>
          )}
          <Text mt={2} color="gray.600" fontSize="xs">
            観測できた日数：{data.period.observedDays}日
            {data.period.observationStartAt !== null ? `・${formatDateTime(data.period.observationStartAt)}以降` : ""}
            。欠損は0で埋めません。
          </Text>
        </Box>
        <Grid templateColumns={{ base: "1fr", xl: "repeat(3, 1fr)" }} gap={4}>
          {METRICS.map((metric) => (
            <ChartPanel key={metric.key} title={metric.label} contentHeight="230px">
              <TrendChart
                keys={[metric.label]}
                data={data.series.map((day) => ({ date: day.date, [metric.label]: day.counts?.[metric.key] ?? null }))}
              />
            </ChartPanel>
          ))}
        </Grid>
      </Panel>
      <Panel title="日別の実績" description="店舗数から、その日に実績があった店舗の内訳を開けます。">
        <DataTable
          rows={[...data.series].reverse()}
          getRowKey={(day) => day.date}
          columns={[
            { key: "date", header: "日付", render: (day) => formatDate(day.date) },
            ...METRICS.map((metric) => ({
              key: metric.key,
              header: metric.label,
              align: "right" as const,
              render: (day: AnalyticsDayDto) =>
                day.counts ? (
                  <Link href={dayShopsPath(day.date, metric.key)} color="blue.700">
                    {formatCount(day.counts[metric.key])}
                  </Link>
                ) : (
                  "—"
                ),
            })),
            { key: "status", header: "集計状態", render: (day) => <DayStatus day={day} /> },
          ]}
          renderMobileRow={(day) => (
            <Stack gap={3}>
              <Flex justify="space-between" wrap="wrap" gap={2}>
                <Text fontWeight="bold">{formatDate(day.date)}</Text>
                <DayStatus day={day} />
              </Flex>
              {METRICS.map((metric) => (
                <Flex key={metric.key} justify="space-between">
                  <Text fontSize="sm">{metric.label}</Text>
                  {day.counts ? (
                    <Link href={dayShopsPath(day.date, metric.key)} color="blue.700">
                      {formatCount(day.counts[metric.key])}店舗
                    </Link>
                  ) : (
                    <Text>—</Text>
                  )}
                </Flex>
              ))}
            </Stack>
          )}
        />
      </Panel>
    </Stack>
  );
}
