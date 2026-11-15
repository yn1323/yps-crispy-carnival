import { describe, expect, it } from "vitest";
import { buildAssignments, canonicalizeTimeAssignments } from "./buildAssignments";
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

  it("時間指定でも空白・異なるポジション・異なるstaffと日付は統合しない", () => {
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

  it("時間指定でも勤務パターンIDを持つ割当は統合しない", () => {
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

  it("勤務パターンIDを一件でも持つセルは他の隣接割当も部分統合しない", () => {
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

  it("勤務パターンIDがあればoptionIdとして含める", () => {
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

describe("buildAssignments: 休憩", () => {
  it.each(["time", "shiftType", undefined] as const)(
    "時刻を持つ勤務（%s）では、勤務区間の内側に収まる休憩だけを区間ごとに持たせる",
    (kind) => {
      const shifts = [
        makeShift({
          positions: [
            segment({ id: "seg-1", start: "10:00", end: "14:00", shiftTypeOptionId: "early" }),
            segment({ id: "seg-2", positionId: "pos2", start: "14:00", end: "18:00", shiftTypeOptionId: "late" }),
          ],
          breaks: [
            { start: "11:00", end: "11:15" },
            { start: "13:30", end: "14:30" },
            { start: "17:30", end: "19:00" },
            { start: "20:00", end: "21:00" },
          ],
        }),
      ];

      expect(buildAssignments(shifts, new Set(), kind ? { submissionPatternKind: kind } : {})).toStrictEqual([
        {
          staffId: "staff1",
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "14:00",
          optionId: "early",
          positionId: "pos1",
          breaks: [
            { startTime: "11:00", endTime: "11:15" },
            { startTime: "13:30", endTime: "14:00" },
          ],
        },
        {
          staffId: "staff1",
          date: "2026-01-20",
          startTime: "14:00",
          endTime: "18:00",
          optionId: "late",
          positionId: "pos2",
          breaks: [
            { startTime: "14:00", endTime: "14:30" },
            { startTime: "17:30", endTime: "18:00" },
          ],
        },
      ]);
    },
  );

  it.each(["time", "shiftType"] as const)("%sでは、勤務の外にある休憩と勤務全体を覆う休憩を保存しない", (kind) => {
    const outside = makeShift({ positions: [segment({})], breaks: [{ start: "18:00", end: "19:00" }] });
    const whole = makeShift({
      id: "shift-staff2-2026-01-20",
      staffId: "staff2",
      positions: [segment({})],
      breaks: [{ start: "10:00", end: "18:00" }],
    });

    expect(buildAssignments([outside, whole], new Set(), { submissionPatternKind: kind })).toStrictEqual([
      { staffId: "staff1", date: "2026-01-20", startTime: "10:00", endTime: "18:00", positionId: "pos1" },
      { staffId: "staff2", date: "2026-01-20", startTime: "10:00", endTime: "18:00", positionId: "pos1" },
    ]);
  });

  it("日付選択では、勤務の時刻の外にある休憩も、最初の勤務へそのまま持たせる", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "break", positionId: BREAK_POSITION.id, start: "08:00", end: "09:00" }),
          segment({ id: "seg-1", start: "09:00", end: "22:00" }),
        ],
        breaks: [
          { start: "23:00", end: "23:30" },
          { start: "09:00", end: "22:00" },
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "dateOnly" })).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "22:00",
        positionId: "pos1",
        breaks: [
          { startTime: "09:00", endTime: "22:00" },
          { startTime: "23:00", endTime: "23:30" },
        ],
      },
    ]);
  });

  it("日付選択で同じ日に勤務が2件ある場合は、最初の勤務にだけ休憩を持たせる", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00" }),
          segment({ id: "seg-2", start: "12:00", end: "22:00" }),
        ],
        breaks: [{ start: "13:00", end: "14:00" }],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "dateOnly" })).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "12:00",
        positionId: "pos1",
        breaks: [{ startTime: "13:00", endTime: "14:00" }],
      },
      { staffId: "staff1", date: "2026-01-20", startTime: "12:00", endTime: "22:00", positionId: "pos1" },
    ]);
  });

  it("定休日の休憩は保存しない", () => {
    const shifts = [makeShift({ positions: [segment({})], breaks: [{ start: "12:00", end: "13:00" }] })];
    expect(buildAssignments(shifts, new Set(["2026-01-20"]), { submissionPatternKind: "time" })).toEqual([]);
  });

  it("時間指定で隣り合う勤務を1件にまとめても、それぞれの休憩を開始順に残す", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-2", start: "14:00", end: "18:00" }),
          segment({ id: "seg-1", start: "10:00", end: "14:00" }),
        ],
        breaks: [
          { start: "16:00", end: "16:15" },
          { start: "12:00", end: "13:00" },
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        positionId: "pos1",
        breaks: [
          { startTime: "12:00", endTime: "13:00" },
          { startTime: "16:00", endTime: "16:15" },
        ],
      },
    ]);
  });
});

describe("buildAssignments: 仮の勤務", () => {
  it.each(["time", "shiftType", "dateOnly"] as const)("%sで、仮の勤務の日のすべての勤務へ仮の印を付ける", (kind) => {
    const shifts = [
      makeShift({
        isProvisional: true,
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00" }),
          segment({ id: "seg-2", start: "13:00", end: "18:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: kind })).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "12:00",
        positionId: "pos1",
        isProvisional: true,
      },
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "13:00",
        endTime: "18:00",
        positionId: "pos1",
        isProvisional: true,
      },
    ]);
  });

  it("時間指定で隣り合う仮の勤務を1件にまとめても、仮の印を残す", () => {
    const shifts = [
      makeShift({
        isProvisional: true,
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00" }),
          segment({ id: "seg-2", start: "12:00", end: "18:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "18:00",
        positionId: "pos1",
        isProvisional: true,
      },
    ]);
  });
});

describe("buildAssignments: 休憩も仮の印もない勤務", () => {
  it.each(["time", "shiftType", "dateOnly", undefined] as const)("%sで、休憩と仮の印の項目を足さない", (kind) => {
    const shifts = [
      makeShift({ positions: [segment({ shiftTypeOptionId: "morning" })], breaks: [], isProvisional: false }),
      makeShift({
        id: "shift-staff2-2026-01-20",
        staffId: "staff2",
        positions: [segment({ positionId: DEFAULT_POSITION.id, shiftTypeOptionId: "morning" })],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), kind ? { submissionPatternKind: kind } : {})).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        optionId: "morning",
        positionId: "pos1",
      },
      { staffId: "staff2", date: "2026-01-20", startTime: "10:00", endTime: "18:00", optionId: "morning" },
    ]);
  });

  it("時間指定で隣り合う勤務をまとめた結果にも、休憩と仮の印の項目を足さない", () => {
    const shifts = [
      makeShift({
        positions: [
          segment({ id: "seg-1", start: "09:00", end: "12:00" }),
          segment({ id: "seg-2", start: "12:00", end: "18:00" }),
        ],
      }),
    ];

    expect(buildAssignments(shifts, new Set(), { submissionPatternKind: "time" })).toStrictEqual([
      { staffId: "staff1", date: "2026-01-20", startTime: "09:00", endTime: "18:00", positionId: "pos1" },
    ]);
  });
});

describe("canonicalizeTimeAssignments", () => {
  const assignment = (
    startTime: string,
    endTime: string,
    overrides: Partial<Parameters<typeof canonicalizeTimeAssignments>[0][number]> = {},
  ) => ({ staffId: "staff1", date: "2026-01-20", startTime, endTime, positionId: "pos1", ...overrides });

  it("勤務の境目で分かれていた休憩は、勤務をまとめるときに1件へ戻す", () => {
    const result = canonicalizeTimeAssignments([
      assignment("10:00", "14:00", { breaks: [{ startTime: "13:30", endTime: "14:00" }] }),
      assignment("14:00", "18:00", { breaks: [{ startTime: "14:00", endTime: "14:30" }] }),
    ]);

    expect(result).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        positionId: "pos1",
        breaks: [{ startTime: "13:30", endTime: "14:30" }],
      },
    ]);
  });

  it("隣り合う勤務をまとめても休憩を落とさず、開始順に並べる", () => {
    const result = canonicalizeTimeAssignments([
      assignment("14:00", "18:00", { breaks: [{ startTime: "16:00", endTime: "16:15" }] }),
      assignment("10:00", "14:00", {
        breaks: [
          { startTime: "12:00", endTime: "13:00" },
          { startTime: "10:30", endTime: "10:45" },
        ],
      }),
    ]);

    expect(result).toStrictEqual([
      {
        staffId: "staff1",
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        positionId: "pos1",
        breaks: [
          { startTime: "10:30", endTime: "10:45" },
          { startTime: "12:00", endTime: "13:00" },
          { startTime: "16:00", endTime: "16:15" },
        ],
      },
    ]);
  });

  it("片方にだけ休憩がある勤務をまとめても、その休憩を残す", () => {
    const result = canonicalizeTimeAssignments([
      assignment("10:00", "14:00"),
      assignment("14:00", "18:00", { breaks: [{ startTime: "16:00", endTime: "16:15" }] }),
    ]);

    expect(result).toStrictEqual([
      assignment("10:00", "18:00", { breaks: [{ startTime: "16:00", endTime: "16:15" }] }),
    ]);
  });

  it("仮の印は、まとめる勤務の両方が仮のときだけ残す", () => {
    expect(
      canonicalizeTimeAssignments([
        assignment("10:00", "14:00", { isProvisional: true }),
        assignment("14:00", "18:00", { isProvisional: true }),
      ]),
    ).toStrictEqual([assignment("10:00", "18:00", { isProvisional: true })]);

    expect(
      canonicalizeTimeAssignments([
        assignment("10:00", "14:00", { isProvisional: true }),
        assignment("14:00", "18:00"),
      ]),
    ).toStrictEqual([assignment("10:00", "18:00")]);

    expect(
      canonicalizeTimeAssignments([
        assignment("10:00", "14:00"),
        assignment("14:00", "18:00", { isProvisional: true }),
      ]),
    ).toStrictEqual([assignment("10:00", "18:00")]);
  });

  it("3件以上が続く場合も、1件でも仮でない勤務があれば仮の印を外す", () => {
    expect(
      canonicalizeTimeAssignments([
        assignment("10:00", "12:00", { isProvisional: true }),
        assignment("12:00", "14:00", { isProvisional: true }),
        assignment("14:00", "18:00"),
      ]),
    ).toStrictEqual([assignment("10:00", "18:00")]);
  });

  it("まとめない勤務の休憩と仮の印は、そのまま残す", () => {
    const separated = [
      assignment("10:00", "12:00", { breaks: [{ startTime: "11:00", endTime: "11:15" }], isProvisional: true }),
      assignment("13:00", "18:00", { breaks: [{ startTime: "15:00", endTime: "16:00" }] }),
      assignment("18:00", "20:00", { positionId: "pos2", isProvisional: true }),
    ];

    expect(canonicalizeTimeAssignments(separated)).toStrictEqual(separated);
  });

  it("休憩も仮の印もない勤務をまとめた結果に、項目を足さない", () => {
    expect(canonicalizeTimeAssignments([assignment("10:00", "14:00"), assignment("14:00", "18:00")])).toStrictEqual([
      { staffId: "staff1", date: "2026-01-20", startTime: "10:00", endTime: "18:00", positionId: "pos1" },
    ]);
  });
});
