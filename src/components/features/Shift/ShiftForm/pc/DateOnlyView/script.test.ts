import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildDateOnlyRows, buildDateOnlyWeeks, buildRowWeekNotes, getSortableDates } from "./script";

describe("buildDateOnlyWeeks", () => {
  it("期間を月曜始まりの週へまとめる", () => {
    const weeks = buildDateOnlyWeeks(["2026-06-03", "2026-06-04", "2026-06-05"]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].subLabel).toBe("1週目");
    expect(weeks[0].dates.filter((date) => date.inRange).map((date) => date.iso)).toEqual([
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
  });
});

describe("getSortableDates", () => {
  const dates = [
    { iso: "2026-06-01", inRange: true },
    { iso: "2026-06-02", inRange: true },
    { iso: "2026-06-03", inRange: false },
  ];

  it("営業日を優先する", () => {
    expect(getSortableDates(dates, ["2026-06-01"])).toEqual([{ iso: "2026-06-02", inRange: true }]);
  });

  it("全日休業なら期間内の日付を返す", () => {
    expect(getSortableDates(dates, ["2026-06-01", "2026-06-02"])).toEqual(dates.slice(0, 2));
  });
});

describe("buildDateOnlyRows", () => {
  it("表示に必要な希望・割当・休業状態を行へまとめる", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: staff.id,
        staffName: staff.name,
        date: "2026-06-01",
        requestedTime: { start: "09:00", end: "18:00" },
        positions: [
          {
            id: "position-1",
            positionId: "default",
            positionName: "勤務",
            color: "#000",
            start: "09:00",
            end: "18:00",
          },
        ],
      },
    ];

    const [row] = buildDateOnlyRows({
      staffs: [staff],
      shifts,
      dates: [
        { iso: "2026-06-01", inRange: true },
        { iso: "2026-06-02", inRange: true },
      ],
      holidays: ["2026-06-02"],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map([[staff.id, ["確認事項"]]]),
    });

    expect(row.warningMessages).toEqual(["確認事項"]);
    expect(row.requestBadges).toEqual([{ key: "2026-06-01", label: "6/1", tone: "requested" }]);
    expect(row.cells).toMatchObject([
      { assigned: true, requested: true, isClosed: false },
      { assigned: false, requested: false, isClosed: true },
    ]);
  });

  it("提出状態と表示モードから希望欄の表示値を組み立てる", () => {
    const submittedStaff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const unsubmittedStaff: StaffType = { id: "staff-2", name: "佐藤", isSubmitted: false };
    const rows = buildDateOnlyRows({
      staffs: [submittedStaff, unsubmittedStaff],
      shifts: [],
      dates: [{ iso: "2026-06-01", inRange: true }],
      holidays: [],
      isConfirmedDisplay: true,
      warningMessagesByStaffId: new Map(),
    });

    expect(rows[0].requestBadges).toEqual([{ key: "empty", label: "勤務なし", tone: "muted" }]);
    expect(rows[0].isStaffNameMuted).toBe(false);
    expect(rows[1].requestBadges).toEqual([{ key: "unsubmitted", label: "未提出", tone: "warning" }]);
    expect(rows[1].isStaffNameMuted).toBe(true);
  });
});

describe("buildRowWeekNotes", () => {
  const column = (iso: string) => ({
    date: { iso, inRange: true },
    isClosed: false,
    assignmentCount: 0,
  });
  const notes = new Map([
    ["staff-a:2026-06-04", "午前だけ"],
    ["staff-a:2026-06-02", "17時以降なら入れます"],
    ["staff-b:2026-06-02", "別スタッフのメモ"],
    ["staff-a:2026-06-09", "表示外の週のメモ"],
  ]);

  it("表示中の週にあるそのスタッフのメモだけを日付順で返す", () => {
    const columns = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map(column);
    expect(buildRowWeekNotes("staff-a", columns, (staffId, date) => notes.get(`${staffId}:${date}`))).toEqual([
      { date: "2026-06-02", note: "17時以降なら入れます" },
      { date: "2026-06-04", note: "午前だけ" },
    ]);
  });
});
