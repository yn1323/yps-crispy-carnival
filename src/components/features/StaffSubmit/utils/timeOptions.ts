import type { SelectItemType } from "@/src/components/ui/Select";
import { isSaturday, isSunday } from "@/src/domains/shift/date";
import { generateShiftTimeOptions, timeToMinutes } from "@/src/domains/shift/time";
import type { DayEntry } from "../DayCard";

/**
 * 30分刻みの時間セレクトオプションを生成
 * @param startTime "HH:MM" 形式（例: "09:00"）
 * @param endTime "HH:MM" 形式（例: "22:00"）
 */
export function generateTimeOptions(startTime: string, endTime: string): SelectItemType[] {
  return generateShiftTimeOptions({ startMinutes: timeToMinutes(startTime), endMinutes: timeToMinutes(endTime) });
}

/** 日付の曜日に応じた色を返す（日曜: 赤、土曜: 青、平日: デフォルト） */
export function getDateColor(date: string): string {
  if (isSunday(date)) return "red.600";
  if (isSaturday(date)) return "blue.600";
  return "fg.default";
}

/** 既存リクエストと日付リストからDayEntry配列を生成 */
export function buildEntries(
  dates: string[],
  existingRequests: { date: string; startTime: string; endTime: string }[],
  defaultTimeRange: { startTime: string; endTime: string },
): DayEntry[] {
  const requestMap = new Map(existingRequests.map((r) => [r.date, r]));
  return dates.map((date) => {
    const existing = requestMap.get(date);
    return existing
      ? { date, isWorking: true, startTime: existing.startTime, endTime: existing.endTime }
      : { date, isWorking: false, startTime: defaultTimeRange.startTime, endTime: defaultTimeRange.endTime };
  });
}
