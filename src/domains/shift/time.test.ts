import { describe, expect, test } from "vitest";
import {
  formatShiftClockTime,
  formatShiftClockTimeRange,
  formatShiftTimeSelectLabel,
  generateShiftTimeOptions,
  isSupportedShiftTime,
  MAX_SHIFT_TIME_MINUTES,
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

describe("isSupportedShiftTime", () => {
  test("0:00から翌12:00までのシフト時刻を受け入れる", () => {
    expect(isSupportedShiftTime("00:00")).toBe(true);
    expect(isSupportedShiftTime("24:00")).toBe(true);
    expect(isSupportedShiftTime("36:00")).toBe(true);
    expect(timeToMinutes("36:00")).toBe(MAX_SHIFT_TIME_MINUTES);
  });

  test("分が不正、または翌12:00を超える時刻は拒否する", () => {
    expect(isSupportedShiftTime("10:60")).toBe(false);
    expect(isSupportedShiftTime("36:30")).toBe(false);
    expect(isSupportedShiftTime("abc")).toBe(false);
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

describe("formatShiftTimeSelectLabel", () => {
  test("24時以降はセレクト用の翌日表記に変換できる", () => {
    expect(formatShiftTimeSelectLabel("25:00")).toBe("翌 01:00");
  });

  test("不正な時刻はそのまま返す", () => {
    expect(formatShiftTimeSelectLabel("invalid")).toBe("invalid");
  });
});

describe("generateShiftTimeOptions", () => {
  test("指定した分範囲から時刻候補を生成できる", () => {
    expect(generateShiftTimeOptions({ startMinutes: 9 * 60, endMinutes: 10 * 60 })).toEqual([
      { value: "09:00", label: "09:00" },
      { value: "09:30", label: "09:30" },
      { value: "10:00", label: "10:00" },
    ]);
  });

  test("翌日範囲はセレクト用ラベルに変換できる", () => {
    expect(generateShiftTimeOptions({ startMinutes: 24 * 60, endMinutes: 25 * 60, stepMinutes: 60 })).toEqual([
      { value: "24:00", label: "翌 00:00" },
      { value: "25:00", label: "翌 01:00" },
    ]);
  });

  test("不正な範囲や刻み幅なら空配列を返す", () => {
    expect(generateShiftTimeOptions({ startMinutes: 10 * 60, endMinutes: 9 * 60 })).toEqual([]);
    expect(generateShiftTimeOptions({ endMinutes: 9 * 60, stepMinutes: 0 })).toEqual([]);
  });
});
