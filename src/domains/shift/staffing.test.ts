import { describe, expect, it } from "vitest";
import { BREAK_POSITION } from "./constants";
import {
  countStaffingByDay,
  countStaffingByHour,
  countStaffingByShiftType,
  countStaffingByTimeSlots,
} from "./staffing";
import type { PositionSegment, ShiftData, StaffingSlot } from "./types";

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

const shift = (staffId: string, positions: PositionSegment[], breaks?: ShiftData["breaks"]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: "2026-05-21",
  requestedTime: null,
  positions,
  ...(breaks ? { breaks } : {}),
});

const timeSlot = (
  startTime: string,
  endTime: string,
  requirements: StaffingSlot["requirements"] = [],
): StaffingSlot => ({
  key: { kind: "time", startTime, endTime },
  requirements,
});

describe("countStaffingByTimeSlots", () => {
  it("時間帯ごとに、ポジション別の人数、必要人数、不足を返す", () => {
    const result = countStaffingByTimeSlots({
      shifts: [
        shift("a", [segment("10:00", "18:00", HALL)]),
        shift("b", [segment("10:00", "14:00", HALL)]),
        shift("c", [segment("10:00", "18:00", KITCHEN)]),
      ],
      positionIds,
      slots: [
        timeSlot("10:00", "14:00", [
          { positionId: HALL, count: 2 },
          { positionId: KITCHEN, count: 1 },
        ]),
        timeSlot("14:00", "18:00", [
          { positionId: HALL, count: 2 },
          { positionId: KITCHEN, count: 3 },
        ]),
      ],
    });

    expect(result).toEqual([
      {
        key: { kind: "time", startTime: "10:00", endTime: "14:00" },
        total: 3,
        positions: [
          { positionId: HALL, count: 2, required: 2, shortage: 0 },
          { positionId: KITCHEN, count: 1, required: 1, shortage: 0 },
        ],
        hasShortage: false,
      },
      {
        key: { kind: "time", startTime: "14:00", endTime: "18:00" },
        total: 2,
        positions: [
          { positionId: HALL, count: 1, required: 2, shortage: 1 },
          { positionId: KITCHEN, count: 1, required: 3, shortage: 2 },
        ],
        hasShortage: true,
      },
    ]);
  });

  it("時間帯の途中から入る人は数えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("through", [segment("10:00", "14:00", HALL)]), shift("late", [segment("10:30", "14:00", HALL)])],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(1);
    expect(result.positions.map((position) => [position.positionId, position.count])).toEqual([
      [HALL, 1],
      [KITCHEN, 0],
    ]);
  });

  it("時間帯の途中で抜ける人は数えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [
        shift("through", [segment("10:00", "14:00", HALL)]),
        shift("early", [segment("10:00", "13:30", KITCHEN)]),
      ],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(1);
    expect(result.positions.map((position) => [position.positionId, position.count])).toEqual([
      [HALL, 1],
      [KITCHEN, 0],
    ]);
  });

  it("人の出入りがある時間帯は、最も少ない時点の人数にする", () => {
    // 10:00と13:00の時点が最も少なく、2人になる。11:00〜13:00は3人いるが、その人数では数えない。
    const [result] = countStaffingByTimeSlots({
      shifts: [
        shift("through", [segment("10:00", "14:00", HALL)]),
        shift("late", [segment("11:00", "14:00", HALL)]),
        shift("early", [segment("10:00", "13:00", KITCHEN)]),
      ],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(2);
    expect(result.positions.map((position) => [position.positionId, position.count])).toEqual([
      [HALL, 1],
      [KITCHEN, 0],
    ]);
  });

  it("入れ替わりで常に1人いても、通していられる人がいないポジションは0人にする", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [
        shift("first", [segment("10:00", "12:00", HALL)]),
        shift("second", [segment("12:00", "14:00", KITCHEN)]),
      ],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(1);
    expect(result.positions.map((position) => position.count)).toEqual([0, 0]);
  });

  it("時間帯の終わりちょうどに終わる勤務と、始まりちょうどに始まる勤務は数える", () => {
    const result = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "14:00", HALL)]), shift("b", [segment("14:00", "18:00", HALL)])],
      positionIds,
      slots: [timeSlot("10:00", "14:00"), timeSlot("14:00", "18:00")],
    });

    expect(result.map((slot) => slot.total)).toEqual([1, 1]);
  });

  it("休憩と重なる時間帯ではその人を数えず、重ならない時間帯では数える", () => {
    const shifts = [shift("a", [segment("10:00", "18:00", HALL)], [{ start: "12:00", end: "13:00" }])];
    const result = countStaffingByTimeSlots({
      shifts,
      positionIds,
      slots: [timeSlot("10:00", "12:00"), timeSlot("12:00", "14:00"), timeSlot("14:00", "18:00")],
    });

    expect(result.map((slot) => [slot.total, slot.positions[0].count])).toEqual([
      [1, 1],
      [0, 0],
      [1, 1],
    ]);
  });

  it("時間帯の一部だけが15分の休憩と重なる場合も、その人を数えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "18:00", HALL)], [{ start: "13:45", end: "14:00" }])],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(0);
  });

  it("15分に満たない休憩が時間帯の途中にある場合も、その人を数えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("09:00", "10:00", HALL)], [{ start: "09:05", end: "09:10" }])],
      positionIds,
      slots: [timeSlot("09:00", "10:00", [{ positionId: HALL, count: 1 }])],
    });

    expect(result.total).toBe(0);
    expect(result.positions.filter((position) => position.positionId === HALL)).toEqual([
      { positionId: HALL, count: 0, required: 1, shortage: 1 },
    ]);
    expect(result.hasShortage).toBe(true);
  });

  it("15分刻みに乗らない時刻で入れ替わる場合も、誰もいない時間があれば0人にする", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("09:00", "09:20", HALL)]), shift("b", [segment("09:25", "10:00", HALL)])],
      positionIds,
      slots: [timeSlot("09:00", "10:00")],
    });

    expect(result.total).toBe(0);
  });

  it("勤務の外にある休憩では人数を変えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "14:00", HALL)], [{ start: "14:00", end: "15:00" }])],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(1);
  });

  it("必要人数が未設定のポジションは、必要人数なし・不足0で返す", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [],
      positionIds,
      slots: [timeSlot("10:00", "14:00", [{ positionId: HALL, count: 1 }])],
    });

    expect(result).toEqual({
      key: { kind: "time", startTime: "10:00", endTime: "14:00" },
      total: 0,
      positions: [
        { positionId: HALL, count: 0, required: 1, shortage: 1 },
        { positionId: KITCHEN, count: 0, required: null, shortage: 0 },
      ],
      hasShortage: true,
    });
  });

  it("必要人数より多い場合と、必要人数が0の場合は不足にしない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "14:00", HALL)]), shift("b", [segment("10:00", "14:00", HALL)])],
      positionIds,
      slots: [
        timeSlot("10:00", "14:00", [
          { positionId: HALL, count: 1 },
          { positionId: KITCHEN, count: 0 },
        ]),
      ],
    });

    expect(result.positions).toEqual([
      { positionId: HALL, count: 2, required: 1, shortage: 0 },
      { positionId: KITCHEN, count: 0, required: 0, shortage: 0 },
    ]);
    expect(result.hasShortage).toBe(false);
  });

  it("人数を出すポジションに含まれない勤務は、全体の人数にだけ数える", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "14:00", "removed-position")])],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(1);
    expect(result.positions.map((position) => position.count)).toEqual([0, 0]);
  });

  it("休憩のポジションの区間にいる人は数えない", () => {
    const [result] = countStaffingByTimeSlots({
      shifts: [shift("a", [segment("10:00", "14:00", BREAK_POSITION.id)])],
      positionIds,
      slots: [timeSlot("10:00", "14:00")],
    });

    expect(result.total).toBe(0);
  });

  it("時間帯ではない区切りは結果に含めない", () => {
    const result = countStaffingByTimeSlots({
      shifts: [],
      positionIds,
      slots: [
        { key: { kind: "allDay" }, requirements: [] },
        { key: { kind: "shiftType", optionId: "early" }, requirements: [] },
        timeSlot("10:00", "14:00"),
      ],
    });

    expect(result.map((slot) => slot.key)).toEqual([{ kind: "time", startTime: "10:00", endTime: "14:00" }]);
  });
});

describe("countStaffingByHour", () => {
  it("1時間ごとに人数を数え、必要人数は付けない", () => {
    const result = countStaffingByHour({
      shifts: [shift("a", [segment("09:00", "11:00", HALL)]), shift("b", [segment("10:00", "12:00", KITCHEN)])],
      positionIds,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
    });

    expect(result).toEqual([
      {
        key: { kind: "time", startTime: "09:00", endTime: "10:00" },
        total: 1,
        positions: [
          { positionId: HALL, count: 1, required: null, shortage: 0 },
          { positionId: KITCHEN, count: 0, required: null, shortage: 0 },
        ],
        hasShortage: false,
      },
      {
        key: { kind: "time", startTime: "10:00", endTime: "11:00" },
        total: 2,
        positions: [
          { positionId: HALL, count: 1, required: null, shortage: 0 },
          { positionId: KITCHEN, count: 1, required: null, shortage: 0 },
        ],
        hasShortage: false,
      },
      {
        key: { kind: "time", startTime: "11:00", endTime: "12:00" },
        total: 1,
        positions: [
          { positionId: HALL, count: 0, required: null, shortage: 0 },
          { positionId: KITCHEN, count: 1, required: null, shortage: 0 },
        ],
        hasShortage: false,
      },
    ]);
  });

  it("開始と終了が半端な時刻でも、端の区切りを受付時間の内側に収める", () => {
    const result = countStaffingByHour({
      shifts: [shift("a", [segment("09:30", "11:30", HALL)])],
      positionIds,
      startMinutes: 9 * 60 + 30,
      endMinutes: 11 * 60 + 30,
    });

    expect(result.map((slot) => [slot.key, slot.total])).toEqual([
      [{ kind: "time", startTime: "09:30", endTime: "10:00" }, 1],
      [{ kind: "time", startTime: "10:00", endTime: "11:00" }, 1],
      [{ kind: "time", startTime: "11:00", endTime: "11:30" }, 1],
    ]);
  });

  it("1時間の途中で出入りする人は、その1時間には数えない", () => {
    const result = countStaffingByHour({
      shifts: [shift("a", [segment("09:30", "11:30", HALL)])],
      positionIds,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
    });

    expect(result.map((slot) => slot.total)).toEqual([0, 1, 0]);
  });

  it("休憩と重なる1時間ではその人を数えない", () => {
    const result = countStaffingByHour({
      shifts: [shift("a", [segment("09:00", "12:00", HALL)], [{ start: "10:30", end: "11:00" }])],
      positionIds,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
    });

    expect(result.map((slot) => slot.total)).toEqual([1, 0, 1]);
  });

  it("24時を超える受付時間も1時間ごとに区切る", () => {
    const result = countStaffingByHour({
      shifts: [shift("a", [segment("23:00", "25:00", HALL)])],
      positionIds,
      startMinutes: 23 * 60,
      endMinutes: 25 * 60,
    });

    expect(result.map((slot) => [slot.key, slot.total])).toEqual([
      [{ kind: "time", startTime: "23:00", endTime: "24:00" }, 1],
      [{ kind: "time", startTime: "24:00", endTime: "25:00" }, 1],
    ]);
  });

  it("開始と終了が同じなら区切りを返さない", () => {
    expect(countStaffingByHour({ shifts: [], positionIds, startMinutes: 540, endMinutes: 540 })).toEqual([]);
  });
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
          { positionId: HALL, count: 1, required: 2, shortage: 1 },
          { positionId: KITCHEN, count: 1, required: 1, shortage: 0 },
        ],
        hasShortage: true,
      },
      {
        key: { kind: "shiftType", optionId: "late" },
        total: 1,
        positions: [
          { positionId: HALL, count: 0, required: null, shortage: 0 },
          { positionId: KITCHEN, count: 1, required: null, shortage: 0 },
        ],
        hasShortage: false,
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

  it("日の型がない日は、すべての勤務パターンを必要人数なしで返す", () => {
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
          { positionId: HALL, count: 0, required: null, shortage: 0 },
          { positionId: KITCHEN, count: 0, required: null, shortage: 0 },
        ],
        hasShortage: false,
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
        { positionId: HALL, count: 1, required: 3, shortage: 2 },
        { positionId: KITCHEN, count: 2, required: 2, shortage: 0 },
      ],
      hasShortage: true,
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

  it("日の型がない日は、必要人数なしで返す", () => {
    expect(countStaffingByDay({ shifts: [], positionIds, slots: [] })).toEqual({
      key: { kind: "allDay" },
      total: 0,
      positions: [
        { positionId: HALL, count: 0, required: null, shortage: 0 },
        { positionId: KITCHEN, count: 0, required: null, shortage: 0 },
      ],
      hasShortage: false,
    });
  });

  it("終日ではない区切りの必要人数は使わない", () => {
    const result = countStaffingByDay({
      shifts: [],
      positionIds,
      slots: [timeSlot("09:00", "22:00", [{ positionId: HALL, count: 2 }])],
    });

    expect(result.positions.map((position) => position.required)).toEqual([null, null]);
    expect(result.hasShortage).toBe(false);
  });
});
