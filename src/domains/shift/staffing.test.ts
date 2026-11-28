import { describe, expect, it } from "vitest";
import { BREAK_POSITION } from "./constants";
import {
  buildPositionStaffingBands,
  countStaffingByDay,
  countStaffingByShiftType,
  listNewcomerOnlyPeriods,
} from "./staffing";
import type { PositionSegment, ShiftData, StaffingBar } from "./types";

const HALL = "hall";
const KITCHEN = "kitchen";
const positionIds = [HALL, KITCHEN];

const segment = (
  start: string,
  end: string,
  positionId: string = HALL,
  overrides: Partial<PositionSegment> = {},
): PositionSegment => ({
  id: `seg-${positionId}-${start}-${end}`,
  positionId,
  positionName: positionId,
  color: "#3b82f6",
  start,
  end,
  ...overrides,
});

// ポジションごとの見習い。new1とnew2は、どのポジションでも見習いとして扱う。
const newcomersAt = (staffIdsByPositionId: Record<string, string[]>) =>
  new Map(Object.entries(staffIdsByPositionId).map(([positionId, staffIds]) => [positionId, new Set(staffIds)]));
const newcomersEverywhere = newcomersAt({ [HALL]: ["new1", "new2"], [KITCHEN]: ["new1", "new2"] });
// mixは、ホールでは一人前、キッチンでは見習い。
const kitchenOnlyNewcomer = newcomersAt({ [KITCHEN]: ["mix"] });

const shift = (staffId: string, positions: PositionSegment[], breaks?: ShiftData["breaks"]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: "2026-05-21",
  requestedTime: null,
  positions,
  ...(breaks ? { breaks } : {}),
});

describe("countStaffingByShiftType", () => {
  const early = { shiftTypeOptionId: "early" };
  const late = { shiftTypeOptionId: "late" };

  it("勤務パターンごとに、ポジション別の人数、必要人数、不足を返す", () => {
    const result = countStaffingByShiftType({
      shifts: [
        shift("a", [segment("09:00", "15:00", HALL, early), segment("15:00", "21:00", KITCHEN, late)]),
        shift("b", [segment("09:00", "15:00", KITCHEN, early)]),
      ],
      positionIds,
      optionIds: ["early", "late"],
      slots: [
        {
          key: { kind: "shiftType", optionId: "early" },
          requirements: [
            { positionId: HALL, count: 2 },
            { positionId: KITCHEN, count: 1 },
          ],
        },
      ],
    });

    expect(result).toEqual([
      {
        key: { kind: "shiftType", optionId: "early" },
        total: 2,
        positions: [
          { positionId: HALL, count: 1, required: 2, shortage: 1, excess: 0, isNewcomerOnly: false },
          { positionId: KITCHEN, count: 1, required: 1, shortage: 0, excess: 0, isNewcomerOnly: false },
        ],
        hasShortage: true,
        hasExcess: false,
      },
      {
        key: { kind: "shiftType", optionId: "late" },
        total: 1,
        positions: [
          { positionId: HALL, count: 0, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
          { positionId: KITCHEN, count: 1, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
        ],
        hasShortage: false,
        hasExcess: false,
      },
    ]);
  });

  it("休憩が入っていても人数を変えない", () => {
    const [result] = countStaffingByShiftType({
      shifts: [shift("a", [segment("09:00", "15:00", HALL, early)], [{ start: "09:00", end: "14:45" }])],
      positionIds,
      optionIds: ["early"],
      slots: [],
    });

    expect(result.total).toBe(1);
    expect(result.positions[0].count).toBe(1);
  });

  it("必要人数が未設定の日は、すべての勤務パターンを必要人数なしで返す", () => {
    const result = countStaffingByShiftType({ shifts: [], positionIds, optionIds: ["early", "late"], slots: [] });

    expect(result.map((slot) => slot.key)).toEqual([
      { kind: "shiftType", optionId: "early" },
      { kind: "shiftType", optionId: "late" },
    ]);
    expect(result.flatMap((slot) => slot.positions.map((position) => position.required))).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(result.map((slot) => slot.hasShortage)).toEqual([false, false]);
  });

  it("いまの勤務パターンにない区切りと、勤務パターンのない勤務は数えない", () => {
    const result = countStaffingByShiftType({
      shifts: [
        shift("a", [segment("09:00", "15:00", HALL, { shiftTypeOptionId: "removed" })]),
        shift("b", [segment("09:00", "15:00", HALL)]),
      ],
      positionIds,
      optionIds: ["early"],
      slots: [{ key: { kind: "shiftType", optionId: "removed" }, requirements: [{ positionId: HALL, count: 3 }] }],
    });

    expect(result).toEqual([
      {
        key: { kind: "shiftType", optionId: "early" },
        total: 0,
        positions: [
          { positionId: HALL, count: 0, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
          { positionId: KITCHEN, count: 0, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
        ],
        hasShortage: false,
        hasExcess: false,
      },
    ]);
  });
});

describe("countStaffingByDay", () => {
  it("1日の、ポジション別の人数、必要人数、不足を返す", () => {
    const result = countStaffingByDay({
      shifts: [
        shift("a", [segment("09:00", "22:00", HALL)]),
        shift("b", [segment("09:00", "22:00", KITCHEN)]),
        shift("c", [segment("09:00", "22:00", KITCHEN)]),
        shift("off", []),
      ],
      positionIds,
      slots: [
        {
          key: { kind: "allDay" },
          requirements: [
            { positionId: HALL, count: 3 },
            { positionId: KITCHEN, count: 2 },
          ],
        },
      ],
    });

    expect(result).toEqual({
      key: { kind: "allDay" },
      total: 3,
      positions: [
        { positionId: HALL, count: 1, required: 3, shortage: 2, excess: 0, isNewcomerOnly: false },
        { positionId: KITCHEN, count: 2, required: 2, shortage: 0, excess: 0, isNewcomerOnly: false },
      ],
      hasShortage: true,
      hasExcess: false,
    });
  });

  it("休憩が入っていても人数を変えない", () => {
    const result = countStaffingByDay({
      shifts: [shift("a", [segment("09:00", "22:00", HALL)], [{ start: "12:00", end: "13:00" }])],
      positionIds,
      slots: [],
    });

    expect(result.total).toBe(1);
    expect(result.positions[0].count).toBe(1);
  });

  it("必要人数が未設定の日は、必要人数なしで返す", () => {
    expect(countStaffingByDay({ shifts: [], positionIds, slots: [] })).toEqual({
      key: { kind: "allDay" },
      total: 0,
      positions: [
        { positionId: HALL, count: 0, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
        { positionId: KITCHEN, count: 0, required: null, shortage: 0, excess: 0, isNewcomerOnly: false },
      ],
      hasShortage: false,
      hasExcess: false,
    });
  });

  it("終日ではない区切りの必要人数は使わない", () => {
    const result = countStaffingByDay({
      shifts: [],
      positionIds,
      slots: [{ key: { kind: "shiftType", optionId: "early" }, requirements: [{ positionId: HALL, count: 2 }] }],
    });

    expect(result.positions.map((position) => position.required)).toEqual([null, null]);
    expect(result.hasShortage).toBe(false);
  });
});

describe("countStaffingByShiftType / countStaffingByDay の多い人数と見習いだけの印", () => {
  const early = { shiftTypeOptionId: "early" };

  it("パターン選択: 必要人数より多い人数を返し、ちょうどと不足は0にする", () => {
    const [result] = countStaffingByShiftType({
      shifts: [
        shift("a", [segment("09:00", "15:00", HALL, early)]),
        shift("b", [segment("09:00", "15:00", HALL, early)]),
        shift("c", [segment("09:00", "15:00", HALL, early)]),
        shift("d", [segment("09:00", "15:00", KITCHEN, early)]),
      ],
      positionIds: [HALL, KITCHEN, "register"],
      optionIds: ["early"],
      slots: [
        {
          key: { kind: "shiftType", optionId: "early" },
          requirements: [
            { positionId: HALL, count: 1 },
            { positionId: KITCHEN, count: 1 },
            { positionId: "register", count: 1 },
          ],
        },
      ],
    });

    expect(result.positions).toEqual([
      { positionId: HALL, count: 3, required: 1, shortage: 0, excess: 2, isNewcomerOnly: false },
      { positionId: KITCHEN, count: 1, required: 1, shortage: 0, excess: 0, isNewcomerOnly: false },
      { positionId: "register", count: 0, required: 1, shortage: 1, excess: 0, isNewcomerOnly: false },
    ]);
    expect(result.hasExcess).toBe(true);
    expect(result.hasShortage).toBe(true);
  });

  it("パターン選択: 必要人数が未設定のポジションは、人が入っていても多い人数を0にする", () => {
    const [result] = countStaffingByShiftType({
      shifts: [shift("a", [segment("09:00", "15:00", HALL, early)])],
      positionIds,
      optionIds: ["early"],
      slots: [],
    });

    expect(result.positions.map((position) => position.excess)).toEqual([0, 0]);
    expect(result.hasExcess).toBe(false);
  });

  it("パターン選択: 入っている人が全員見習いのポジションだけに印を付ける", () => {
    const [result] = countStaffingByShiftType({
      shifts: [
        shift("new1", [segment("09:00", "15:00", HALL, early)]),
        shift("new2", [segment("09:00", "15:00", HALL, early)]),
        shift("new1-other-day", []),
        shift("a", [segment("09:00", "15:00", KITCHEN, early)]),
        shift("new2", [segment("09:00", "15:00", KITCHEN, early)]),
      ],
      positionIds: [HALL, KITCHEN, "register"],
      optionIds: ["early"],
      slots: [],
      newcomerStaffIdsByPositionId: newcomersEverywhere,
    });

    // ホールは見習い2人、キッチンは一人前と見習い、レジはだれもいない。
    expect(result.positions.map((position) => position.isNewcomerOnly)).toEqual([true, false, false]);
  });

  it("パターン選択: ホールでは一人前でキッチンでは見習いの人は、キッチンに入ったときだけ見習いとして数える", () => {
    const result = countStaffingByShiftType({
      shifts: [
        shift("mix", [
          segment("09:00", "15:00", HALL, early),
          segment("15:00", "21:00", KITCHEN, { shiftTypeOptionId: "late" }),
        ]),
      ],
      positionIds,
      optionIds: ["early", "late"],
      slots: [],
      newcomerStaffIdsByPositionId: kitchenOnlyNewcomer,
    });

    // 早番はホール、遅番はキッチンに1人で入っている。
    expect(result.map((slot) => slot.positions.map((position) => position.isNewcomerOnly))).toEqual([
      [false, false],
      [false, true],
    ]);
  });

  it("日付選択: ホールでは一人前でキッチンでは見習いの人は、キッチンに入った日だけ見習いとして数える", () => {
    const count = (positionId: string) =>
      countStaffingByDay({
        shifts: [shift("mix", [segment("09:00", "22:00", positionId)])],
        positionIds,
        slots: [],
        newcomerStaffIdsByPositionId: kitchenOnlyNewcomer,
      }).positions.map((position) => position.isNewcomerOnly);

    expect(count(HALL)).toEqual([false, false]);
    expect(count(KITCHEN)).toEqual([false, true]);
  });

  it("見習いのstaffIdを渡さなければ、見習いだけの印は付かない", () => {
    const [result] = countStaffingByShiftType({
      shifts: [shift("new1", [segment("09:00", "15:00", HALL, early)])],
      positionIds,
      optionIds: ["early"],
      slots: [],
    });

    expect(result.positions.map((position) => position.isNewcomerOnly)).toEqual([false, false]);
  });

  it("日付選択: 多い人数と見習いだけの印を返す", () => {
    const result = countStaffingByDay({
      shifts: [
        shift("new1", [segment("09:00", "22:00", HALL)]),
        shift("new2", [segment("09:00", "22:00", HALL)]),
        shift("a", [segment("09:00", "22:00", KITCHEN)]),
      ],
      positionIds,
      slots: [
        {
          key: { kind: "allDay" },
          requirements: [
            { positionId: HALL, count: 1 },
            { positionId: KITCHEN, count: 2 },
          ],
        },
      ],
      newcomerStaffIdsByPositionId: newcomersEverywhere,
    });

    expect(result).toEqual({
      key: { kind: "allDay" },
      total: 3,
      positions: [
        { positionId: HALL, count: 2, required: 1, shortage: 0, excess: 1, isNewcomerOnly: true },
        { positionId: KITCHEN, count: 1, required: 2, shortage: 1, excess: 0, isNewcomerOnly: false },
      ],
      hasShortage: true,
      hasExcess: true,
    });
  });
});

describe("buildPositionStaffingBands", () => {
  const bar = (start: string, end: string, positionId: string = HALL): StaffingBar => ({ positionId, start, end });
  // 数える範囲は 9:00〜22:00。
  const range = { startMinutes: 9 * 60, endMinutes: 22 * 60 };
  const band = (input: Partial<Parameters<typeof buildPositionStaffingBands>[0]>) =>
    buildPositionStaffingBands({ shifts: [], bars: [], positionIds: [HALL], ...range, ...input });

  it("バーと勤務の開始と終了で区切り、人数、必要人数、差を返す", () => {
    const [hall] = band({
      shifts: [shift("a", [segment("09:00", "22:00")]), shift("b", [segment("11:00", "15:00")])],
      bars: [bar("09:00", "22:00"), bar("11:00", "14:00"), bar("17:00", "22:00")],
    });

    expect(hall).toEqual({
      positionId: HALL,
      isConfigured: true,
      segments: [
        { start: "09:00", end: "11:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
        { start: "11:00", end: "14:00", count: 2, required: 2, diff: 0, isNewcomerOnly: false },
        { start: "14:00", end: "15:00", count: 2, required: 1, diff: 1, isNewcomerOnly: false },
        { start: "15:00", end: "17:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
        { start: "17:00", end: "22:00", count: 1, required: 2, diff: -1, isNewcomerOnly: false },
      ],
    });
  });

  it("値が同じ隣どうしの区間は、バーや勤務の境目があっても1つにまとめる", () => {
    const [hall] = band({
      // 人は14:00で交代し、バーも14:00で隣り合う。人数も必要人数も変わらない。
      shifts: [shift("a", [segment("09:00", "14:00")]), shift("b", [segment("14:00", "22:00")])],
      bars: [bar("09:00", "14:00"), bar("14:00", "22:00")],
    });

    expect(hall.segments).toEqual([
      { start: "09:00", end: "22:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
    ]);
  });

  it("休憩中の人は数えず、休憩の開始と終了で区切る", () => {
    const [hall] = band({
      shifts: [shift("a", [segment("09:00", "22:00")], [{ start: "13:00", end: "13:45" }])],
      bars: [bar("09:00", "22:00")],
    });

    expect(hall.segments).toEqual([
      { start: "09:00", end: "13:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
      { start: "13:00", end: "13:45", count: 0, required: 1, diff: -1, isNewcomerOnly: false },
      { start: "13:45", end: "22:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
    ]);
  });

  it("休憩として入れた区間（休憩のポジション）は人数に数えない", () => {
    const [hall] = band({
      shifts: [
        shift("a", [
          segment("09:00", "12:00"),
          segment("12:00", "13:00", BREAK_POSITION.id),
          segment("13:00", "22:00"),
        ]),
      ],
      bars: [bar("09:00", "22:00")],
    });

    expect(hall.segments.map((item) => [item.start, item.end, item.count])).toEqual([
      ["09:00", "12:00", 1],
      ["12:00", "13:00", 0],
      ["13:00", "22:00", 1],
    ]);
  });

  it("人のいない時間と必要人数のない時間も、範囲の端から端まで区間にする", () => {
    const [hall] = band({ shifts: [shift("a", [segment("10:00", "12:00")])], bars: [bar("11:00", "13:00")] });

    expect(hall.segments).toEqual([
      { start: "09:00", end: "10:00", count: 0, required: 0, diff: 0, isNewcomerOnly: false },
      { start: "10:00", end: "11:00", count: 1, required: 0, diff: 1, isNewcomerOnly: false },
      { start: "11:00", end: "12:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
      { start: "12:00", end: "13:00", count: 0, required: 1, diff: -1, isNewcomerOnly: false },
      { start: "13:00", end: "22:00", count: 0, required: 0, diff: 0, isNewcomerOnly: false },
    ]);
  });

  it("バーが1本もないポジションは未設定とし、人が入っていても差を0にする", () => {
    const result = band({
      shifts: [shift("a", [segment("09:00", "22:00", KITCHEN)])],
      bars: [bar("09:00", "22:00", HALL)],
      positionIds: [HALL, KITCHEN],
    });

    expect(result).toEqual([
      {
        positionId: HALL,
        isConfigured: true,
        segments: [{ start: "09:00", end: "22:00", count: 0, required: 1, diff: -1, isNewcomerOnly: false }],
      },
      {
        positionId: KITCHEN,
        isConfigured: false,
        segments: [{ start: "09:00", end: "22:00", count: 1, required: null, diff: 0, isNewcomerOnly: false }],
      },
    ]);
  });

  it("必要人数が未設定の日は、全ポジションを未設定とする", () => {
    const result = band({
      shifts: [shift("a", [segment("09:00", "15:00", HALL)]), shift("b", [segment("12:00", "22:00", KITCHEN)])],
      bars: null,
      positionIds: [HALL, KITCHEN],
    });

    expect(result).toEqual([
      {
        positionId: HALL,
        isConfigured: false,
        segments: [
          { start: "09:00", end: "15:00", count: 1, required: null, diff: 0, isNewcomerOnly: false },
          { start: "15:00", end: "22:00", count: 0, required: null, diff: 0, isNewcomerOnly: false },
        ],
      },
      {
        positionId: KITCHEN,
        isConfigured: false,
        segments: [
          { start: "09:00", end: "12:00", count: 0, required: null, diff: 0, isNewcomerOnly: false },
          { start: "12:00", end: "22:00", count: 1, required: null, diff: 0, isNewcomerOnly: false },
        ],
      },
    ]);
  });

  it("ほかのポジションの勤務の境目では区切らない", () => {
    const [hall] = band({
      shifts: [shift("a", [segment("09:00", "22:00", HALL)]), shift("b", [segment("12:00", "15:00", KITCHEN)])],
      bars: [bar("09:00", "22:00")],
    });

    expect(hall.segments).toEqual([
      { start: "09:00", end: "22:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
    ]);
  });

  describe("見習いだけの区間", () => {
    it("1人以上いて全員が見習いの区間だけに印を付け、印が変わる時刻で区切る", () => {
      const [hall] = band({
        shifts: [
          shift("new1", [segment("09:00", "18:00")]),
          shift("new2", [segment("12:00", "15:00")]),
          shift("a", [segment("15:00", "17:00")]),
        ],
        bars: null,
        newcomerStaffIdsByPositionId: newcomersEverywhere,
      });

      expect(hall.segments).toEqual([
        { start: "09:00", end: "12:00", count: 1, required: null, diff: 0, isNewcomerOnly: true },
        { start: "12:00", end: "15:00", count: 2, required: null, diff: 0, isNewcomerOnly: true },
        { start: "15:00", end: "17:00", count: 2, required: null, diff: 0, isNewcomerOnly: false },
        { start: "17:00", end: "18:00", count: 1, required: null, diff: 0, isNewcomerOnly: true },
        { start: "18:00", end: "22:00", count: 0, required: null, diff: 0, isNewcomerOnly: false },
      ]);
    });

    it("一人前の人が休憩に入り、見習いだけが残る区間に印を付ける", () => {
      const [hall] = band({
        shifts: [
          shift("new1", [segment("09:00", "22:00")]),
          shift("a", [segment("09:00", "22:00")], [{ start: "13:00", end: "14:00" }]),
        ],
        bars: null,
        newcomerStaffIdsByPositionId: newcomersEverywhere,
      });

      expect(hall.segments.map((item) => [item.start, item.end, item.count, item.isNewcomerOnly])).toEqual([
        ["09:00", "13:00", 2, false],
        ["13:00", "14:00", 1, true],
        ["14:00", "22:00", 2, false],
      ]);
    });

    it("ほかのポジションに一人前の人がいても、そのポジションが見習いだけなら印を付ける", () => {
      const result = band({
        shifts: [shift("new1", [segment("09:00", "22:00", HALL)]), shift("a", [segment("09:00", "22:00", KITCHEN)])],
        bars: null,
        positionIds: [HALL, KITCHEN],
        newcomerStaffIdsByPositionId: newcomersEverywhere,
      });

      expect(result.map((item) => item.segments.map((segmentItem) => segmentItem.isNewcomerOnly))).toEqual([
        [true],
        [false],
      ]);
    });

    it("ホールでは一人前でキッチンでは見習いの人が1人でいる場合、キッチンの区間だけに印を付ける", () => {
      const result = band({
        shifts: [shift("mix", [segment("09:00", "13:00", HALL), segment("13:00", "22:00", KITCHEN)])],
        bars: null,
        positionIds: [HALL, KITCHEN],
        newcomerStaffIdsByPositionId: kitchenOnlyNewcomer,
      });

      expect(
        result.map((item) => item.segments.map((part) => [part.start, part.end, part.count, part.isNewcomerOnly])),
      ).toEqual([
        [
          ["09:00", "13:00", 1, false],
          ["13:00", "22:00", 0, false],
        ],
        [
          ["09:00", "13:00", 0, false],
          ["13:00", "22:00", 1, true],
        ],
      ]);
    });

    it("キッチンで見習いの人と、キッチンで一人前の人が一緒にいる区間には印を付けない", () => {
      const [, kitchen] = band({
        shifts: [shift("mix", [segment("09:00", "22:00", KITCHEN)]), shift("a", [segment("12:00", "15:00", KITCHEN)])],
        bars: null,
        positionIds: [HALL, KITCHEN],
        newcomerStaffIdsByPositionId: kitchenOnlyNewcomer,
      });

      expect(kitchen.segments.map((part) => [part.start, part.end, part.isNewcomerOnly])).toEqual([
        ["09:00", "12:00", true],
        ["12:00", "15:00", false],
        ["15:00", "22:00", true],
      ]);
    });

    it("見習いのstaffIdを渡さなければ印は付かない", () => {
      const [hall] = band({ shifts: [shift("new1", [segment("09:00", "22:00")])], bars: null });

      expect(hall.segments.map((item) => item.isNewcomerOnly)).toEqual([false]);
    });
  });

  describe("数える範囲", () => {
    it("範囲の外にある勤務とバーは数えず、またぐものは内側だけを数える", () => {
      const [hall] = band({
        shifts: [shift("a", [segment("07:00", "10:00")]), shift("b", [segment("21:00", "23:00")])],
        bars: [bar("08:00", "11:00"), bar("06:00", "08:00"), bar("22:00", "23:00")],
      });

      expect(hall.segments).toEqual([
        { start: "09:00", end: "10:00", count: 1, required: 1, diff: 0, isNewcomerOnly: false },
        { start: "10:00", end: "11:00", count: 0, required: 1, diff: -1, isNewcomerOnly: false },
        { start: "11:00", end: "21:00", count: 0, required: 0, diff: 0, isNewcomerOnly: false },
        { start: "21:00", end: "22:00", count: 1, required: 0, diff: 1, isNewcomerOnly: false },
      ]);
    });

    it("バーが範囲の外にしかないポジションは未設定とする", () => {
      const [hall] = band({
        shifts: [shift("a", [segment("09:00", "22:00")])],
        bars: [bar("06:00", "09:00"), bar("22:00", "23:00")],
      });

      expect(hall).toEqual({
        positionId: HALL,
        isConfigured: false,
        segments: [{ start: "09:00", end: "22:00", count: 1, required: null, diff: 0, isNewcomerOnly: false }],
      });
    });

    it("範囲の開始と終了が同じなら、区間を返さない", () => {
      const result = band({
        shifts: [shift("a", [segment("09:00", "22:00")])],
        bars: [bar("09:00", "22:00")],
        startMinutes: 600,
        endMinutes: 600,
      });

      expect(result.map((item) => item.segments)).toEqual([[]]);
    });
  });

  it("表示するポジションの並び順で返し、一覧にないポジションは返さない", () => {
    const result = band({
      shifts: [shift("a", [segment("09:00", "22:00", "removed")])],
      bars: [bar("09:00", "22:00", "removed")],
      positionIds: [KITCHEN, HALL],
    });

    expect(result.map((item) => item.positionId)).toEqual([KITCHEN, HALL]);
  });
});

describe("listNewcomerOnlyPeriods", () => {
  const on = (date: string, item: ShiftData): ShiftData => ({ ...item, id: `${item.id}-${date}`, date });
  const timePattern = { kind: "time" as const, startMinutes: 9 * 60, endMinutes: 22 * 60 };

  it("時間指定: 見習いだけの時間を、日、ポジション、時間帯の単位で返す", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [
        on("2026-05-21", shift("a", [segment("09:00", "17:00", HALL)])),
        on("2026-05-21", shift("new1", [segment("15:00", "22:00", HALL)])),
        on("2026-05-21", shift("new2", [segment("18:00", "22:00", KITCHEN)])),
        on("2026-05-22", shift("new1", [segment("09:00", "12:00", HALL)])),
      ],
      dates: ["2026-05-21", "2026-05-22"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: timePattern,
    });

    expect(result).toEqual([
      { date: "2026-05-21", positionId: HALL, scope: { kind: "time", start: "17:00", end: "22:00" } },
      { date: "2026-05-21", positionId: KITCHEN, scope: { kind: "time", start: "18:00", end: "22:00" } },
      { date: "2026-05-22", positionId: HALL, scope: { kind: "time", start: "09:00", end: "12:00" } },
    ]);
  });

  it("時間指定: 見習いの人数が途中で変わっても、見習いだけが続く時間は1件にまとめる", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [shift("new1", [segment("10:00", "18:00", HALL)]), shift("new2", [segment("12:00", "15:00", HALL)])],
      dates: ["2026-05-21"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: timePattern,
    });

    expect(result).toEqual([
      { date: "2026-05-21", positionId: HALL, scope: { kind: "time", start: "10:00", end: "18:00" } },
    ]);
  });

  it("時間指定: 一人前の人が入る時間をはさむと、前後を別の件にする", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [shift("new1", [segment("09:00", "18:00", HALL)]), shift("a", [segment("12:00", "14:00", HALL)])],
      dates: ["2026-05-21"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: timePattern,
    });

    expect(result.map((period) => period.scope)).toEqual([
      { kind: "time", start: "09:00", end: "12:00" },
      { kind: "time", start: "14:00", end: "18:00" },
    ]);
  });

  it("時間指定: 一人前の人の休憩で見習いだけが残る時間も返す", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [
        shift("a", [segment("09:00", "18:00", HALL)], [{ start: "12:00", end: "13:00" }]),
        shift("new1", [segment("09:00", "18:00", HALL)]),
      ],
      dates: ["2026-05-21"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: timePattern,
    });

    expect(result).toEqual([
      { date: "2026-05-21", positionId: HALL, scope: { kind: "time", start: "12:00", end: "13:00" } },
    ]);
  });

  it("パターン選択: 見習いだけの勤務パターンとポジションを返す", () => {
    const early = { shiftTypeOptionId: "early" };
    const late = { shiftTypeOptionId: "late" };
    const result = listNewcomerOnlyPeriods({
      shifts: [
        shift("new1", [segment("09:00", "15:00", HALL, early), segment("15:00", "21:00", KITCHEN, late)]),
        shift("a", [segment("15:00", "21:00", KITCHEN, late)]),
        shift("new2", [segment("15:00", "21:00", HALL, late)]),
      ],
      dates: ["2026-05-21"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: { kind: "shiftType", optionIds: ["early", "late"] },
    });

    expect(result).toEqual([
      { date: "2026-05-21", positionId: HALL, scope: { kind: "shiftType", optionId: "early" } },
      { date: "2026-05-21", positionId: HALL, scope: { kind: "shiftType", optionId: "late" } },
    ]);
  });

  it("日付選択: 見習いだけのポジションを1日の単位で返す", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [
        shift("new1", [segment("09:00", "22:00", HALL)]),
        shift("new2", [segment("09:00", "22:00", KITCHEN)]),
        shift("a", [segment("09:00", "22:00", KITCHEN)]),
      ],
      dates: ["2026-05-21"],
      positionIds,
      newcomerStaffIdsByPositionId: newcomersEverywhere,
      pattern: { kind: "dateOnly" },
    });

    expect(result).toEqual([{ date: "2026-05-21", positionId: HALL, scope: { kind: "allDay" } }]);
  });

  it("ホールでは一人前でキッチンでは見習いの人は、キッチンに1人でいる時間だけを返す", () => {
    const result = listNewcomerOnlyPeriods({
      shifts: [
        on("2026-05-21", shift("mix", [segment("09:00", "13:00", HALL), segment("13:00", "18:00", KITCHEN)])),
        // ホールにだけ入る日は、見習いとして入る勤務がないため何も返さない。
        on("2026-05-22", shift("mix", [segment("09:00", "18:00", HALL)])),
      ],
      dates: ["2026-05-21", "2026-05-22"],
      positionIds,
      newcomerStaffIdsByPositionId: kitchenOnlyNewcomer,
      pattern: timePattern,
    });

    expect(result).toEqual([
      { date: "2026-05-21", positionId: KITCHEN, scope: { kind: "time", start: "13:00", end: "18:00" } },
    ]);
  });

  it("渡した日だけを数え、見習いがいない店舗では何も返さない", () => {
    const shifts = [on("2026-05-23", shift("new1", [segment("09:00", "12:00", HALL)]))];

    expect(
      listNewcomerOnlyPeriods({
        shifts,
        dates: ["2026-05-21"],
        positionIds,
        newcomerStaffIdsByPositionId: newcomersEverywhere,
        pattern: timePattern,
      }),
    ).toEqual([]);
    expect(
      listNewcomerOnlyPeriods({
        shifts,
        dates: ["2026-05-23"],
        positionIds,
        newcomerStaffIdsByPositionId: new Map(),
        pattern: timePattern,
      }),
    ).toEqual([]);
  });
});
