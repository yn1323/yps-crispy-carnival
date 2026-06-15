import { describe, expect, it } from "vitest";
import { buildAssignments } from "./buildAssignments";
import { BREAK_POSITION, DEFAULT_POSITION } from "./constants";
import type { ShiftData } from "./types";

const makeShift = (overrides: Partial<ShiftData>): ShiftData => ({
  id: "shift-staff1-2026-01-20",
  staffId: "staff1",
  staffName: "鈴木太郎",
  date: "2026-01-20",
  requestedTime: null,
  positions: [],
  ...overrides,
});

const segment = (overrides: Partial<ShiftData["positions"][number]>): ShiftData["positions"][number] => ({
  id: "seg-1",
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start: "10:00",
  end: "18:00",
  ...overrides,
});

describe("buildAssignments", () => {
  it("ポジションセグメントをassignmentsに変換する", () => {
    const shifts = [makeShift({ positions: [segment({})] })];
    expect(buildAssignments(shifts, new Set())).toEqual([
      { staffId: "staff1", date: "2026-01-20", startTime: "10:00", endTime: "18:00", positionId: "pos1" },
    ]);
  });

  it("デフォルトポジションはpositionIdを省略する", () => {
    const shifts = [makeShift({ positions: [segment({ positionId: DEFAULT_POSITION.id })] })];
    expect(buildAssignments(shifts, new Set())).toEqual([
      { staffId: "staff1", date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
    ]);
  });

  it("休憩（BREAK）セグメントは除外する", () => {
    const shifts = [
      makeShift({
        positions: [segment({}), segment({ id: "seg-2", positionId: BREAK_POSITION.id, start: "12:00", end: "13:00" })],
      }),
    ];
    expect(buildAssignments(shifts, new Set())).toHaveLength(1);
  });

  it("定休日のシフトは除外する", () => {
    const shifts = [makeShift({ positions: [segment({})] })];
    expect(buildAssignments(shifts, new Set(["2026-01-20"]))).toEqual([]);
  });

  it("勤務区分IDがあればoptionIdとして含める", () => {
    const shifts = [makeShift({ positions: [segment({ shiftTypeOptionId: "morning" })] })];
    expect(buildAssignments(shifts, new Set())).toEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        optionId: "morning",
        positionId: "pos1",
      },
    ]);
  });

  it("ポジションが空のシフトは何も生成しない", () => {
    expect(buildAssignments([makeShift({})], new Set())).toEqual([]);
  });
});
