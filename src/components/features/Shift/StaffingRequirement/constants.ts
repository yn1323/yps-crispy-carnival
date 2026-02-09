// 曜日ラベル（index 0=日, 1=月, ..., 6=土, 7=祝）
export const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土", "祝"] as const;

// 月曜始まりの曜日インデックス配列（祝日を末尾に）
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0, 7] as const;

// 曜日数（祝日含む）
export const DAY_COUNT = DAY_LABELS.length;

// 曜日カラー（土=青、日・祝=赤、平日=デフォルト）
export const getDayColor = (dayIndex: number) => {
  if (dayIndex === 6) return "blue.500";
  if (dayIndex === 0 || dayIndex === 7) return "red.500";
  return undefined;
};
