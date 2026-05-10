import { describe, expect, it } from "vitest";
import type { TimeRange } from "@/src/domains/shift/types";
import {
  isWithinEditableRange,
  minutesToPixel,
  pixelToEditableMinutes,
  pixelToMinutes,
  pixelToRawMinutes,
} from "./timelineGeometry";

const halfHourRange: TimeRange = {
  start: 5,
  end: 23,
  unit: 30,
  editableStartMinutes: 330,
  editableEndMinutes: 1350,
};

describe("timelineGeometry", () => {
  it("表示左端は丸めた05:00として座標化する", () => {
    expect(minutesToPixel(300, halfHourRange, 120)).toBe(30);
    expect(pixelToMinutes({ x: 30, timeRange: halfHourRange, hourWidth: 120 })).toBe(300);
  });

  it("営業時間外の左端は編集可能開始時刻へクランプする", () => {
    const rawMinutes = pixelToRawMinutes({ x: 30, timeRange: halfHourRange, hourWidth: 120 });

    expect(rawMinutes).toBe(300);
    expect(isWithinEditableRange(rawMinutes, halfHourRange)).toBe(false);
    expect(pixelToEditableMinutes({ x: 30, timeRange: halfHourRange, hourWidth: 120 })).toBe(330);
  });

  it("編集可能開始時刻ちょうどは編集範囲内として扱う", () => {
    const x = minutesToPixel(330, halfHourRange, 120);
    const rawMinutes = pixelToRawMinutes({ x, timeRange: halfHourRange, hourWidth: 120 });

    expect(rawMinutes).toBe(330);
    expect(isWithinEditableRange(rawMinutes, halfHourRange)).toBe(true);
    expect(pixelToEditableMinutes({ x, timeRange: halfHourRange, hourWidth: 120 })).toBe(330);
  });

  it("営業時間外の右端は編集可能終了時刻へクランプする", () => {
    const displayEndX = minutesToPixel(1380, halfHourRange, 120);

    expect(pixelToRawMinutes({ x: displayEndX, timeRange: halfHourRange, hourWidth: 120 })).toBe(1380);
    expect(pixelToEditableMinutes({ x: displayEndX, timeRange: halfHourRange, hourWidth: 120 })).toBe(1350);
  });
});
