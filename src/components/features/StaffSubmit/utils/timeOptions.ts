import { formatDateWithWeekday, isSaturday, isSunday } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import type { SelectItemType } from "@/src/components/ui/Select";
import type { DayEntry } from "../DayCard";

/**
 * 30分刻みの時間セレクトオプションを生成
 * @param startTime "HH:MM" 形式（例: "09:00"）
 * @param endTime "HH:MM" 形式（例: "22:00"）
 */
export function generateTimeOptions(startTime: string, endTime: string): SelectItemType[] {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const options: SelectItemType[] = [];
  for (let m = startMinutes; m <= endMinutes; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const label = `${h}:${String(min).padStart(2, "0")}`;
    options.push({ value, label });
  }

  return options;
}

/** "09:00" → "9:00" のように先頭ゼロを除去 */
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${Number(h)}:${m}`;
}

/** 日付の曜日に応じた色を返す（日曜: 赤、土曜: 青、平日: デフォルト） */
export function getDateColor(date: string): string {
  if (isSunday(date)) return "red.600";
  if (isSaturday(date)) return "blue.600";
  return "fg.default";
}

/** 期間ラベルをフォーマット（例: "4/7(月) 〜 4/13(日)"） */
export function formatPeriodLabel(start: string, end: string): string {
  return `${formatDateWithWeekday(start)} 〜 ${formatDateWithWeekday(end)}`;
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
