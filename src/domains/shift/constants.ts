export const DEFAULT_POSITION = {
  id: "default",
  name: "シフト",
  color: "#3b82f6", // blue-500
} as const;

export const BREAK_POSITION = {
  id: "break",
  name: "休憩",
  color: "#6b7280", // gray-500
} as const;

// アラート閾値
export const WEEK_HOURS_LIMIT = 40 * 60; // 週40時間（分）
export const CONSECUTIVE_DAYS_LIMIT = 6; // 連勤アラート閾値（日）

// 充足率 → 段階的6色（赤→オレンジ→黄→黄緑→緑→青）
export const FILL_RATE_COLORS = [
  { bg: "hsl(0, 85%, 70%)", text: "hsl(0, 90%, 45%)" }, // 0-20%: 赤（濃い）
  { bg: "hsl(30, 80%, 75%)", text: "hsl(30, 85%, 40%)" }, // 21-40%: オレンジ
  { bg: "hsl(50, 80%, 75%)", text: "hsl(50, 85%, 40%)" }, // 41-60%: 黄
  { bg: "hsl(80, 80%, 75%)", text: "hsl(80, 85%, 40%)" }, // 61-80%: 黄緑
  { bg: "hsl(120, 80%, 75%)", text: "hsl(120, 85%, 40%)" }, // 81-100%: 緑
  { bg: "hsl(210, 80%, 75%)", text: "hsl(210, 85%, 40%)" }, // 101%+: 青（超過）
] as const;
