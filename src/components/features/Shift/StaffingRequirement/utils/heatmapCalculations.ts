import { DAY_COUNT } from "../constants";

// ヒートマップの色段階（blue系グラデーション）
export const HEATMAP_COLORS = ["gray.50", "blue.100", "blue.300", "blue.500", "blue.700"] as const;

type HeatmapInput = {
  staffingMap: Record<string, number>;
  hours: number[];
  positions: { name: string }[];
};

// 8列(曜日+祝日) × N行(時間帯) のグリッドデータ
export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  totalCount: number;
  colorToken: (typeof HEATMAP_COLORS)[number];
};

export type HeatmapRow = {
  hour: number;
  cells: HeatmapCell[];
};

type HeatmapResult = {
  rows: HeatmapRow[];
  dailyTotals: number[]; // index 0=日, 1=月, ..., 6=土
  maxCount: number;
};

// 合計値から色段階を決定（0=灰色、1-maxを4段階に分割）
export const getColorToken = (count: number, maxCount: number): (typeof HEATMAP_COLORS)[number] => {
  if (count === 0 || maxCount === 0) return HEATMAP_COLORS[0];

  const ratio = count / maxCount;
  if (ratio <= 0.25) return HEATMAP_COLORS[1];
  if (ratio <= 0.5) return HEATMAP_COLORS[2];
  if (ratio <= 0.75) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
};

export const calculateHeatmapData = ({ staffingMap, hours, positions }: HeatmapInput): HeatmapResult => {
  // まず全セルの合計値を計算
  const grid: number[][] = []; // grid[hourIdx][dayOfWeek]
  let maxCount = 0;
  const dailyTotals = Array(DAY_COUNT).fill(0) as number[];

  for (const hour of hours) {
    const row: number[] = [];
    for (let day = 0; day < DAY_COUNT; day++) {
      let total = 0;
      for (const pos of positions) {
        const key = `${day}-${hour}-${pos.name}`;
        total += staffingMap[key] ?? 0;
      }
      row.push(total);
      dailyTotals[day] += total;
      if (total > maxCount) maxCount = total;
    }
    grid.push(row);
  }

  // 色付きグリッドを生成
  const rows: HeatmapRow[] = hours.map((hour, hourIdx) => ({
    hour,
    cells: Array.from({ length: DAY_COUNT }, (_, day) => ({
      dayOfWeek: day,
      hour,
      totalCount: grid[hourIdx][day],
      colorToken: getColorToken(grid[hourIdx][day], maxCount),
    })),
  }));

  return { rows, dailyTotals, maxCount };
};
