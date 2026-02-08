import { HOUR_WIDTH_PX, TIME_AXIS_PADDING_PX } from "../constants";
import type { TimeRange } from "../types";

// 時刻文字列 → 分（"10:30" → 630）
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// 分 → 時刻文字列（630 → "10:30"）
export const minutesToTime = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

// X座標（ピクセル） → 分 + unitスナップ + timeRangeクランプ（固定幅ベース、パディング考慮）
export const pixelToMinutes = (params: { x: number; timeRange: TimeRange }): number => {
  const { x, timeRange } = params;
  // パディング分を引いたx座標
  const effectiveX = x - TIME_AXIS_PADDING_PX;
  // 固定幅ベースで分に変換（1時間 = HOUR_WIDTH_PX）
  const rawMinutes = (effectiveX / HOUR_WIDTH_PX) * 60 + timeRange.start * 60;
  // unitにスナップ
  const snappedMinutes = Math.round(rawMinutes / timeRange.unit) * timeRange.unit;
  // timeRangeの範囲内にクランプ
  const minMinutes = timeRange.start * 60;
  const maxMinutes = timeRange.end * 60;
  return Math.max(minMinutes, Math.min(maxMinutes, snappedMinutes));
};

// 分 → X座標（ピクセル）（固定幅ベース、パディング考慮）
export const minutesToPixel = (minutes: number, timeRange: TimeRange): number => {
  const minutesFromStart = minutes - timeRange.start * 60;
  return TIME_AXIS_PADDING_PX + (minutesFromStart / 60) * HOUR_WIDTH_PX;
};

// 時間軸の総幅を計算（固定幅ベース）
export const getTimeAxisWidth = (timeRange: TimeRange): number => {
  const totalHours = timeRange.end - timeRange.start;
  return TIME_AXIS_PADDING_PX * 2 + totalHours * HOUR_WIDTH_PX;
};

// 分を時間表示に変換（480 → "8h"）
export const minutesToHoursLabel = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h`;
};
