import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Text } from "@chakra-ui/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
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

export function hasPlottableTrendData(data: ChartDatum[], keys: string[]) {
  return keys.some((key) => data.filter((point) => typeof point[key] === "number").length >= 2);
}

export const TrendChart = ({ data, keys, kind = "line", valueKind = "count" }: TrendChartProps) => {
  const chart = useChart<ChartDatum>({
    data,
    series: keys.map((key, index) => ({ color: COLORS[index % COLORS.length], name: key })),
  });

  if (data.length === 0) {
    return (
      <Box alignItems="center" bg="gray.50" borderRadius="md" display="flex" h="full" justifyContent="center">
        <Text color="gray.500" fontSize="sm">
          この期間のデータはありません
        </Text>
      </Box>
    );
  }

  if (kind === "bar") {
    return (
      <Chart.Root aria-label={`${keys.join("、")}の推移グラフ`} chart={chart} h="full" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={chart.data} margin={{ bottom: 8, left: 0, right: 16, top: 8 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" fontSize={12} tickLine={false} />
            <YAxis
              allowDecimals={valueKind === "percent"}
              domain={valueKind === "percent" ? [0, 1] : undefined}
              fontSize={12}
              tickFormatter={valueKind === "percent" ? (value) => `${Math.round(Number(value) * 100)}%` : undefined}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<Chart.Tooltip />} cursor={{ fill: "#f1f5f9" }} />
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
          <XAxis dataKey="date" fontSize={12} tickLine={false} />
          <YAxis
            allowDecimals={valueKind === "percent"}
            domain={valueKind === "percent" ? [0, 1] : undefined}
            fontSize={12}
            tickFormatter={valueKind === "percent" ? (value) => `${Math.round(Number(value) * 100)}%` : undefined}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<Chart.Tooltip />} />
          <Legend content={<Chart.Legend />} />
          {chart.series.map((item) => (
            <Line
              key={String(item.name)}
              activeDot={{ r: 5 }}
              dataKey={chart.key(item.name)}
              dot={false}
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
