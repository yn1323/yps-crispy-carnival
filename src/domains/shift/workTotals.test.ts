import { describe, expect, it } from "vitest";
import { BREAK_POSITION } from "./constants";
import type { PositionSegment, ShiftData } from "./types";
import { formatStaffWorkTotal, sumStaffWorkTotals } from "./workTotals";

const segment = (start: string, end: string, overrides: Partial<PositionSegment> = {}): PositionSegment => ({
  id: `seg-${start}-${end}`,
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start,
  end,
  ...overrides,
});

const shift = (
  staffId: string,
  date: string,
  positions: PositionSegment[],
  breaks?: ShiftData["breaks"],
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffId,
  date,
  requestedTime: null,
  positions,
  ...(breaks ? { breaks } : {}),
});

describe("sumStaffWorkTotals", () => {
  describe("時間で数える場合（時間指定・パターン選択）", () => {
    it("人ごとに、休憩を引いた勤務時間を募集期間の全日で合計する", () => {
      const totals = sumStaffWorkTotals(
        [
          shift("staff1", "2026-05-21", [segment("10:00", "18:00")], [{ start: "12:00", end: "13:00" }]),
          shift("staff1", "2026-05-22", [segment("10:00", "13:00"), segment("15:00", "18:00")]),
          shift("staff2", "2026-05-21", [segment("09:00", "12:30")]),
        ],
        "minutes",
      );

      expect(totals).toEqual(
        new Map([
          ["staff1", { kind: "minutes", minutes: 780 }],
          ["staff2", { kind: "minutes", minutes: 210 }],
        ]),
      );
    });

    it("勤務の外にある休憩は引かない", () => {
      const totals = sumStaffWorkTotals(
        [shift("staff1", "2026-05-21", [segment("10:00", "14:00")], [{ start: "15:00", end: "16:00" }])],
        "minutes",
      );

      expect(totals).toEqual(new Map([["staff1", { kind: "minutes", minutes: 240 }]]));
    });

    it("勤務のない日は数えず、勤務が1日もない人は結果に含めない", () => {
      const totals = sumStaffWorkTotals(
        [
          shift("staff1", "2026-05-21", [segment("10:00", "14:00")]),
          shift("staff1", "2026-05-22", [], [{ start: "12:00", end: "13:00" }]),
          shift("staff2", "2026-05-21", []),
          shift("staff3", "2026-05-21", [segment("12:00", "13:00", { positionId: BREAK_POSITION.id })]),
        ],
        "minutes",
      );

      expect(totals).toEqual(new Map([["staff1", { kind: "minutes", minutes: 240 }]]));
    });
  });

  describe("日数で数える場合（日付選択）", () => {
    it("人ごとに、勤務のある日数を数える", () => {
      const totals = sumStaffWorkTotals(
        [
          shift("staff1", "2026-05-21", [segment("09:00", "22:00")], [{ start: "12:00", end: "13:00" }]),
          shift("staff1", "2026-05-22", []),
          shift("staff1", "2026-05-23", [segment("09:00", "22:00")]),
          shift("staff2", "2026-05-21", [segment("09:00", "22:00")]),
          shift("staff3", "2026-05-21", []),
        ],
        "days",
      );

      expect(totals).toEqual(
        new Map([
          ["staff1", { kind: "days", days: 2 }],
          ["staff2", { kind: "days", days: 1 }],
        ]),
      );
    });
  });

  it("勤務が1件もなければ空を返す", () => {
    expect(sumStaffWorkTotals([], "minutes")).toEqual(new Map());
    expect(sumStaffWorkTotals([], "days")).toEqual(new Map());
  });
});

describe("formatStaffWorkTotal", () => {
  it.each([
    [450, "7.5h"],
    [480, "8h"],
    [15, "0.25h"],
    [0, "0h"],
    [2400, "40h"],
  ])("%i分を時間で表示する（%s）", (minutes, expected) => {
    expect(formatStaffWorkTotal({ kind: "minutes", minutes })).toBe(expected);
  });

  it("割り切れない時間は小数第2位までに丸める", () => {
    expect(formatStaffWorkTotal({ kind: "minutes", minutes: 100 })).toBe("1.67h");
  });

  it("日数は「日」を付けて表示する", () => {
    expect(formatStaffWorkTotal({ kind: "days", days: 3 })).toBe("3日");
  });

  it("合計のない人は「-」を表示する", () => {
    expect(formatStaffWorkTotal(undefined)).toBe("-");
  });
});
