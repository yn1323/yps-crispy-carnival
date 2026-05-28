import { formatShiftClockTimeRange } from "@/src/domains/shift/time";

/**
 * シフト時間帯を表示用の文字列に整形する
 *
 * 24:00 以降は「翌H:MM」表記に変換
 *
 * @example
 * formatShiftTimeRange("14:00", "25:00") // "14:00〜翌1:00"
 * formatShiftTimeRange("10:00", "18:00") // "10:00〜18:00"
 */
export const formatShiftTimeRange = (start: string, end: string): string => formatShiftClockTimeRange(start, end);
