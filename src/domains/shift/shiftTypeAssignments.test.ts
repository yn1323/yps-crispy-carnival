import { describe, expect, it } from "vitest";
import {
  countShiftTypeAssignments,
  getAssignedShiftTypeOptionIdsInOptionOrder,
  getShiftTypeRequestLabel,
  toggleShiftTypeAssignment,
} from "./shiftTypeAssignments";
import type { PositionType, ShiftData, StaffType } from "./types";

const options = [
  { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00" },
  { id: "middle", name: "中番", startTime: "13:00", endTime: "17:00" },
  { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00" },
];

const position: PositionType = { id: "default", name: "シフト", color: "#0d9488" };
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
  it("希望勤務区分名を中黒区切りで要約する", () => {
    expect(getShiftTypeRequestLabel(shift({ requestedShiftTypeOptionIds: ["morning", "late"] }), options, true)).toBe(
      "早番・遅番",
    );
    expect(getShiftTypeRequestLabel(shift({ requestedShiftTypeOptionIds: [] }), options, true)).toBe("休み");
    expect(getShiftTypeRequestLabel(undefined, options, false)).toBe("未提出");
  });

  it("勤務区分ごとの割当人数を数える", () => {
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

  it("割当済み勤務区分IDを勤務区分の並び順で返す", () => {
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

  it("セル押下で勤務区分割当を追加・削除する", () => {
    const added = toggleShiftTypeAssignment({
      shifts: [],
      staff,
      date: "2026-05-23",
      option: options[0],
      position,
    });

    expect(added[0].positions).toEqual([
      expect.objectContaining({
        start: "09:00",
        end: "13:00",
        shiftTypeOptionId: "morning",
      }),
    ]);

    const removed = toggleShiftTypeAssignment({
      shifts: added,
      staff,
      date: "2026-05-23",
      option: options[0],
      position,
    });

    expect(removed[0].positions).toEqual([]);
  });
});
