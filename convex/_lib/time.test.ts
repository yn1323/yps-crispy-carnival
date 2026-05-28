import { describe, expect, it } from "vitest";
import {
  buildShiftTimeLabel,
  formatShiftClockTime,
  formatShiftClockTimeRange,
  isSupportedShiftTime,
  MAX_SHIFT_TIME_MINUTES,
} from "./time";

describe("time", () => {
  it("対応するシフト時刻の範囲を判定できる", () => {
    expect(isSupportedShiftTime("36:00")).toBe(true);
    expect(isSupportedShiftTime("36:30")).toBe(false);
    expect(MAX_SHIFT_TIME_MINUTES).toBe(36 * 60);
  });

  it("24時以降を翌日表記に変換できる", () => {
    expect(formatShiftClockTime("25:00")).toBe("翌1:00");
    expect(formatShiftClockTimeRange("21:00", "35:00", "-")).toBe("21:00-翌11:00");
  });

  it("通知用の勤務時間ラベルを組み立てられる", () => {
    expect(
      buildShiftTimeLabel([{ startTime: "21:00", endTime: "25:00", optionId: "late" }], {
        kind: "shiftType",
        options: [{ id: "late", name: "遅番", startTime: "21:00", endTime: "25:00" }],
      }),
    ).toBe("遅番（21:00-翌1:00）");
  });
});
