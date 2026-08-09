import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { DataCompleteness } from "./DataStatus";
import { formatCount, formatDurationMs, formatRate } from "./format";
import { healthSignalPresentation, type MilestoneItem } from "./Presentation";
import type { HealthViewModel, KpiViewModel } from "./viewModels";

const CHART_COLORS: Record<string, string> = {
  "blue.200": "#bfdbfe",
  "blue.500": "#3b82f6",
  "gray.500": "#6b7280",
  "green.500": "#22c55e",
  "orange.500": "#f97316",
  "purple.500": "#a855f7",
  "red.500": "#ef4444",
  "teal.500": "#14b8a6",
};

const ACCENT_COLORS = {
  blue: CHART_COLORS["blue.500"],
  gray: CHART_COLORS["gray.500"],
  green: CHART_COLORS["green.500"],
  orange: CHART_COLORS["orange.500"],
  teal: CHART_COLORS["teal.500"],
} as const;

const DONUT_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#14b8a6", "#6b7280"];

type ValueKind = "count" | "duration" | "percent";

export type MetricBarItem = {
  key: string;
  label: string;
  value: number | null;
  displayValue: ReactNode;
  color?: string;
  completeness?: DataCompleteness;
  detail?: ReactNode;
};

type MetricChartDatum = {
  color: string;
  detail?: ReactNode;
  displayValue: ReactNode;
  label: string;
  value: number;
};

export type DonutItem = {
  key: string;
  label: string;
  value: number | null;
  displayValue: ReactNode;
  color?: string;
  completeness?: DataCompleteness;
};

type DonutChartDatum = {
  color: string;
  displayValue: ReactNode;
  label: string;
  value: number;
};

function plottableValue(item: MetricBarItem) {
  return (
    (item.completeness ?? "complete") === "complete" &&
    item.value !== null &&
    Number.isFinite(item.value) &&
    item.value >= 0
  );
}

function chartColor(color?: string) {
  if (!color) return CHART_COLORS["blue.500"];
  return CHART_COLORS[color] ?? color;
}

function axisValue(value: number, kind: ValueKind) {
  if (kind === "percent") return `${Math.round(value * 100)}%`;
  if (kind === "duration") return formatDurationMs(value);
  return new Intl.NumberFormat("ja-JP", { notation: "compact" }).format(value);
}

function MetricTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as MetricChartDatum | undefined;
  if (!active || !datum) return null;
  return (
    <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="md" gap={1} p={3}>
      <Text color="gray.700" fontSize="xs" fontWeight="bold">
        {datum.label}
      </Text>
      <Box color="gray.950" fontSize="sm" fontWeight="bold">
        {datum.displayValue}
      </Box>
      {datum.detail ? (
        <Box color="gray.500" fontSize="xs">
          {datum.detail}
        </Box>
      ) : null}
    </Stack>
  );
}

function DonutTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as DonutChartDatum | undefined;
  if (!active || !datum) return null;
  return (
    <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="md" gap={1} p={3}>
      <Text color="gray.700" fontSize="xs" fontWeight="bold">
        {datum.label}
      </Text>
      <Box color="gray.950" fontSize="sm" fontWeight="bold">
        {datum.displayValue}
      </Box>
    </Stack>
  );
}

export function partitionRemainder(total: number | null, included: number | null, completeness: DataCompleteness) {
  if (
    completeness !== "complete" ||
    total === null ||
    included === null ||
    !Number.isFinite(total) ||
    !Number.isFinite(included) ||
    total < 0 ||
    included < 0 ||
    included > total
  ) {
    return null;
  }
  return total - included;
}

export function VisualizationUnavailable({ children }: { children: ReactNode }) {
  return (
    <Box alignItems="center" bg="gray.50" borderRadius="md" display="flex" justifyContent="center" minH="144px" p={4}>
      <Text color="gray.500" fontSize="sm">
        {children}
      </Text>
    </Box>
  );
}

export function DonutChart({
  ariaLabel,
  centerLabel,
  centerValue,
  emptyText = "円グラフに表示できる集計済みデータがありません",
  height = 280,
  items,
}: {
  ariaLabel: string;
  centerLabel: string;
  centerValue: ReactNode;
  emptyText?: string;
  height?: number;
  items: DonutItem[];
}) {
  const allItemsComplete = items.length > 0 && items.every(plottableValue);
  const data: DonutChartDatum[] = items.map((item, index) => ({
    color: chartColor(item.color ?? DONUT_COLORS[index % DONUT_COLORS.length]),
    displayValue: item.displayValue,
    label: item.label,
    value: item.value ?? 0,
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chart = useChart<DonutChartDatum>({
    data,
    series: [{ color: CHART_COLORS["blue.500"], name: "value" }],
  });
  if (!allItemsComplete || total <= 0) {
    return <VisualizationUnavailable>{emptyText}</VisualizationUnavailable>;
  }

  return (
    <Box h={`${height}px`} position="relative">
      <Chart.Root aria-label={ariaLabel} chart={chart} h="full" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer>
            <Tooltip content={(props) => <DonutTooltip {...props} />} />
            <Legend iconType="circle" verticalAlign="bottom" />
            <Pie
              cornerRadius={3}
              data={chart.data}
              dataKey={chart.key("value")}
              innerRadius="50%"
              isAnimationActive={false}
              nameKey="label"
              outerRadius="72%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((item) => (
                <Cell key={item.label} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </Chart.Root>
      <Stack
        align="center"
        gap={0}
        insetInlineStart="50%"
        pointerEvents="none"
        position="absolute"
        top="42%"
        transform="translate(-50%, -50%)"
      >
        <Box color="gray.950" fontSize="xl" fontWeight="bold" lineHeight="1.1">
          {centerValue}
        </Box>
        <Text color="gray.500" fontSize="xs">
          {centerLabel}
        </Text>
      </Stack>
    </Box>
  );
}

export function HorizontalBarChart({
  ariaLabel,
  emptyText = "グラフに表示できる集計済みデータがありません",
  items,
  maxValue,
  valueKind = "count",
}: {
  ariaLabel: string;
  emptyText?: string;
  items: MetricBarItem[];
  maxValue?: number;
  valueKind?: ValueKind;
}) {
  const data: MetricChartDatum[] = items.filter(plottableValue).map((item) => ({
    color: chartColor(item.color),
    detail: item.detail,
    displayValue: item.displayValue,
    label: item.label,
    value: item.value ?? 0,
  }));
  const chart = useChart<MetricChartDatum>({
    data,
    series: [{ color: CHART_COLORS["blue.500"], name: "value" }],
  });
  if (data.length === 0) return <VisualizationUnavailable>{emptyText}</VisualizationUnavailable>;

  const height = Math.max(168, data.length * 52 + 48);
  return (
    <Chart.Root aria-label={ariaLabel} chart={chart} h={`${height}px`} role="img">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          accessibilityLayer
          data={chart.data}
          layout="vertical"
          margin={{ bottom: 8, left: 8, right: 20, top: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis
            axisLine={false}
            dataKey={chart.key("value")}
            domain={maxValue === undefined ? [0, "auto"] : [0, maxValue]}
            tickFormatter={(value) => axisValue(Number(value), valueKind)}
            tickLine={false}
            type="number"
          />
          <YAxis axisLine={false} dataKey="label" fontSize={12} tickLine={false} type="category" width={112} />
          <Tooltip content={(props) => <MetricTooltip {...props} />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey={chart.key("value")} isAnimationActive={false} maxBarSize={24} radius={[0, 5, 5, 0]}>
            {data.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
}

export function KpiComparisonChart({
  ariaLabel,
  emptyText,
  items,
  maxValue,
  valueKind = maxValue === 1 ? "percent" : "count",
}: {
  ariaLabel: string;
  emptyText?: string;
  items: KpiViewModel[];
  maxValue?: number;
  valueKind?: ValueKind;
}) {
  return (
    <HorizontalBarChart
      ariaLabel={ariaLabel}
      emptyText={emptyText}
      items={items.map((item) => ({
        color: ACCENT_COLORS[item.accent ?? "teal"],
        completeness: item.completeness,
        displayValue: item.value,
        key: item.key,
        label: item.label,
        value: item.numericValue,
      }))}
      maxValue={maxValue}
      valueKind={valueKind}
    />
  );
}

export function hasPlottableKpis(items: KpiViewModel[]) {
  return items.some(
    (item) =>
      item.completeness === "complete" &&
      item.numericValue !== null &&
      Number.isFinite(item.numericValue) &&
      item.numericValue >= 0,
  );
}

export function HealthDistributionChart({
  completeness,
  signals,
  totalCount,
}: {
  completeness: DataCompleteness;
  signals: HealthViewModel[];
  totalCount?: number | null;
}) {
  if (signals.length === 0) return null;
  return (
    <HorizontalBarChart
      ariaLabel="要確認状態別の店舗数"
      emptyText="要確認状態の分布は、集計完了後に表示します"
      items={signals.map((signal) => {
        const presentation = healthSignalPresentation(signal.key);
        return {
          color: presentation.color,
          completeness,
          detail:
            completeness === "complete" && totalCount !== null && totalCount !== undefined && totalCount > 0
              ? `全店舗の ${formatRate((signal.count ?? 0) / totalCount)}`
              : undefined,
          displayValue: `${formatCount(signal.count, completeness)}店舗`,
          key: signal.key,
          label: presentation.label,
          value: signal.count ?? null,
        };
      })}
      maxValue={totalCount ?? undefined}
    />
  );
}

export function MilestoneConversionChart({ items }: { items: MilestoneItem[] }) {
  const data: MetricChartDatum[] = items
    .filter(
      (item) => item.completeness === "complete" && typeof item.reachedCount === "number" && item.reachedCount >= 0,
    )
    .map((item, index) => ({
      color: index === items.length - 1 ? CHART_COLORS["green.500"] : CHART_COLORS["teal.500"],
      detail:
        item.previousStepConversionRate === undefined
          ? `到達率 ${formatRate(item.rate, item.completeness)}`
          : `到達率 ${formatRate(item.rate, item.completeness)} · 前段比 ${formatRate(item.previousStepConversionRate, item.completeness)}`,
      displayValue: `${formatCount(item.reachedCount, item.completeness)}店舗`,
      label: item.label,
      value: item.reachedCount ?? 0,
    }));
  const chart = useChart<MetricChartDatum>({
    data,
    series: [{ color: CHART_COLORS["teal.500"], name: "value" }],
  });
  if (data.length === 0 || data.every((item) => item.value === 0)) {
    return <VisualizationUnavailable>導入到達度は、集計完了後に表示します</VisualizationUnavailable>;
  }

  return (
    <Chart.Root aria-label="導入到達段階別の店舗数" chart={chart} h="280px" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <FunnelChart margin={{ bottom: 8, left: 8, right: 132, top: 8 }}>
          <Tooltip content={(props) => <MetricTooltip {...props} />} />
          <Funnel data={chart.data} dataKey={chart.key("value")} isAnimationActive={false} nameKey="label">
            {data.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
            <LabelList dataKey="label" fill="#334155" fontSize={12} position="right" />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
}
