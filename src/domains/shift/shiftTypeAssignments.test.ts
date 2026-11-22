import { describe, expect, it } from "vitest";
import {
  countShiftTypeAssignments,
  getAssignedShiftTypeOptionIdsInOptionOrder,
  removeShiftTypeAssignment,
  setShiftTypeAssignment,
} from "./shiftTypeAssignments";
import type { PositionType, ShiftData, StaffType } from "./types";

const options = [
  { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00" },
  { id: "middle", name: "中番", startTime: "13:00", endTime: "17:00" },
  { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00" },
];

const position: PositionType = { id: "default", name: "シフト", color: "#0d9488", isDefault: true };
const staff: StaffType = { id: "staff1", name: "田中 太郎", isSubmitted: true };

const shift = (overrides: Partial<ShiftData>): ShiftData => ({
  id: "shift-staff1-2026-05-23",
  staffId: "staff1",
  staffName: "田中 太郎",
  date: "2026-05-23",
  requestedTime: null,
  positions: [],
  ...overrides,
});

describe("shiftTypeAssignments", () => {
  it("勤務パターンごとの割当人数を数える", () => {
    const counts = countShiftTypeAssignments(
      [
        shift({
          positions: [
            {
              id: "seg-1",
              positionId: "default",
              positionName: "シフト",
              color: "#0d9488",
              start: "09:00",
              end: "13:00",
              shiftTypeOptionId: "morning",
            },
            {
              id: "seg-2",
              positionId: "default",
              positionName: "シフト",
              color: "#0d9488",
              start: "17:00",
              end: "21:00",
              shiftTypeOptionId: "late",
            },
          ],
        }),
        shift({
          id: "shift-staff2-2026-05-23",
          staffId: "staff2",
          positions: [
            {
              id: "seg-3",
              positionId: "default",
              positionName: "シフト",
              color: "#0d9488",
              start: "09:00",
              end: "13:00",
              shiftTypeOptionId: "morning",
            },
          ],
        }),
      ],
      ["morning", "middle", "late"],
    );

    expect(counts.get("morning")).toBe(2);
    expect(counts.get("middle")).toBe(0);
    expect(counts.get("late")).toBe(1);
  });

  it("割当済み勤務パターンIDを勤務パターンの並び順で返す", () => {
    const assignedIds = getAssignedShiftTypeOptionIdsInOptionOrder(
      shift({
        positions: [
          {
            id: "seg-1",
            positionId: "default",
            positionName: "シフト",
            color: "#0d9488",
            start: "13:00",
            end: "17:00",
            shiftTypeOptionId: "middle",
          },
          {
            id: "seg-2",
            positionId: "default",
            positionName: "シフト",
            color: "#0d9488",
            start: "09:00",
            end: "13:00",
            shiftTypeOptionId: "morning",
          },
        ],
      }),
      ["morning", "middle", "late"],
    );

    expect(assignedIds).toEqual(["morning", "middle"]);
  });
});

describe("setShiftTypeAssignment と removeShiftTypeAssignment", () => {
  const date = "2026-05-23";
  const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };

  const optionSegment = (option: (typeof options)[number], assignedPosition: PositionType) => ({
    id: `seg-staff1-${date}-${option.id}`,
    positionId: assignedPosition.id,
    positionName: assignedPosition.name,
    color: assignedPosition.color,
    start: option.startTime,
    end: option.endTime,
    shiftTypeOptionId: option.id,
  });

  // 早番と遅番が、どちらも既定のポジションで入っている日。
  const assigned = (): ShiftData[] => [
    shift({
      requestedShiftTypeOptionIds: ["morning"],
      positions: [optionSegment(options[0], position), optionSegment(options[2], position)],
    }),
  ];

  it("勤務のない日には、指定したポジションで勤務パターンを入れる", () => {
    const result = setShiftTypeAssignment({ shifts: [], staff, date, option: options[0], position: kitchen });

    expect(result).toEqual([
      {
        id: `shift-staff1-${date}`,
        staffId: "staff1",
        staffName: "田中 太郎",
        date,
        requestedTime: null,
        positions: [optionSegment(options[0], kitchen)],
      },
    ]);
  });

  it("まだ入っていない勤務パターンは、ほかの勤務パターンを変えずに足す", () => {
    const shifts = assigned();
    const result = setShiftTypeAssignment({ shifts, staff, date, option: options[1], position: kitchen });

    expect(result).toEqual([
      {
        ...shifts[0],
        positions: [
          optionSegment(options[0], position),
          optionSegment(options[2], position),
          optionSegment(options[1], kitchen),
        ],
      },
    ]);
  });

  it("入っている勤務パターンは、ポジションだけを入れ替え、1つの勤務パターンに1つのポジションを保つ", () => {
    const shifts = assigned();
    const result = setShiftTypeAssignment({ shifts, staff, date, option: options[0], position: kitchen });

    expect(result).toEqual([
      { ...shifts[0], positions: [optionSegment(options[0], kitchen), optionSegment(options[2], position)] },
    ]);
  });

  it("指定した勤務パターンだけを外し、希望は残す", () => {
    const shifts = assigned();
    const result = removeShiftTypeAssignment({ shifts, staffId: "staff1", date, optionId: "morning" });

    expect(result).toEqual([{ ...shifts[0], positions: [optionSegment(options[2], position)] }]);
  });

  it("ほかのスタッフの勤務と、同じスタッフのほかの日の勤務は変えない", () => {
    const otherStaff = shift({
      id: `shift-staff2-${date}`,
      staffId: "staff2",
      staffName: "鈴木 花子",
      positions: [optionSegment(options[0], position)],
    });
    const otherDay = shift({
      id: "shift-staff1-2026-05-24",
      date: "2026-05-24",
      positions: [optionSegment(options[0], position)],
    });
    const shifts = [otherStaff, ...assigned(), otherDay];

    const replaced = setShiftTypeAssignment({ shifts, staff, date, option: options[0], position: kitchen });
    expect(replaced[1].positions).toEqual([optionSegment(options[0], kitchen), optionSegment(options[2], position)]);
    expect([replaced[0], replaced[2]]).toEqual([otherStaff, otherDay]);

    const removed = removeShiftTypeAssignment({ shifts, staffId: "staff1", date, optionId: "morning" });
    expect(removed[1].positions).toEqual([optionSegment(options[2], position)]);
    expect([removed[0], removed[2]]).toEqual([otherStaff, otherDay]);
  });

  it("入っていない勤務パターンと、勤務のない日は、外しても何も変えない", () => {
    const shifts = assigned();

    expect(removeShiftTypeAssignment({ shifts, staffId: "staff1", date, optionId: "middle" })).toBe(shifts);
    expect(removeShiftTypeAssignment({ shifts, staffId: "staff1", date: "2026-05-24", optionId: "morning" })).toBe(
      shifts,
    );
  });
});
