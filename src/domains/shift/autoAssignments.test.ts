import { describe, expect, it } from "vitest";
import { applyAutoAssignments } from "./autoAssignments";
import type { PositionType, ShiftData } from "./types";

const HALL: PositionType = { id: "hall", name: "ホール", color: "#7c3aed", isDefault: true };
const KITCHEN: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const POSITIONS = [HALL, KITCHEN];
const DAY1 = "2026-08-17";
const DAY2 = "2026-08-18";

const cell = (staffId: string, date: string, overrides: Partial<ShiftData> = {}): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffId,
  date,
  requestedTime: { start: "10:00", end: "18:00" },
  requestedTimes: [{ start: "10:00", end: "18:00" }],
  positions: [],
  ...overrides,
});

const manualSegment = (staffId: string, date: string) => ({
  id: `seg-${staffId}-${date}`,
  positionId: HALL.id,
  positionName: HALL.name,
  color: HALL.color,
  start: "09:00",
  end: "12:00",
});

describe("applyAutoAssignments", () => {
  it("結果のある日へ、ポジションの名前と色を付けた勤務と休憩を入れる", () => {
    const result = applyAutoAssignments({
      shifts: [cell("a", DAY1)],
      created: [
        {
          staffId: "a",
          date: DAY1,
          segments: [
            { startTime: "10:00", endTime: "14:00", positionId: "hall" },
            { startTime: "14:00", endTime: "18:00", positionId: "kitchen" },
          ],
          breaks: [{ startTime: "13:30", endTime: "14:15" }],
        },
      ],
      positions: POSITIONS,
    });

    expect(result).toEqual([
      cell("a", DAY1, {
        positions: [
          {
            id: `seg-a-${DAY1}-0`,
            positionId: "hall",
            positionName: "ホール",
            color: "#7c3aed",
            start: "10:00",
            end: "14:00",
          },
          {
            id: `seg-a-${DAY1}-1`,
            positionId: "kitchen",
            positionName: "キッチン",
            color: "#c2410c",
            start: "14:00",
            end: "18:00",
          },
        ],
        breaks: [{ start: "13:30", end: "14:15" }],
      }),
    ]);
  });

  it("区間が1つの日のIDは手で入れた勤務と同じ形にし、パターン選択は勤務パターンごとのIDにする", () => {
    const result = applyAutoAssignments({
      shifts: [cell("a", DAY1), cell("a", DAY2)],
      created: [
        {
          staffId: "a",
          date: DAY1,
          segments: [{ startTime: "09:00", endTime: "22:00", positionId: "hall" }],
          breaks: [],
        },
        {
          staffId: "a",
          date: DAY2,
          segments: [
            { startTime: "09:00", endTime: "15:00", positionId: "hall", optionId: "early" },
            { startTime: "15:00", endTime: "22:00", positionId: "kitchen", optionId: "late" },
          ],
          breaks: [],
        },
      ],
      positions: POSITIONS,
    });

    expect(result.map((shift) => shift.positions.map((segment) => [segment.id, segment.shiftTypeOptionId]))).toEqual([
      [[`seg-a-${DAY1}`, undefined]],
      [
        [`seg-a-${DAY2}-early`, "early"],
        [`seg-a-${DAY2}-late`, "late"],
      ],
    ]);
  });

  it("結果にない日は、手で入れた勤務と休憩を消し、希望を残す", () => {
    const manual = cell("a", DAY1, {
      positions: [manualSegment("a", DAY1)],
      breaks: [{ start: "10:00", end: "10:30" }],
    });
    const manualWithoutRequest = cell("b", DAY1, {
      requestedTime: null,
      requestedTimes: undefined,
      positions: [manualSegment("b", DAY1)],
    });

    const result = applyAutoAssignments({ shifts: [manual, manualWithoutRequest], created: [], positions: POSITIONS });

    expect(result).toEqual([cell("a", DAY1), cell("b", DAY1, { requestedTime: null, requestedTimes: undefined })]);
  });

  it("手で入れた勤務のある日も、結果の勤務に置き換える", () => {
    const manual = cell("a", DAY1, {
      positions: [manualSegment("a", DAY1)],
      breaks: [{ start: "10:00", end: "10:30" }],
    });

    const result = applyAutoAssignments({
      shifts: [manual],
      created: [
        {
          staffId: "a",
          date: DAY1,
          segments: [{ startTime: "12:00", endTime: "18:00", positionId: "kitchen" }],
          breaks: [],
        },
      ],
      positions: POSITIONS,
    });

    expect(result).toEqual([
      cell("a", DAY1, {
        positions: [
          {
            id: `seg-a-${DAY1}`,
            positionId: "kitchen",
            positionName: "キッチン",
            color: "#c2410c",
            start: "12:00",
            end: "18:00",
          },
        ],
      }),
    ]);
  });

  it("画面にない日の結果と、いまの設定にないポジションの区間は入れない", () => {
    const result = applyAutoAssignments({
      shifts: [cell("a", DAY1)],
      created: [
        {
          staffId: "a",
          date: DAY1,
          segments: [{ startTime: "10:00", endTime: "18:00", positionId: "deleted" }],
          breaks: [],
        },
        {
          staffId: "a",
          date: DAY2,
          segments: [{ startTime: "10:00", endTime: "18:00", positionId: "hall" }],
          breaks: [],
        },
      ],
      positions: POSITIONS,
    });

    expect(result).toEqual([cell("a", DAY1)]);
  });
});
