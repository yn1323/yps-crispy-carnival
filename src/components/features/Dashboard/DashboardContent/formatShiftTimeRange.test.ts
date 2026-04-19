import { describe, expect, it } from "vitest";
import { formatShiftTimeRange } from "./formatShiftTimeRange";

describe("formatShiftTimeRange", () => {
  it("同日内の時間帯はそのまま表示する", () => {
    expect(formatShiftTimeRange("10:00", "18:00")).toBe("10:00〜18:00");
  });

  it("終了時刻が 24 時以降なら翌日表記に変換する", () => {
    expect(formatShiftTimeRange("14:00", "25:00")).toBe("14:00〜翌1:00");
  });

  it("24:00ちょうどは翌0:00になる", () => {
    expect(formatShiftTimeRange("09:00", "24:00")).toBe("09:00〜翌0:00");
  });

  it("分単位も保持する", () => {
    expect(formatShiftTimeRange("14:30", "25:30")).toBe("14:30〜翌1:30");
  });

  it("開始時刻が 24 時以降でも翌日表記に変換する", () => {
    expect(formatShiftTimeRange("24:00", "26:00")).toBe("翌0:00〜翌2:00");
  });
});
