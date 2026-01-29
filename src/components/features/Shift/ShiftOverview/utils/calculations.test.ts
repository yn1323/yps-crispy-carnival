import { describe, expect, test } from "vitest";
import type { ShiftData, StaffType } from "../types";
import {
  calculateDailyMinutes,
  calculateMonthlyTotals,
  getDailyShiftTime,
  minutesToHoursLabel,
  prepareStaffRowData,
  timeToMinutes,
} from "./calculations";
import {
  formatDateShort,
  formatMonthLabel,
  getDateRange,
  getMonthsInRange,
  isHoliday,
  isSaturday,
  isSunday,
} from "./dateUtils";

describe("calculations", () => {
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

  describe("calculateDailyMinutes", () => {
    test("ポジションセグメントがある場合、勤務時間を計算できる", () => {
      const shift: ShiftData = {
        id: "1",
        staffId: "s1",
        staffName: "田中太郎",
        date: "2026-01-27",
        requestedTime: null,
        positions: [
          { id: "p1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
          { id: "p2", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
        ],
      };
      // 3時間 + 4時間 = 7時間 = 420分
      expect(calculateDailyMinutes(shift)).toBe(420);
    });

    test("ポジションセグメントがない場合、0を返す", () => {
      const shift: ShiftData = {
        id: "1",
        staffId: "s1",
        staffName: "田中太郎",
        date: "2026-01-27",
        requestedTime: null,
        positions: [],
      };
      expect(calculateDailyMinutes(shift)).toBe(0);
    });
  });

  describe("getDailyShiftTime", () => {
    test("ポジションセグメントの最早開始〜最遅終了を取得できる", () => {
      const shift: ShiftData = {
        id: "1",
        staffId: "s1",
        staffName: "田中太郎",
        date: "2026-01-27",
        requestedTime: null,
        positions: [
          { id: "p1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" },
          { id: "p2", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
        ],
      };
      const result = getDailyShiftTime(shift);
      expect(result).toEqual({ start: "9:00", end: "14:00" });
    });

    test("ポジションセグメントがない場合、nullを返す", () => {
      const shift: ShiftData = {
        id: "1",
        staffId: "s1",
        staffName: "田中太郎",
        date: "2026-01-27",
        requestedTime: null,
        positions: [],
      };
      expect(getDailyShiftTime(shift)).toBeNull();
    });
  });

  describe("calculateMonthlyTotals", () => {
    test("月別の合計時間を計算できる", () => {
      const shifts: ShiftData[] = [
        {
          id: "1",
          staffId: "s1",
          staffName: "田中太郎",
          date: "2026-01-27",
          requestedTime: null,
          positions: [
            { id: "p1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
          ],
        },
        {
          id: "2",
          staffId: "s1",
          staffName: "田中太郎",
          date: "2026-02-01",
          requestedTime: null,
          positions: [
            { id: "p2", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
          ],
        },
      ];

      const result = calculateMonthlyTotals(shifts, "s1", ["2026-01", "2026-02"]);

      expect(result.get("2026-01")).toBe(480); // 8時間
      expect(result.get("2026-02")).toBe(480); // 8時間
    });

    test("他のスタッフのシフトは含めない", () => {
      const shifts: ShiftData[] = [
        {
          id: "1",
          staffId: "s1",
          staffName: "田中太郎",
          date: "2026-01-27",
          requestedTime: null,
          positions: [
            { id: "p1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
          ],
        },
        {
          id: "2",
          staffId: "s2",
          staffName: "山田花子",
          date: "2026-01-27",
          requestedTime: null,
          positions: [
            { id: "p2", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
          ],
        },
      ];

      const result = calculateMonthlyTotals(shifts, "s1", ["2026-01"]);

      expect(result.get("2026-01")).toBe(480); // 田中太郎の8時間のみ
    });
  });

  describe("prepareStaffRowData", () => {
    test("スタッフ行データを正しく準備できる", () => {
      const staffs: StaffType[] = [
        { id: "s1", name: "田中太郎", isSubmitted: true },
        { id: "s2", name: "山田花子", isSubmitted: true },
      ];

      const shifts: ShiftData[] = [
        {
          id: "1",
          staffId: "s1",
          staffName: "田中太郎",
          date: "2026-01-27",
          requestedTime: null,
          positions: [
            { id: "p1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
          ],
        },
      ];

      const dates = ["2026-01-27", "2026-01-28"];
      const months = ["2026-01"];

      const result = prepareStaffRowData(staffs, shifts, shifts, dates, months);

      expect(result).toHaveLength(2);
      expect(result[0].staffId).toBe("s1");
      expect(result[0].staffName).toBe("田中太郎");
      expect(result[0].dailyShifts.get("2026-01-27")).toEqual({ start: "9:00", end: "17:00" });
      expect(result[0].dailyShifts.get("2026-01-28")).toBeNull();
      expect(result[0].totalMinutes).toBe(480);
    });
  });
});

describe("dateUtils", () => {
  describe("getDateRange", () => {
    test("開始日から終了日までの日付配列を取得できる", () => {
      const result = getDateRange("2026-01-27", "2026-01-30");
      expect(result).toEqual(["2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"]);
    });

    test("同じ日付の場合、1要素の配列を返す", () => {
      const result = getDateRange("2026-01-27", "2026-01-27");
      expect(result).toEqual(["2026-01-27"]);
    });
  });

  describe("getMonthsInRange", () => {
    test("期間に含まれる月を取得できる", () => {
      const result = getMonthsInRange("2026-01-27", "2026-02-09");
      expect(result).toEqual(["2026-01", "2026-02"]);
    });

    test("同じ月の場合、1要素の配列を返す", () => {
      const result = getMonthsInRange("2026-01-01", "2026-01-31");
      expect(result).toEqual(["2026-01"]);
    });
  });

  describe("isHoliday", () => {
    test("祝日判定ができる", () => {
      const holidays = ["2026-02-11", "2026-02-23"];
      expect(isHoliday("2026-02-11", holidays)).toBe(true);
      expect(isHoliday("2026-02-12", holidays)).toBe(false);
    });
  });

  describe("isSaturday / isSunday", () => {
    test("土曜日判定ができる", () => {
      expect(isSaturday("2026-01-31")).toBe(true); // 土曜日
      expect(isSaturday("2026-01-30")).toBe(false); // 金曜日
    });

    test("日曜日判定ができる", () => {
      expect(isSunday("2026-02-01")).toBe(true); // 日曜日
      expect(isSunday("2026-01-31")).toBe(false); // 土曜日
    });
  });

  describe("formatDateShort", () => {
    test("日付を短い形式でフォーマットできる", () => {
      expect(formatDateShort("2026-01-27")).toBe("1/27");
      expect(formatDateShort("2026-12-05")).toBe("12/5");
    });
  });

  describe("formatMonthLabel", () => {
    test("月ラベルをフォーマットできる", () => {
      expect(formatMonthLabel("2026-01")).toBe("1月計");
      expect(formatMonthLabel("2026-12")).toBe("12月計");
    });
  });
});
