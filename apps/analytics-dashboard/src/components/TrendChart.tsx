import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

export type ChartDatum = Record<string, number | string | null>;

const COLORS = ["#0f766e", "#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#475569"];

type TrendChartProps = {
  data: ChartDatum[];
  keys: string[];
  kind?: "line" | "bar";
  valueKind?: "count" | "percent";
};

function formatChartValue(value: unknown, kind: NonNullable<TrendChartProps["valueKind"]>) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "");
  if (kind === "percent") {
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1, style: "percent" }).format(numericValue);
  }
  return new Intl.NumberFormat("ja-JP").format(numericValue);
}

function TrendTooltip({
  active,
  label,
  payload,
  valueKind,
}: TooltipContentProps & { valueKind: NonNullable<TrendChartProps["valueKind"]> }) {
  const entries = payload?.filter((item) => item.value !== null && item.value !== undefined) ?? [];
  if (!active || entries.length === 0) return null;
  return (
    <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="md" gap={1.5} p={3}>
      <Text color="gray.700" fontSize="xs" fontWeight="bold">
        {label}
      </Text>
      {entries.map((item) => (
        <Flex key={String(item.dataKey)} align="center" gap={2} justify="space-between">
          <Flex align="center" gap={1.5}>
            <Box bg={item.color} borderRadius="full" h="8px" w="8px" />
            <Text color="gray.600" fontSize="xs">
              {item.name}
            </Text>
          </Flex>
          <Text color="gray.950" fontSize="xs" fontWeight="bold">
            {formatChartValue(item.value, valueKind)}
          </Text>
        </Flex>
      ))}
    </Stack>
  );
}

export function hasPlottableTrendData(data: ChartDatum[], keys: string[]) {
  return keys.some((key) =>
    data.some((point) => typeof point[key] === "number" && Number.isFinite(point[key] as number)),
  );
}

export const TrendChart = ({ data, keys, kind = "line", valueKind = "count" }: TrendChartProps) => {
  const chart = useChart<ChartDatum>({
    data,
    series: keys.map((key, index) => ({ color: COLORS[index % COLORS.length], name: key })),
  });
  const effectiveKind = data.length === 1 ? "bar" : kind;

  if (data.length === 0) {
    return (
      <Box alignItems="center" bg="gray.50" borderRadius="md" display="flex" h="full" justifyContent="center">
        <Text color="gray.500" fontSize="sm">
          この期間のデータはありません
        </Text>
      </Box>
    );
  }

  if (effectiveKind === "bar") {
    return (
      <Chart.Root aria-label={`${keys.join("、")}の推移グラフ`} chart={chart} h="full" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={chart.data} margin={{ bottom: 8, left: 0, right: 16, top: 8 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" fontSize={12} minTickGap={24} tickLine={false} />
            <YAxis
              allowDecimals={valueKind === "percent"}
              domain={valueKind === "percent" ? [0, 1] : undefined}
              fontSize={12}
              tickFormatter={valueKind === "percent" ? (value) => `${Math.round(Number(value) * 100)}%` : undefined}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={(props) => <TrendTooltip {...props} valueKind={valueKind} />}
              cursor={{ fill: "#f1f5f9" }}
            />
            <Legend content={<Chart.Legend />} />
            {chart.series.map((item) => (
              <Bar
                key={String(item.name)}
                dataKey={chart.key(item.name)}
                fill={chart.color(item.color)}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Chart.Root>
    );
  }

  return (
    <Chart.Root aria-label={`${keys.join("、")}の推移グラフ`} chart={chart} h="full" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={chart.data} margin={{ bottom: 8, left: 0, right: 16, top: 8 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" fontSize={12} minTickGap={24} tickLine={false} />
          <YAxis
            allowDecimals={valueKind === "percent"}
            domain={valueKind === "percent" ? [0, 1] : undefined}
            fontSize={12}
            tickFormatter={valueKind === "percent" ? (value) => `${Math.round(Number(value) * 100)}%` : undefined}
            tickLine={false}
            width={52}
          />
          <Tooltip content={(props) => <TrendTooltip {...props} valueKind={valueKind} />} />
          <Legend content={<Chart.Legend />} />
          {chart.series.map((item) => (
            <Line
              key={String(item.name)}
              activeDot={{ r: 5 }}
              dataKey={chart.key(item.name)}
              dot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              stroke={chart.color(item.color)}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
};
