import type { TimeRange } from "@/src/domains/shift/types";
import { HOUR_WIDTH_PX, TIME_AXIS_PADDING_PX } from "./constants";

export const getDisplayStartMinutes = (timeRange: TimeRange): number => timeRange.start * 60;

export const getDisplayEndMinutes = (timeRange: TimeRange): number => timeRange.end * 60;

export const getEditableStartMinutes = (timeRange: TimeRange): number =>
  timeRange.editableStartMinutes ?? getDisplayStartMinutes(timeRange);

export const getEditableEndMinutes = (timeRange: TimeRange): number =>
  timeRange.editableEndMinutes ?? getDisplayEndMinutes(timeRange);

export const clampToEditableMinutes = (minutes: number, timeRange: TimeRange): number =>
  Math.max(getEditableStartMinutes(timeRange), Math.min(getEditableEndMinutes(timeRange), minutes));

export const isWithinEditableRange = (minutes: number, timeRange: TimeRange): boolean =>
  minutes >= getEditableStartMinutes(timeRange) && minutes <= getEditableEndMinutes(timeRange);

type PixelParams = {
  x: number;
  timeRange: TimeRange;
  hourWidth?: number;
  /** 時間軸の左右のパディング（px）。未指定は TIME_AXIS_PADDING_PX。 */
  axisPadding?: number;
};

export const pixelToRawMinutes = (params: PixelParams): number => {
  const { x, timeRange, hourWidth = HOUR_WIDTH_PX, axisPadding = TIME_AXIS_PADDING_PX } = params;
  const effectiveX = x - axisPadding;
  return (effectiveX / hourWidth) * 60 + getDisplayStartMinutes(timeRange);
};

// X座標（ピクセル） → 分 + unitスナップ + timeRangeクランプ
export const pixelToMinutes = (params: PixelParams): number => {
  const { timeRange } = params;
  const rawMinutes = pixelToRawMinutes(params);
  const snappedMinutes = Math.round(rawMinutes / timeRange.unit) * timeRange.unit;
  const minMinutes = getDisplayStartMinutes(timeRange);
  const maxMinutes = getDisplayEndMinutes(timeRange);
  return Math.max(minMinutes, Math.min(maxMinutes, snappedMinutes));
};

export const pixelToEditableMinutes = (params: PixelParams): number =>
  clampToEditableMinutes(pixelToMinutes(params), params.timeRange);

// 分 → X座標（ピクセル）
export const minutesToPixel = (
  minutes: number,
  timeRange: TimeRange,
  hourWidth: number = HOUR_WIDTH_PX,
  axisPadding: number = TIME_AXIS_PADDING_PX,
): number => {
  const minutesFromStart = minutes - getDisplayStartMinutes(timeRange);
  return axisPadding + (minutesFromStart / 60) * hourWidth;
};

// 時間軸の総幅を計算
export const getTimeAxisWidth = (
  timeRange: TimeRange,
  hourWidth: number = HOUR_WIDTH_PX,
  axisPadding: number = TIME_AXIS_PADDING_PX,
): number => {
  const totalHours = timeRange.end - timeRange.start;
  return axisPadding * 2 + totalHours * hourWidth;
};
