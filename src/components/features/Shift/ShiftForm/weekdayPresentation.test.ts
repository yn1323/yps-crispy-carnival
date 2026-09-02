import { describe, expect, it } from "vitest";
import { getShiftWeekdayColor, getShiftWeekdayTone } from "./weekdayPresentation";

describe("ShiftFormの曜日表示", () => {
  it.each([
    ["2026-06-01", true, "weekday"],
    ["2026-06-06", true, "saturday"],
    ["2026-06-07", true, "sunday"],
    ["2026-06-07", false, "muted"],
  ] as const)("曜日と期間内外からtoneを返す", (date, inRange, expected) => {
    expect(getShiftWeekdayTone(date, inRange)).toBe(expected);
  });

  it("既存の曜日色を返す", () => {
    expect(getShiftWeekdayColor("2026-06-01")).toBe("#3f3f46");
    expect(getShiftWeekdayColor("2026-06-06")).toBe("#3b82f6");
    expect(getShiftWeekdayColor("2026-06-07")).toBe("#ef4444");
  });
});
