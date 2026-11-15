import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "./constants";
import {
  countDateOnlyAssignmentsByDate,
  getDateOnlyAssignmentRange,
  hasDateOnlyRequest,
  toggleDateOnlyAssignment,
} from "./dateOnlyAssignments";
import type { PositionType, ShiftData, StaffType, TimeRange } from "./types";

const staff: StaffType = { id: "staff1", name: "田中 太郎", isSubmitted: true };
const timeRange: TimeRange = { start: 9, end: 22, unit: 30 };

describe("dateOnlyAssignments", () => {
  it("日付選択の割当時間は編集可能時間帯を優先する", () => {
    expect(
      getDateOnlyAssignmentRange({ start: 5, end: 23, unit: 30, editableStartMinutes: 330, editableEndMinutes: 1350 }),
    ).toEqual({ start: "05:30", end: "22:30" });
  });

  it("シフトがない日に○を付けると全日割当を作成する", () => {
    const result = toggleDateOnlyAssignment({ shifts: [], staff, date: "2026-05-21", timeRange });

    expect(result).toEqual([
      {
        id: "shift-staff1-2026-05-21",
        staffId: "staff1",
        staffName: "田中 太郎",
        date: "2026-05-21",
        requestedTime: null,
        positions: [
          {
            id: "seg-staff1-2026-05-21",
            positionId: DEFAULT_POSITION.id,
            positionName: DEFAULT_POSITION.name,
            color: DEFAULT_POSITION.color,
            start: "09:00",
            end: "22:00",
          },
        ],
      },
    ]);
  });

  it("既存の希望情報を残したまま○×を切り替える", () => {
    const shifts: ShiftData[] = [
      {
        id: "shift-staff1-2026-05-21",
        staffId: "staff1",
        staffName: "田中 太郎",
        date: "2026-05-21",
        requestedTime: { start: "09:00", end: "22:00" },
        requestedTimes: [{ start: "09:00", end: "22:00" }],
        positions: [],
      },
    ];

    const assigned = toggleDateOnlyAssignment({ shifts, staff, date: "2026-05-21", timeRange });
    expect(assigned[0].requestedTime).toEqual({ start: "09:00", end: "22:00" });
    expect(assigned[0].positions).toHaveLength(1);

    const removed = toggleDateOnlyAssignment({ shifts: assigned, staff, date: "2026-05-21", timeRange });
    expect(removed[0].requestedTime).toEqual({ start: "09:00", end: "22:00" });
    expect(removed[0].positions).toEqual([]);
  });

  it("希望日と割当人数を判定できる", () => {
    const shifts: ShiftData[] = [
      {
        id: "shift-staff1-2026-05-21",
        staffId: "staff1",
        staffName: "田中 太郎",
        date: "2026-05-21",
        requestedTime: { start: "09:00", end: "22:00" },
        positions: [
          {
            id: "seg-1",
            positionId: "default",
            positionName: "シフト",
            color: "#3b82f6",
            start: "09:00",
            end: "22:00",
          },
        ],
      },
    ];

    expect(hasDateOnlyRequest(shifts[0])).toBe(true);
    expect(countDateOnlyAssignmentsByDate(shifts, ["2026-05-21", "2026-05-22"])).toEqual(
      new Map([
        ["2026-05-21", 1],
        ["2026-05-22", 0],
      ]),
    );
  });
});

describe("toggleDateOnlyAssignment: ポジションの入れ替え", () => {
  const date = "2026-05-21";
  const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
  const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };

  const assigned = (position: PositionType): ShiftData[] => [
    {
      id: `shift-staff1-${date}`,
      staffId: "staff1",
      staffName: "田中 太郎",
      date,
      requestedTime: { start: "09:00", end: "22:00" },
      requestedTimes: [{ start: "09:00", end: "22:00" }],
      positions: [
        {
          id: `seg-staff1-${date}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "09:00",
          end: "22:00",
        },
      ],
      breaks: [{ start: "12:00", end: "13:00" }],
    },
    {
      id: `shift-staff2-${date}`,
      staffId: "staff2",
      staffName: "鈴木 花子",
      date,
      requestedTime: null,
      positions: [
        {
          id: `seg-staff2-${date}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "09:00",
          end: "22:00",
        },
      ],
    },
  ];

  it("勤務のない日には、選んだポジションで勤務を入れる", () => {
    const result = toggleDateOnlyAssignment({
      shifts: [],
      staff,
      date,
      timeRange,
      position: kitchen,
      switchPosition: true,
    });

    expect(result.map((shift) => shift.positions)).toEqual([
      [
        {
          id: `seg-staff1-${date}`,
          positionId: kitchen.id,
          positionName: kitchen.name,
          color: kitchen.color,
          start: "09:00",
          end: "22:00",
        },
      ],
    ]);
  });

  it("入れ替えが有効なとき、別のポジションの勤務を押すと選んだポジションへ入れ替わる", () => {
    const shifts = assigned(hall);
    const result = toggleDateOnlyAssignment({
      shifts,
      staff,
      date,
      timeRange,
      position: kitchen,
      switchPosition: true,
    });

    expect(result).toEqual([
      {
        ...shifts[0],
        positions: [
          {
            id: `seg-staff1-${date}`,
            positionId: kitchen.id,
            positionName: kitchen.name,
            color: kitchen.color,
            start: "09:00",
            end: "22:00",
          },
        ],
      },
      shifts[1],
    ]);
  });

  it("入れ替えが有効でも、同じポジションの勤務を押すと外れる", () => {
    const shifts = assigned(kitchen);
    const result = toggleDateOnlyAssignment({
      shifts,
      staff,
      date,
      timeRange,
      position: kitchen,
      switchPosition: true,
    });

    expect(result).toEqual([{ ...shifts[0], positions: [] }, shifts[1]]);
  });

  it.each([false, undefined])(
    "入れ替えが無効（%s）なら、別のポジションの勤務を押しても従来どおり外れる",
    (switchPosition) => {
      const shifts = assigned(hall);
      const result = toggleDateOnlyAssignment({ shifts, staff, date, timeRange, position: kitchen, switchPosition });

      expect(result).toEqual([{ ...shifts[0], positions: [] }, shifts[1]]);
    },
  );
});
