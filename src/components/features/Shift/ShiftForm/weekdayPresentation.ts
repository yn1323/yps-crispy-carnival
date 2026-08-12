import { isSaturday, isSunday } from "@/src/domains/shift/date";

export type ShiftWeekdayTone = "weekday" | "saturday" | "sunday" | "muted";

export const SHIFT_WEEKDAY_COLORS: Record<Exclude<ShiftWeekdayTone, "muted">, string> = {
  weekday: "#3f3f46",
  saturday: "#3b82f6",
  sunday: "#ef4444",
};

export const SHIFT_WEEKDAY_TONE_COLORS: Record<ShiftWeekdayTone, string> = {
  ...SHIFT_WEEKDAY_COLORS,
  muted: "#a1a1aa",
};

export function getShiftWeekdayTone(iso: string, inRange = true): ShiftWeekdayTone {
  if (!inRange) return "muted";
  if (isSunday(iso)) return "sunday";
  if (isSaturday(iso)) return "saturday";
  return "weekday";
}

export function getShiftWeekdayColor(iso: string): string {
  const tone = getShiftWeekdayTone(iso);
  return SHIFT_WEEKDAY_COLORS[tone === "muted" ? "weekday" : tone];
}
