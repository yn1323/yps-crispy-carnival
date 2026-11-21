import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "./constants";
import {
  countDateOnlyAssignmentsByDate,
  getDateOnlyAssignmentRange,
  hasDateOnlyRequest,
  removeDateOnlyAssignment,
  setDateOnlyAssignment,
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

  it("シフトがない日に勤務を入れると、全日の割り当てを作る", () => {
    const result = setDateOnlyAssignment({ shifts: [], staff, date: "2026-05-21", timeRange });

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

  it("希望を残したまま、勤務を入れて外せる", () => {
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

    const assigned = setDateOnlyAssignment({ shifts, staff, date: "2026-05-21", timeRange });
    expect(assigned[0].requestedTime).toEqual({ start: "09:00", end: "22:00" });
    expect(assigned[0].positions).toHaveLength(1);

    const removed = removeDateOnlyAssignment({ shifts: assigned, staffId: staff.id, date: "2026-05-21" });
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

describe("setDateOnlyAssignment: ポジションの入れ替え", () => {
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
    const result = setDateOnlyAssignment({ shifts: [], staff, date, timeRange, position: kitchen });
    expect(result[0].positions.map((segment) => segment.positionId)).toEqual(["kitchen"]);
  });

  it("勤務のある日は、ポジションだけを入れ替え、1日に1つのポジションを保つ", () => {
    const result = setDateOnlyAssignment({ shifts: assigned(hall), staff, date, timeRange, position: kitchen });
    expect(result[0].positions).toEqual([
      {
        id: `seg-staff1-${date}`,
        positionId: "kitchen",
        positionName: "キッチン",
        color: "#f97316",
        start: "09:00",
        end: "22:00",
      },
    ]);
    expect(result[0].requestedTime).toEqual({ start: "09:00", end: "22:00" });
  });

  it("ほかのスタッフの勤務は変えない", () => {
    const shifts = assigned(hall);
    const result = setDateOnlyAssignment({ shifts, staff, date, timeRange, position: kitchen });
    expect(result[1]).toBe(shifts[1]);
    expect(removeDateOnlyAssignment({ shifts, staffId: staff.id, date })[1]).toBe(shifts[1]);
  });
});
