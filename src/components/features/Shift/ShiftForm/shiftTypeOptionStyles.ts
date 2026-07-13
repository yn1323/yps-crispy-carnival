export const SHIFT_TYPE_OPTION_COLORS = [
  {
    accent: "#0f766e",
    headerBg: "#ccfbf1",
    countBg: "#f0fdfa",
    assignedBg: "#ccfbf1",
    requestedBg: "#f0fdfa",
    border: "#99f6e4",
  },
  {
    accent: "#2563eb",
    headerBg: "#dbeafe",
    countBg: "#eff6ff",
    assignedBg: "#dbeafe",
    requestedBg: "#eff6ff",
    border: "#bfdbfe",
  },
  {
    accent: "#ea580c",
    headerBg: "#ffedd5",
    countBg: "#fff7ed",
    assignedBg: "#ffedd5",
    requestedBg: "#fff7ed",
    border: "#fed7aa",
  },
  {
    accent: "#6d28d9",
    headerBg: "#ede9fe",
    countBg: "#f5f3ff",
    assignedBg: "#ede9fe",
    requestedBg: "#f5f3ff",
    border: "#ddd6fe",
  },
] as const;

export type ShiftTypeOptionColor = (typeof SHIFT_TYPE_OPTION_COLORS)[number];

export const getShiftTypeOptionColor = (index: number): ShiftTypeOptionColor =>
  SHIFT_TYPE_OPTION_COLORS[index % SHIFT_TYPE_OPTION_COLORS.length];

export const SHIFT_TYPE_REQUEST_STATUS_COLORS = {
  unsubmitted: {
    bg: "#fef3c7",
    color: "#b45309",
  },
  rest: {
    bg: "#f4f4f5",
    color: "#52525b",
  },
} as const;
