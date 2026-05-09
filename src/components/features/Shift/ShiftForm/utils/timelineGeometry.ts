import type { TimeRange } from "@/src/domains/shift/types";
import { HOUR_WIDTH_PX, TIME_AXIS_PADDING_PX } from "../constants";

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
