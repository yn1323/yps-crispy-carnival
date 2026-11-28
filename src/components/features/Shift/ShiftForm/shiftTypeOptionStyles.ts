// 勤務パターンごとの色。一覧のチップに使う。日別の表は、列ごとの色を付けない。
export const SHIFT_TYPE_OPTION_COLORS = [
  {
    accent: "#0f766e",
    requestedBg: "#f0fdfa",
  },
  {
    accent: "#2563eb",
    requestedBg: "#eff6ff",
  },
  {
    accent: "#ea580c",
    requestedBg: "#fff7ed",
  },
  {
    accent: "#6d28d9",
    requestedBg: "#f5f3ff",
  },
] as const;

export type ShiftTypeOptionColor = (typeof SHIFT_TYPE_OPTION_COLORS)[number];

export const getShiftTypeOptionColor = (index: number): ShiftTypeOptionColor =>
  SHIFT_TYPE_OPTION_COLORS[index % SHIFT_TYPE_OPTION_COLORS.length];
