// 曜日ラベル（index 0=日, 1=月, ..., 6=土, 7=祝）
export const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土", "祝"] as const;

// 月曜始まりの曜日インデックス配列（祝日を末尾に）
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0, 7] as const;

// 曜日数（祝日含む）
export const DAY_COUNT = DAY_LABELS.length;

// 時間帯グループ定義
export const TIME_PERIODS = [
  { label: "朝", rangeStart: 6, rangeEnd: 11 },
  { label: "昼", rangeStart: 11, rangeEnd: 14 },
  { label: "午後", rangeStart: 14, rangeEnd: 17 },
  { label: "夕方", rangeStart: 17, rangeEnd: 21 },
  { label: "夜", rangeStart: 21, rangeEnd: 30 },
] as const;

// 平日（月〜金）/ 休日（日,土,祝）のグルーピング
export const WEEKDAY_DAYS = [1, 2, 3, 4, 5] as const;
export const HOLIDAY_DAYS = [0, 6, 7] as const;

// ヒートマップの色段階（blue系グラデーション）
export const HEATMAP_COLORS = ["gray.50", "blue.100", "blue.300", "blue.500", "blue.700"] as const;
