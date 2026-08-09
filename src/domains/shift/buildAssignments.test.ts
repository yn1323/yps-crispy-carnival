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

  it("仮想defaultを実ポジションへ解決して完全隣接する時間割当を統合する", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-1", positionId: DEFAULT_POSITION.id, start: "08:30", end: "09:00" }),
          segment({ id: "seg-2", positionId: "position-default", start: "09:00", end: "14:00" }),
        ],
      }),
    ];

    expect(
      buildAssignments(shifts, new Set(), {
        defaultPositionId: "position-default",
        submissionPatternKind: "time",
      }),
    ).toEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "08:30",
        endTime: "14:00",
        positionId: "position-default",
      },
    ]);
  });

  it("時間入力でも空白・異なるポジション・異なるstaffと日付は統合しない", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "gap-1", start: "09:00", end: "10:00" }),
          segment({ id: "gap-2", start: "11:00", end: "12:00" }),
          segment({ id: "other-position", positionId: "pos2", start: "12:00", end: "13:00" }),
        ],
      }),
      makeShift({
        id: "shift-staff2-2026-01-20",
        staffId: "staff2",
        positions: [segment({ id: "staff-2", start: "13:00", end: "14:00" })],
      }),
      makeShift({
        id: "shift-staff1-2026-01-21",
        date: "2026-01-21",
        positions: [segment({ id: "next-date", start: "13:00", end: "14:00" })],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toHaveLength(5);
  });

  it("重複または不正時刻を含むセルは正規化せずvalidation用の入力を保持する", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "overlap-1", start: "09:00", end: "12:00" }),
          segment({ id: "overlap-2", start: "11:00", end: "13:00" }),
          segment({ id: "adjacent", start: "13:00", end: "14:00" }),
        ],
      }),
      makeShift({
        id: "shift-staff2-2026-01-20",
        staffId: "staff2",
        positions: [
          segment({ id: "invalid", start: "invalid", end: "15:00" }),
          segment({ id: "after-invalid", start: "15:00", end: "16:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toHaveLength(5);
  });

  it.each(["dateOnly", "shiftType"] as const)("%s方式では完全隣接する割当を統合しない", (kind) => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00" }),
          segment({ id: "seg-2", start: "12:00", end: "15:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: kind })).toHaveLength(2);
  });

  it("時間方式でも勤務区分IDを持つ割当は統合しない", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00", shiftTypeOptionId: "morning" }),
          segment({ id: "seg-2", start: "12:00", end: "15:00", shiftTypeOptionId: "morning" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toHaveLength(2);
  });

  it("勤務区分IDを一件でも持つセルは他の隣接割当も部分統合しない", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "option", positionId: "pos2", start: "08:00", end: "09:00", shiftTypeOptionId: "legacy" }),
          segment({ id: "plain-1", start: "09:00", end: "10:00" }),
          segment({ id: "plain-2", start: "10:00", end: "11:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toHaveLength(3);
  });

  it("不正な日付を持つセルは隣接割当を統合しない", () => {
    const shifts = [
      makeShift({
        date: "2026-02-30",
        positions: [
          segment({ id: "invalid-date-1", start: "09:00", end: "10:00" }),
          segment({ id: "invalid-date-2", start: "10:00", end: "11:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toHaveLength(2);
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
