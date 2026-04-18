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

// X座標（ピクセル） → 分 + unitスナップ + timeRangeクランプ
export const pixelToMinutes = (params: { x: number; timeRange: TimeRange; hourWidth?: number }): number => {
  const { x, timeRange, hourWidth = HOUR_WIDTH_PX } = params;
  const effectiveX = x - TIME_AXIS_PADDING_PX;
  const rawMinutes = (effectiveX / hourWidth) * 60 + timeRange.start * 60;
  const snappedMinutes = Math.round(rawMinutes / timeRange.unit) * timeRange.unit;
  const minMinutes = timeRange.start * 60;
  const maxMinutes = timeRange.end * 60;
  return Math.max(minMinutes, Math.min(maxMinutes, snappedMinutes));
};

// 分 → X座標（ピクセル）
export const minutesToPixel = (minutes: number, timeRange: TimeRange, hourWidth: number = HOUR_WIDTH_PX): number => {
  const minutesFromStart = minutes - timeRange.start * 60;
  return TIME_AXIS_PADDING_PX + (minutesFromStart / 60) * hourWidth;
};

// 時間軸の総幅を計算
export const getTimeAxisWidth = (timeRange: TimeRange, hourWidth: number = HOUR_WIDTH_PX): number => {
  const totalHours = timeRange.end - timeRange.start;
  return TIME_AXIS_PADDING_PX * 2 + totalHours * hourWidth;
};

// 分を時間表示に変換（480 → "8h"）
export const minutesToHoursLabel = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h`;
};
