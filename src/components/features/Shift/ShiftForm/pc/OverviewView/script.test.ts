import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildOverviewWeeks } from "./script";

describe("buildOverviewWeeks", () => {
  it("週、勤務時間、定休日、合計を描画用の行へ変換する", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: false };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: staff.id,
        staffName: staff.name,
        date: "2026-06-01",
        requestedTime: null,
        positions: [
          {
            id: "position-1",
            positionId: "default",
            positionName: "勤務",
            color: "#000",
            start: "09:00",
            end: "17:00",
          },
        ],
      },
    ];

    const [week] = buildOverviewWeeks({
      dates: ["2026-06-01", "2026-06-02"],
      weekStart: "mon",
      holidays: ["2026-06-02"],
      isReadOnly: false,
      staffs: [staff],
      shifts,
      warningCounts: new Map([["2026-06-01", 2]]),
    });

    expect(week.rangeLabel).toBe("6/1 – 6/7");
    expect(week.dates[0]).toMatchObject({ iso: "2026-06-01", isClickable: true, warningCount: 2 });
    expect(week.rows[0]).toMatchObject({
      name: "田中",
      isUnsubmitted: true,
      totalLabel: "8h",
      hasTotal: true,
    });
    expect(week.rows[0].cells.slice(0, 2)).toMatchObject([
      { text: "09:00–17:00", tone: "assigned" },
      { text: "定休日", tone: "closed" },
    ]);
  });

  describe("週の計", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const segment = (id: string, positionId: string, start: string, end: string) => ({
      id,
      positionId,
      positionName: positionId === "break" ? "休憩" : positionId,
      color: "#000",
      start,
      end,
    });
    const buildRow = (shifts: ShiftData[], holidays: string[] = []) =>
      buildOverviewWeeks({
        dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
        weekStart: "mon",
        holidays,
        isReadOnly: false,
        staffs: [staff],
        shifts,
        warningCounts: new Map(),
      })[0].rows[0];
    const shiftOn = (date: string, positions: ShiftData["positions"], breaks?: ShiftData["breaks"]): ShiftData => ({
      id: `shift-${date}`,
      staffId: staff.id,
      staffName: staff.name,
      date,
      requestedTime: null,
      positions,
      ...(breaks ? { breaks } : {}),
    });

    it("勤務と勤務の隙間は数えず、セルの時刻は最初の開始から最後の終了のまま出す", () => {
      const row = buildRow([
        shiftOn("2026-06-01", [segment("a", "hall", "09:00", "12:00"), segment("b", "hall", "13:00", "17:00")]),
      ]);

      expect(row.cells[0].text).toBe("09:00–17:00");
      expect({ totalLabel: row.totalLabel, hasTotal: row.hasTotal }).toEqual({ totalLabel: "7h", hasTotal: true });
    });

    it("休憩の区間と、時刻で入れた休憩を引く", () => {
      const row = buildRow([
        shiftOn("2026-06-01", [
          segment("a", "hall", "09:00", "12:00"),
          segment("b", "break", "12:00", "13:00"),
          segment("c", "hall", "13:00", "17:00"),
        ]),
        shiftOn("2026-06-02", [segment("d", "hall", "10:00", "18:00")], [{ start: "13:00", end: "13:45" }]),
      ]);

      // 6/1は7時間、6/2は8時間から45分を引いた7時間15分。
      expect(row.totalLabel).toBe("14.25h");
    });

    it("勤務の外にはみ出した休憩は、勤務時間内の分だけ引く", () => {
      const row = buildRow([
        shiftOn("2026-06-01", [segment("a", "hall", "09:00", "12:00")], [{ start: "11:30", end: "12:30" }]),
      ]);

      expect(row.totalLabel).toBe("2.5h");
    });

    it("定休日の勤務は数えず、勤務のない週は「—」にする", () => {
      const closedOnly = buildRow([shiftOn("2026-06-01", [segment("a", "hall", "09:00", "12:00")])], ["2026-06-01"]);

      expect({ totalLabel: closedOnly.totalLabel, hasTotal: closedOnly.hasTotal }).toEqual({
        totalLabel: "—",
        hasTotal: false,
      });
    });
  });

  it("くわしく表示に使う、その日のポジションと休憩をセルへ持たせる", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true, skillLevel: "lead" };
    const work = (id: string, positionId: string, positionName: string, start: string, end: string) => ({
      id,
      positionId,
      positionName,
      color: "#111",
      start,
      end,
    });
    const withBreak: ShiftData = {
      id: "shift-1",
      staffId: staff.id,
      staffName: staff.name,
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        work("late", "kitchen", "キッチン", "13:00", "17:00"),
        work("early", "hall", "ホール", "09:00", "12:00"),
        work("last", "hall", "ホール", "17:00", "19:00"),
      ],
      breaks: [{ start: "10:00", end: "10:30" }],
    };
    const withoutBreak: ShiftData = {
      id: "shift-2",
      staffId: staff.id,
      staffName: staff.name,
      date: "2026-06-02",
      requestedTime: null,
      positions: [work("only", "hall", "ホール", "09:00", "12:00")],
      // 勤務の外にある休憩は、印を出さない。
      breaks: [{ start: "13:00", end: "14:00" }],
    };

    const [week] = buildOverviewWeeks({
      dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
      weekStart: "mon",
      holidays: [],
      isReadOnly: true,
      staffs: [staff],
      shifts: [withBreak, withoutBreak],
      warningCounts: new Map(),
    });
    const [row] = week.rows;

    expect(row.staff).toBe(staff);
    expect(row.cells.slice(0, 3).map((cell) => cell.positions.map((position) => position.positionName))).toEqual([
      ["ホール", "キッチン"],
      ["ホール"],
      [],
    ]);
    expect(row.cells.slice(0, 3).map((cell) => cell.breakShift)).toEqual([withBreak, undefined, undefined]);
  });
});
