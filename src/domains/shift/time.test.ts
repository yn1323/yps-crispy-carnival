import { describe, expect, test } from "vitest";
import {
  formatShiftClockTime,
  formatShiftClockTimeRange,
  minutesToHoursLabel,
  minutesToTime,
  timeToMinutes,
} from "./time";

describe("timeToMinutes", () => {
  test("09:00 を 540分に変換できる", () => {
    expect(timeToMinutes("09:00")).toBe(540);
  });

  test("17:30 を 1050分に変換できる", () => {
    expect(timeToMinutes("17:30")).toBe(1050);
  });

  test("00:00 を 0分に変換できる", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });
});

describe("minutesToTime", () => {
  test("540分を09:00に変換できる", () => {
    expect(minutesToTime(540)).toBe("09:00");
  });

  test("630分を10:30に変換できる", () => {
    expect(minutesToTime(630)).toBe("10:30");
  });

  test("0分を00:00に変換できる", () => {
    expect(minutesToTime(0)).toBe("00:00");
  });
});

describe("minutesToHoursLabel", () => {
  test("480分を8hに変換できる", () => {
    expect(minutesToHoursLabel(480)).toBe("8h");
  });

  test("510分を8hに変換できる（端数切り捨て）", () => {
    expect(minutesToHoursLabel(510)).toBe("8h");
  });

  test("0分を0hに変換できる", () => {
    expect(minutesToHoursLabel(0)).toBe("0h");
  });
});

describe("formatShiftClockTime", () => {
  test("24時未満は既存の時刻表示を維持する", () => {
    expect(formatShiftClockTime("09:00")).toBe("09:00");
  });

  test("24時以降は翌日表記に変換できる", () => {
    expect(formatShiftClockTime("25:30")).toBe("翌1:30");
  });

  test("翌12時までの時刻を翌日表記に変換できる", () => {
    expect(formatShiftClockTime("36:00")).toBe("翌12:00");
  });
});

describe("formatShiftClockTimeRange", () => {
  test("勤務時間帯を翌日表記込みで表示できる", () => {
    expect(formatShiftClockTimeRange("21:00", "35:00")).toBe("21:00〜翌11:00");
  });
});
