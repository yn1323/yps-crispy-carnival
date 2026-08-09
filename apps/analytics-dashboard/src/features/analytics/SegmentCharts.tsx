import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartPanel } from "@/components/ChartPanel";
import { formatCount, formatRate } from "./format";
import { DonutChart, VisualizationUnavailable } from "./MetricVisualizations";
import { healthSignalPresentation } from "./Presentation";
import type { SegmentRowViewModel } from "./viewModels";

const SERIES_COLORS = {
  deadline: "#3b82f6",
  final: "#22c55e",
  northStar: "#14b8a6",
  secondConfirmed: "#22c55e",
  shops: "#93c5fd",
} as const;

const DONUT_DIMENSIONS: Record<string, string> = {
  cadence: "通常周期",
  lineUsage: "LINE利用",
  plan: "プラン",
  submissionTrend: "最近の提出傾向",
};

type AdoptionDatum = {
  bucket: string;
  全店舗: number;
  "2回目確定": number | null;
};

function SeriesTooltip({
  active,
  label,
  payload,
  valueKind,
}: TooltipContentProps & { valueKind: "count" | "percent" }) {
  const entries = payload?.filter((item) => item.value !== null && item.value !== undefined) ?? [];
  if (!active || entries.length === 0) return null;
  return (
    <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="md" gap={1.5} p={3}>
      <Text color="gray.700" fontSize="xs" fontWeight="bold">
        {label}
      </Text>
      {entries.map((item) => (
        <Flex key={String(item.dataKey)} align="center" gap={3} justify="space-between">
          <Flex align="center" gap={1.5}>
            <Box bg={item.color} borderRadius="full" h="8px" w="8px" />
            <Text color="gray.600" fontSize="xs">
              {item.name}
            </Text>
          </Flex>
          <Text color="gray.950" fontSize="xs" fontWeight="bold">
            {valueKind === "percent" ? formatRate(Number(item.value)) : formatCount(Number(item.value))}
          </Text>
        </Flex>
      ))}
    </Stack>
  );
}

function SegmentAdoptionChart({ rows }: { rows: SegmentRowViewModel[] }) {
  const data: AdoptionDatum[] = rows.map((row) => ({
    bucket: row.bucket,
    全店舗: row.shopCount,
    "2回目確定":
      row.milestoneCompleteness === "complete" && row.kpiEligibleShopCount > 0 ? row.secondConfirmedCount : null,
  }));
  const chart = useChart<AdoptionDatum>({
    data,
    series: [
      { color: SERIES_COLORS.shops, name: "全店舗" },
      { color: SERIES_COLORS.secondConfirmed, name: "2回目確定" },
    ],
  });
  if (data.length === 0) {
    return <VisualizationUnavailable>導入進捗は、区分の集計完了後に表示します</VisualizationUnavailable>;
  }

  return (
    <Chart.Root
      aria-label="区分別の全店舗数と到達度対象の2回目確定店舗数"
      chart={chart}
      h={`${Math.max(220, data.length * 66 + 64)}px`}
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          accessibilityLayer
          data={chart.data}
          layout="vertical"
          margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis allowDecimals={false} axisLine={false} tickLine={false} type="number" />
          <YAxis axisLine={false} dataKey="bucket" fontSize={12} tickLine={false} type="category" width={116} />
          <Tooltip content={(props) => <SeriesTooltip {...props} valueKind="count" />} cursor={{ fill: "#f8fafc" }} />
          <Legend content={<Chart.Legend />} />
          <Bar
            dataKey={chart.key("全店舗")}
            fill={chart.color(SERIES_COLORS.shops)}
            isAnimationActive={false}
            maxBarSize={18}
            radius={[0, 4, 4, 0]}
          />
          <Bar
            dataKey={chart.key("2回目確定")}
            fill={chart.color(SERIES_COLORS.secondConfirmed)}
            isAnimationActive={false}
            maxBarSize={18}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
}

function SegmentCompositionDonut({ label, rows }: { label: string; rows: SegmentRowViewModel[] }) {
  const total = rows.reduce((sum, row) => sum + row.shopCount, 0);
  return (
    <DonutChart
      ariaLabel={`${label}別の店舗構成比`}
      centerLabel="全店舗"
      centerValue={`${formatCount(total)}店舗`}
      items={rows.map((row) => ({
        completeness: "complete",
        displayValue: `${formatCount(row.shopCount)}店舗`,
        key: `${row.dimension}:${row.bucket}`,
        label: row.bucket,
        value: row.shopCount,
      }))}
    />
  );
}

type RateDatum = {
  bucket: string;
  開始前確定周期率: number | null;
  期限内提出率: number | null;
  最終提出率: number | null;
};

function SegmentRateChart({ rows }: { rows: SegmentRowViewModel[] }) {
  const data: RateDatum[] = rows
    .filter(
      (row) =>
        row.completeness === "complete" &&
        [row.northStarRate, row.deadlineSubmissionRate, row.finalSubmissionRate].some((value) => value !== null),
    )
    .map((row) => ({
      bucket: row.bucket,
      開始前確定周期率: row.northStarRate,
      期限内提出率: row.deadlineSubmissionRate,
      最終提出率: row.finalSubmissionRate,
    }));
  const chart = useChart<RateDatum>({
    data,
    series: [
      { color: SERIES_COLORS.northStar, name: "開始前確定周期率" },
      { color: SERIES_COLORS.deadline, name: "期限内提出率" },
      { color: SERIES_COLORS.final, name: "最終提出率" },
    ],
  });
  if (data.length === 0) {
    return (
      <VisualizationUnavailable>
        運用KPIは、提出率を算出できる完全なシフト周期がある区分だけ表示します
      </VisualizationUnavailable>
    );
  }

  return (
    <Chart.Root
      aria-label="区分別の開始前確定周期率、期限内提出率、最終提出率"
      chart={chart}
      h={`${Math.max(240, data.length * 82 + 72)}px`}
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          accessibilityLayer
          data={chart.data}
          layout="vertical"
          margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis
            axisLine={false}
            domain={[0, 1]}
            tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
            tickLine={false}
            type="number"
          />
          <YAxis axisLine={false} dataKey="bucket" fontSize={12} tickLine={false} type="category" width={116} />
          <Tooltip content={(props) => <SeriesTooltip {...props} valueKind="percent" />} cursor={{ fill: "#f8fafc" }} />
          <Legend content={<Chart.Legend />} />
          {chart.series.map((item) => (
            <Bar
              key={String(item.name)}
              dataKey={chart.key(item.name)}
              fill={chart.color(item.color)}
              isAnimationActive={false}
              maxBarSize={15}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
}

type HeatmapDatum = {
  bucket: string;
  color: string;
  count: number;
  rate: number;
  shopCount: number;
  signal: string;
  x: number;
  y: number;
  z: number;
};

function heatColor(rate: number) {
  if (rate >= 0.75) return "#60a5fa";
  if (rate >= 0.5) return "#93c5fd";
  if (rate >= 0.25) return "#bfdbfe";
  if (rate > 0) return "#dbeafe";
  return "#f3f4f6";
}

function HeatmapTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as HeatmapDatum | undefined;
  if (!active || !datum) return null;
  return (
    <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="md" gap={1} p={3}>
      <Text color="gray.700" fontSize="xs" fontWeight="bold">
        {datum.bucket} · {datum.signal}
      </Text>
      <Text color="gray.950" fontSize="sm" fontWeight="bold">
        {formatRate(datum.rate)}
      </Text>
      <Text color="gray.500" fontSize="xs">
        {formatCount(datum.count)} / {formatCount(datum.shopCount)}店舗
      </Text>
    </Stack>
  );
}

function SegmentHealthChart({ rows }: { rows: SegmentRowViewModel[] }) {
  const completeRows = rows.filter((row) => row.completeness === "complete");
  const signalKeys = [...new Set(completeRows.flatMap((row) => row.healthSignals.map((signal) => signal.key)))];
  const data: HeatmapDatum[] = completeRows.flatMap((row, y) =>
    signalKeys.map((key, x) => {
      const count = row.healthSignals.find((signal) => signal.key === key)?.count ?? 0;
      const rate = row.shopCount > 0 ? count / row.shopCount : 0;
      return {
        bucket: row.bucket,
        color: heatColor(rate),
        count,
        rate,
        shopCount: row.shopCount,
        signal: healthSignalPresentation(key).label,
        x,
        y,
        z: 1,
      };
    }),
  );
  const chart = useChart<HeatmapDatum>({
    data,
    series: [{ color: "#93c5fd", name: "rate" }],
  });
  if (completeRows.length === 0 || signalKeys.length === 0) {
    return <VisualizationUnavailable>状態分布は、区分の集計完了後に表示します</VisualizationUnavailable>;
  }

  const minWidth = Math.max(560, signalKeys.length * 112 + 152);
  return (
    <Box overflowX="auto" pb={2}>
      <Chart.Root
        aria-label="区分と要確認状態の該当率ヒートマップ"
        chart={chart}
        h={`${Math.max(260, completeRows.length * 58 + 104)}px`}
        minW={`${minWidth}px`}
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <ScatterChart accessibilityLayer margin={{ bottom: 68, left: 16, right: 24, top: 12 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              domain={[-0.5, signalKeys.length - 0.5]}
              height={64}
              interval={0}
              tickFormatter={(value) => healthSignalPresentation(signalKeys[Number(value)]).label}
              ticks={signalKeys.map((_, index) => index)}
              type="number"
            />
            <YAxis
              dataKey="y"
              domain={[-0.5, completeRows.length - 0.5]}
              reversed
              tickFormatter={(value) => completeRows[Number(value)]?.bucket ?? ""}
              ticks={completeRows.map((_, index) => index)}
              type="number"
              width={120}
            />
            <ZAxis dataKey="z" range={[900, 900]} type="number" />
            <Tooltip content={(props) => <HeatmapTooltip {...props} />} cursor={false} />
            <Scatter data={chart.data} isAnimationActive={false} shape="square">
              {data.map((item) => (
                <Cell key={`${item.bucket}:${item.signal}`} fill={item.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Chart.Root>
    </Box>
  );
}

export function SegmentComparisonCharts({ dimension, rows }: { dimension: string; rows: SegmentRowViewModel[] }) {
  if (rows.length === 0) return null;
  const donutDimensionLabel = DONUT_DIMENSIONS[dimension];
  const hasRateData = rows.some(
    (row) =>
      row.completeness === "complete" &&
      [row.northStarRate, row.deadlineSubmissionRate, row.finalSubmissionRate].some((value) => value !== null),
  );
  const hasHealthData = rows.some((row) => row.completeness === "complete" && row.healthSignals.length > 0);
  return (
    <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
      {donutDimensionLabel ? (
        <ChartPanel
          contentHeight="auto"
          description={`選択期間の店舗を${donutDimensionLabel}の区分ごとに分けています。`}
          title={`${donutDimensionLabel}の構成比`}
        >
          <SegmentCompositionDonut label={donutDimensionLabel} rows={rows} />
        </ChartPanel>
      ) : null}
      <ChartPanel
        contentHeight="auto"
        description="全店舗と、到達度対象のうち2回目確定した店舗を区分ごとに比較します。"
        title="導入進捗の比較"
      >
        <SegmentAdoptionChart rows={rows} />
      </ChartPanel>
      {hasRateData ? (
        <ChartPanel
          contentHeight="auto"
          description="3つの率を0〜100%の共通尺度で比較します。算出できない値は描画しません。"
          title="運用KPIの比較"
        >
          <SegmentRateChart rows={rows} />
        </ChartPanel>
      ) : null}
      {hasHealthData ? (
        <Box gridColumn={{ xl: "1 / -1" }}>
          <ChartPanel
            contentHeight="auto"
            description="色が濃いほど区分内の該当率が高い状態です。状態同士の重複を許容しています。"
            title="状態分布の比較"
          >
            <SegmentHealthChart rows={rows} />
          </ChartPanel>
        </Box>
      ) : null}
    </Grid>
  );
}
