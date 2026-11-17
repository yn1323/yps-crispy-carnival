import { describe, expect, it } from "vitest";
import { SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT } from "@/convex/constants";
import {
  alignStaffingSegmentRange,
  barsToStaffingSegments,
  countSegmentsOutsideRange,
  DEFAULT_STAFFING_COUNT_LIMIT,
  getMaxStaffingCount,
  getStaffingCountAt,
  getStaffingCountRange,
  moveStaffingCount,
  normalizeStaffingSegments,
  type StaffingSegment,
  setStaffingCount,
  splitRangeByStaffingCount,
  staffingSegmentsToBars,
  trimSegmentsToRange,
  validateStaffingSegments,
} from "./staffingSegments";
import { timeToMinutes } from "./time";
import type { StaffingBar } from "./types";

const seg = (positionId: string, startTime: string, endTime: string, count: number): StaffingSegment => ({
  positionId,
  startTime,
  endTime,
  count,
});

const bar = (positionId: string, start: string, end: string): StaffingBar => ({ positionId, start, end });

const RANGE = { startMinutes: 9 * 60, endMinutes: 22 * 60 };

const set = (segments: readonly StaffingSegment[], positionId: string, start: string, end: string, count: number) =>
  setStaffingCount({
    segments,
    positionId,
    startMinutes: timeToMinutes(start),
    endMinutes: timeToMinutes(end),
    count,
  });

describe("normalizeStaffingSegments", () => {
  it("ポジションIDの順、開始の早い順に並べる", () => {
    expect(
      normalizeStaffingSegments([
        seg("kitchen", "17:00", "21:00", 2),
        seg("hall", "17:00", "22:00", 3),
        seg("kitchen", "09:00", "11:00", 1),
        seg("hall", "09:00", "11:00", 1),
      ]),
    ).toEqual([
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "17:00", "22:00", 3),
      seg("kitchen", "09:00", "11:00", 1),
      seg("kitchen", "17:00", "21:00", 2),
    ]);
  });

  it("同じ人数で端が接した区間を1つにまとめる", () => {
    expect(
      normalizeStaffingSegments([
        seg("hall", "11:00", "14:00", 2),
        seg("hall", "09:00", "11:00", 2),
        seg("hall", "14:00", "15:00", 2),
      ]),
    ).toEqual([seg("hall", "09:00", "15:00", 2)]);
  });

  it("人数が違う区間と、間が空いた区間はまとめない", () => {
    const segments = [
      seg("hall", "09:00", "11:00", 2),
      seg("hall", "11:00", "14:00", 3),
      seg("hall", "14:30", "16:00", 3),
    ];
    expect(normalizeStaffingSegments(segments)).toEqual(segments);
  });

  it("別のポジションの区間はまとめない", () => {
    const segments = [seg("hall", "09:00", "11:00", 2), seg("kitchen", "11:00", "14:00", 2)];
    expect(normalizeStaffingSegments(segments)).toEqual(segments);
  });

  it("人数が0以下の区間と、長さのない区間を捨てる", () => {
    expect(
      normalizeStaffingSegments([
        seg("hall", "09:00", "11:00", 0),
        seg("hall", "11:00", "12:00", -1),
        seg("hall", "13:00", "13:00", 2),
        seg("hall", "15:00", "14:00", 2),
        seg("hall", "16:00", "17:00", 1),
      ]),
    ).toEqual([seg("hall", "16:00", "17:00", 1)]);
  });

  it("重なった区間は、配列のあとにある区間の人数にする", () => {
    expect(normalizeStaffingSegments([seg("hall", "09:00", "14:00", 1), seg("hall", "11:00", "12:00", 3)])).toEqual([
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "12:00", 3),
      seg("hall", "12:00", "14:00", 1),
    ]);
  });

  it("空の配列は空のまま返す", () => {
    expect(normalizeStaffingSegments([])).toEqual([]);
  });
});

describe("setStaffingCount", () => {
  it("空のポジションに、選んだ範囲の人数を入れる", () => {
    expect(set([], "hall", "11:00", "14:00", 3)).toEqual([seg("hall", "11:00", "14:00", 3)]);
  });

  it("範囲にかかる区間を、前と後ろに残して置き換える", () => {
    expect(set([seg("hall", "09:00", "22:00", 1)], "hall", "11:00", "14:00", 3)).toEqual([
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "14:00", 3),
      seg("hall", "14:00", "22:00", 1),
    ]);
  });

  it("範囲の中にあった人数は残さず、選んだ人数だけにする", () => {
    expect(
      set(
        [seg("hall", "09:00", "11:00", 1), seg("hall", "11:00", "14:00", 3), seg("hall", "14:00", "17:00", 2)],
        "hall",
        "10:00",
        "15:00",
        4,
      ),
    ).toEqual([seg("hall", "09:00", "10:00", 1), seg("hall", "10:00", "15:00", 4), seg("hall", "15:00", "17:00", 2)]);
  });

  it("隣と同じ人数になったら、1つの区間にまとめる", () => {
    expect(
      set([seg("hall", "09:00", "11:00", 2), seg("hall", "14:00", "17:00", 2)], "hall", "11:00", "14:00", 2),
    ).toEqual([seg("hall", "09:00", "17:00", 2)]);
  });

  it("人数を0にすると、その範囲だけを空にする", () => {
    expect(set([seg("hall", "09:00", "22:00", 2)], "hall", "11:00", "14:00", 0)).toEqual([
      seg("hall", "09:00", "11:00", 2),
      seg("hall", "14:00", "22:00", 2),
    ]);
  });

  it("区間の全体を0にすると、区間がなくなる", () => {
    expect(set([seg("hall", "11:00", "14:00", 2)], "hall", "11:00", "14:00", 0)).toEqual([]);
  });

  it("範囲の端が区間の端とちょうど重なる場合、隣の区間を変えない", () => {
    expect(
      set([seg("hall", "09:00", "11:00", 1), seg("hall", "14:00", "17:00", 2)], "hall", "11:00", "14:00", 3),
    ).toEqual([seg("hall", "09:00", "11:00", 1), seg("hall", "11:00", "14:00", 3), seg("hall", "14:00", "17:00", 2)]);
  });

  it("ほかのポジションの区間は変えない", () => {
    expect(set([seg("kitchen", "09:00", "22:00", 1)], "hall", "11:00", "14:00", 2)).toEqual([
      seg("hall", "11:00", "14:00", 2),
      seg("kitchen", "09:00", "22:00", 1),
    ]);
  });

  it("消してから入れ直しても、同じ配列に戻る", () => {
    const before = [seg("hall", "11:00", "14:00", 2), seg("kitchen", "09:00", "22:00", 1)];
    const cleared = set(before, "hall", "11:00", "14:00", 0);
    expect(set(cleared, "hall", "11:00", "14:00", 2)).toEqual(before);
  });

  it("長さのない範囲では、人数を変えない", () => {
    const before = [seg("hall", "11:00", "14:00", 2)];
    expect(set(before, "hall", "12:00", "12:00", 5)).toEqual(before);
    expect(set(before, "hall", "13:00", "12:00", 5)).toEqual(before);
  });

  it("24時をまたぐ範囲にも人数を入れられる", () => {
    expect(set([], "hall", "22:00", "26:00", 2)).toEqual([seg("hall", "22:00", "26:00", 2)]);
  });
});

describe("moveStaffingCount", () => {
  const base = [seg("hall", "09:00", "12:30", 1), seg("hall", "12:30", "15:30", 3), seg("hall", "15:30", "22:00", 1)];
  const range = (start: string, end: string) => ({
    startMinutes: timeToMinutes(start),
    endMinutes: timeToMinutes(end),
  });
  const move = (to: { startMinutes: number; endMinutes: number }, segments: readonly StaffingSegment[] = base) =>
    moveStaffingCount({ segments, positionId: "hall", from: range("12:30", "15:30"), to, count: 3 });

  it("終了を前へ縮めると、外れた時間は人数なしになる", () => {
    expect(move(range("12:30", "14:00"))).toEqual([
      seg("hall", "09:00", "12:30", 1),
      seg("hall", "12:30", "14:00", 3),
      seg("hall", "15:30", "22:00", 1),
    ]);
  });

  it("終了を後ろへ伸ばすと、隣の区間に重なった分を、その人数で置き換える", () => {
    expect(move(range("12:30", "17:00"))).toEqual([
      seg("hall", "09:00", "12:30", 1),
      seg("hall", "12:30", "17:00", 3),
      seg("hall", "17:00", "22:00", 1),
    ]);
  });

  it("開始を前へ伸ばすと、前の区間に重なった分を置き換え、開始を後ろへ縮めると、外れた時間は人数なしになる", () => {
    expect(move(range("11:00", "15:30"))).toEqual([
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "15:30", 3),
      seg("hall", "15:30", "22:00", 1),
    ]);
    expect(move(range("14:00", "15:30"))).toEqual([
      seg("hall", "09:00", "12:30", 1),
      seg("hall", "14:00", "15:30", 3),
      seg("hall", "15:30", "22:00", 1),
    ]);
  });

  it("元の時間帯と重ならない時間帯へ移すと、元の時間帯は人数なしになる", () => {
    expect(move(range("18:00", "19:00"))).toEqual([
      seg("hall", "09:00", "12:30", 1),
      seg("hall", "15:30", "18:00", 1),
      seg("hall", "18:00", "19:00", 3),
      seg("hall", "19:00", "22:00", 1),
    ]);
  });

  it("同じ時間帯へ置き換えても、人数は変わらない", () => {
    expect(move(range("12:30", "15:30"))).toEqual(base);
  });

  it("伸ばした先が同じ人数の区間に接すると、1つの区間にまとまる", () => {
    const segments = [seg("hall", "12:30", "15:30", 3), seg("hall", "17:00", "22:00", 3)];
    expect(move(range("12:30", "17:00"), segments)).toEqual([seg("hall", "12:30", "22:00", 3)]);
  });

  it("ほかのポジションの人数は変えない", () => {
    const segments = [...base, seg("kitchen", "12:00", "16:00", 2)];
    expect(move(range("12:30", "17:00"), segments).filter((segment) => segment.positionId === "kitchen")).toEqual([
      seg("kitchen", "12:00", "16:00", 2),
    ]);
  });
});

describe("splitRangeByStaffingCount", () => {
  it("人数の入っていない時間を、0人の区間として埋める", () => {
    expect(
      splitRangeByStaffingCount({
        segments: [seg("hall", "11:00", "14:00", 3), seg("hall", "14:00", "17:00", 1)],
        positionId: "hall",
        range: RANGE,
      }),
    ).toEqual([
      { startMinutes: 540, endMinutes: 660, count: 0 },
      { startMinutes: 660, endMinutes: 840, count: 3 },
      { startMinutes: 840, endMinutes: 1020, count: 1 },
      { startMinutes: 1020, endMinutes: 1320, count: 0 },
    ]);
  });

  it("区間のないポジションは、範囲の全体を0人の1区間にする", () => {
    expect(splitRangeByStaffingCount({ segments: [], positionId: "hall", range: RANGE })).toEqual([
      { startMinutes: 540, endMinutes: 1320, count: 0 },
    ]);
  });

  it("範囲の端から端まで人数が入っていれば、0人の区間を作らない", () => {
    expect(
      splitRangeByStaffingCount({ segments: [seg("hall", "09:00", "22:00", 2)], positionId: "hall", range: RANGE }),
    ).toEqual([{ startMinutes: 540, endMinutes: 1320, count: 2 }]);
  });

  it("範囲の外にかかる区間は、内側だけを返す", () => {
    expect(
      splitRangeByStaffingCount({
        segments: [
          seg("hall", "07:00", "10:00", 2),
          seg("hall", "21:00", "23:00", 1),
          seg("hall", "23:00", "24:00", 4),
        ],
        positionId: "hall",
        range: RANGE,
      }),
    ).toEqual([
      { startMinutes: 540, endMinutes: 600, count: 2 },
      { startMinutes: 600, endMinutes: 1260, count: 0 },
      { startMinutes: 1260, endMinutes: 1320, count: 1 },
    ]);
  });

  it("長さのない範囲では、空の配列を返す", () => {
    expect(
      splitRangeByStaffingCount({
        segments: [seg("hall", "09:00", "22:00", 2)],
        positionId: "hall",
        range: { startMinutes: 600, endMinutes: 600 },
      }),
    ).toEqual([]);
  });
});

describe("getStaffingCountAt", () => {
  const segments = [seg("hall", "11:00", "14:00", 3), seg("kitchen", "09:00", "22:00", 1)];

  it("区間の開始ちょうどは区間に含め、終了ちょうどは含めない", () => {
    expect(getStaffingCountAt(segments, "hall", timeToMinutes("10:59"))).toBe(0);
    expect(getStaffingCountAt(segments, "hall", timeToMinutes("11:00"))).toBe(3);
    expect(getStaffingCountAt(segments, "hall", timeToMinutes("13:59"))).toBe(3);
    expect(getStaffingCountAt(segments, "hall", timeToMinutes("14:00"))).toBe(0);
  });

  it("区間のないポジションは0人を返す", () => {
    expect(getStaffingCountAt(segments, "register", timeToMinutes("12:00"))).toBe(0);
  });
});

describe("getMaxStaffingCount", () => {
  it("そのポジションの、いちばん多い人数を返す", () => {
    const segments = [
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "14:00", 4),
      seg("kitchen", "09:00", "22:00", 7),
    ];
    expect(getMaxStaffingCount(segments, "hall")).toBe(4);
  });

  it("区間がなければ0を返す", () => {
    expect(getMaxStaffingCount([], "hall")).toBe(0);
  });
});

describe("getStaffingCountRange", () => {
  const segments = [seg("hall", "09:00", "11:00", 1), seg("hall", "11:00", "14:00", 3)];
  const range = (start: string, end: string) =>
    getStaffingCountRange({
      segments,
      positionId: "hall",
      startMinutes: timeToMinutes(start),
      endMinutes: timeToMinutes(end),
    });

  it("1つの区間の内側では、最小と最大が同じになる", () => {
    expect(range("11:00", "14:00")).toEqual({ min: 3, max: 3 });
  });

  it("人数の違う区間にまたがると、最小と最大を返す", () => {
    expect(range("10:00", "12:00")).toEqual({ min: 1, max: 3 });
  });

  it("人数の入っていない時間を含むと、最小が0になる", () => {
    expect(range("13:00", "15:00")).toEqual({ min: 0, max: 3 });
    expect(range("15:00", "16:00")).toEqual({ min: 0, max: 0 });
  });

  it("長さのない範囲ではnullを返す", () => {
    expect(range("12:00", "12:00")).toBeNull();
  });
});

describe("barsToStaffingSegments", () => {
  it("重なったバーの本数を、その時間の人数にする", () => {
    expect(
      barsToStaffingSegments([
        bar("hall", "09:00", "22:00"),
        bar("hall", "11:00", "14:00"),
        bar("hall", "11:00", "14:00"),
        bar("kitchen", "18:00", "21:00"),
      ]),
    ).toEqual([
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "14:00", 3),
      seg("hall", "14:00", "22:00", 1),
      seg("kitchen", "18:00", "21:00", 1),
    ]);
  });

  it("端が接したバーは、同じ人数の1つの区間にまとめる", () => {
    expect(barsToStaffingSegments([bar("hall", "09:00", "11:00"), bar("hall", "11:00", "14:00")])).toEqual([
      seg("hall", "09:00", "14:00", 1),
    ]);
  });

  it("バーがなければ空の配列を返す", () => {
    expect(barsToStaffingSegments([])).toEqual([]);
  });

  it("バーの並びが違っても、同じ区間になる", () => {
    const bars = [bar("kitchen", "18:00", "21:00"), bar("hall", "11:00", "14:00"), bar("hall", "09:00", "22:00")];
    expect(barsToStaffingSegments(bars)).toEqual(barsToStaffingSegments(bars.toReversed()));
  });
});

describe("staffingSegmentsToBars", () => {
  it("人数の段を、下の層から連続した区間のバーへ分ける", () => {
    expect(
      staffingSegmentsToBars([
        seg("hall", "09:00", "11:00", 1),
        seg("hall", "11:00", "14:00", 3),
        seg("hall", "14:00", "17:00", 1),
        seg("hall", "17:00", "22:00", 2),
      ]),
    ).toEqual([
      bar("hall", "09:00", "22:00"),
      bar("hall", "11:00", "14:00"),
      bar("hall", "17:00", "22:00"),
      bar("hall", "11:00", "14:00"),
    ]);
  });

  it("間が空いた区間は、同じ層でも別のバーにする", () => {
    expect(staffingSegmentsToBars([seg("hall", "09:00", "11:00", 1), seg("hall", "14:00", "17:00", 1)])).toEqual([
      bar("hall", "09:00", "11:00"),
      bar("hall", "14:00", "17:00"),
    ]);
  });

  it("区間がなければ空の配列を返す", () => {
    expect(staffingSegmentsToBars([])).toEqual([]);
  });

  it("バーへ変えて区間へ戻すと、正規化した元の区間になる", () => {
    const segments = [
      seg("kitchen", "18:00", "21:00", 2),
      seg("hall", "09:00", "11:00", 1),
      seg("hall", "11:00", "14:00", 3),
      seg("hall", "14:00", "14:30", 1),
      seg("hall", "16:00", "18:00", 10),
      seg("hall", "18:00", "26:00", 4),
      seg("kitchen", "09:00", "12:00", 2),
    ];
    expect(barsToStaffingSegments(staffingSegmentsToBars(segments))).toEqual(normalizeStaffingSegments(segments));
  });

  it("同じ時間に重ねるバーは、人数の分だけ並ぶ", () => {
    expect(staffingSegmentsToBars([seg("hall", "11:00", "14:00", 3)])).toEqual([
      bar("hall", "11:00", "14:00"),
      bar("hall", "11:00", "14:00"),
      bar("hall", "11:00", "14:00"),
    ]);
  });

  it("バーの置き方が違っても、時間ごとの人数が同じなら、同じバーの並びへそろう", () => {
    // どちらも 09:00〜11:00 が1人、11:00〜14:00 が2人、14:00〜18:00 が1人。
    const stacked = [bar("hall", "09:00", "18:00"), bar("hall", "11:00", "14:00")];
    const staggered = [bar("hall", "11:00", "18:00"), bar("hall", "09:00", "14:00")];
    expect(staffingSegmentsToBars(barsToStaffingSegments(staggered))).toEqual(
      staffingSegmentsToBars(barsToStaffingSegments(stacked)),
    );
  });
});

describe("alignStaffingSegmentRange", () => {
  it("刻みに乗らない両端を、内側の刻みへ寄せる", () => {
    expect(alignStaffingSegmentRange({ startMinutes: 9 * 60 + 15, endMinutes: 20 * 60 + 45 }, 30)).toEqual({
      startMinutes: 9 * 60 + 30,
      endMinutes: 20 * 60 + 30,
    });
  });

  it("刻みに乗っている範囲は変えない", () => {
    expect(alignStaffingSegmentRange({ startMinutes: 540, endMinutes: 1320 }, 30)).toEqual({
      startMinutes: 540,
      endMinutes: 1320,
    });
  });
});

describe("countSegmentsOutsideRange", () => {
  it("完全に外の区間と、範囲の端をまたぐ区間を数える", () => {
    expect(
      countSegmentsOutsideRange(
        [
          seg("hall", "07:00", "08:00", 1),
          seg("hall", "08:00", "10:00", 2),
          seg("hall", "10:00", "22:00", 1),
          seg("kitchen", "21:00", "23:00", 1),
        ],
        RANGE,
      ),
    ).toBe(3);
  });

  it("範囲の端にちょうど接する区間は、外に数えない", () => {
    expect(countSegmentsOutsideRange([seg("hall", "09:00", "22:00", 1)], RANGE)).toBe(0);
  });
});

describe("trimSegmentsToRange", () => {
  it("完全に外の区間を消し、端をまたぐ区間を内側へ切る", () => {
    expect(
      trimSegmentsToRange({
        segments: [
          seg("hall", "07:00", "08:00", 1),
          seg("hall", "08:00", "10:00", 2),
          seg("hall", "10:00", "22:00", 1),
          seg("kitchen", "21:00", "23:00", 1),
        ],
        range: RANGE,
        unitMinutes: 30,
      }),
    ).toEqual([
      seg("hall", "09:00", "10:00", 2),
      seg("hall", "10:00", "22:00", 1),
      seg("kitchen", "21:00", "22:00", 1),
    ]);
  });

  it("範囲の内側にある区間は変えない", () => {
    const segments = [seg("hall", "09:00", "22:00", 2)];
    expect(trimSegmentsToRange({ segments, range: RANGE, unitMinutes: 30 })).toEqual(segments);
  });

  it("刻みに乗らない受付時間では、刻みに乗る内側の時刻へ切る", () => {
    expect(
      trimSegmentsToRange({
        segments: [seg("hall", "09:00", "21:00", 2)],
        range: { startMinutes: 9 * 60 + 15, endMinutes: 20 * 60 + 45 },
        unitMinutes: 30,
      }),
    ).toEqual([seg("hall", "09:30", "20:30", 2)]);
  });

  it("切ったあとの長さが刻みに届かない区間を消す", () => {
    expect(
      trimSegmentsToRange({
        segments: [seg("hall", "08:00", "09:15", 2), seg("hall", "12:00", "13:00", 1)],
        range: RANGE,
        unitMinutes: 30,
      }),
    ).toEqual([seg("hall", "12:00", "13:00", 1)]);
  });

  it("切りそろえたあとは、範囲の外の区間が0件になる", () => {
    const trimmed = trimSegmentsToRange({
      segments: [seg("hall", "07:00", "12:00", 1), seg("hall", "20:00", "24:00", 3)],
      range: RANGE,
      unitMinutes: 30,
    });
    expect(countSegmentsOutsideRange(trimmed, RANGE)).toBe(0);
  });
});

describe("validateStaffingSegments", () => {
  const validate = (segments: readonly StaffingSegment[], maxCount?: number) =>
    validateStaffingSegments({ segments, range: RANGE, maxCount });

  it("刻みに乗り、範囲の内側で、重ならず、人数が上限以下なら受け付ける", () => {
    expect(
      validate([
        seg("hall", "09:00", "11:00", 1),
        seg("hall", "11:00", "22:00", 10),
        seg("kitchen", "09:00", "09:30", 1),
      ]),
    ).toEqual({ ok: true });
  });

  it("空の配列を受け付ける", () => {
    expect(validate([])).toEqual({ ok: true });
  });

  it("人数の既定の上限は、Convexが受け付ける上限と同じである", () => {
    expect(DEFAULT_STAFFING_COUNT_LIMIT).toBe(SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT);
  });

  it("人数が上限を超える区間、1未満の区間、整数でない区間を受け付けない", () => {
    expect(validate([seg("hall", "09:00", "11:00", DEFAULT_STAFFING_COUNT_LIMIT)])).toEqual({ ok: true });
    expect(validate([seg("hall", "09:00", "11:00", DEFAULT_STAFFING_COUNT_LIMIT + 1)])).toEqual({
      ok: false,
      reason: "INVALID_COUNT",
    });
    expect(validate([seg("hall", "09:00", "11:00", 0)])).toEqual({ ok: false, reason: "INVALID_COUNT" });
    expect(validate([seg("hall", "09:00", "11:00", 1.5)])).toEqual({ ok: false, reason: "INVALID_COUNT" });
  });

  it("人数の上限を引数で変えられる", () => {
    expect(validate([seg("hall", "09:00", "11:00", 11)], 11)).toEqual({ ok: true });
    expect(validate([seg("hall", "09:00", "11:00", 4)], 3)).toEqual({ ok: false, reason: "INVALID_COUNT" });
  });

  it("刻みに乗らない時刻を受け付けない", () => {
    expect(validate([seg("hall", "09:15", "11:15", 1)])).toEqual({ ok: false, reason: "NOT_ON_UNIT" });
    expect(validate([seg("hall", "09:00", "11:45", 1)])).toEqual({ ok: false, reason: "NOT_ON_UNIT" });
  });

  it("刻みを引数で変えられる", () => {
    expect(
      validateStaffingSegments({ segments: [seg("hall", "09:15", "11:15", 1)], range: RANGE, unitMinutes: 15 }),
    ).toEqual({ ok: true });
  });

  it("長さが刻みに届かない区間と、終了が開始より前の区間を受け付けない", () => {
    expect(validate([seg("hall", "09:00", "09:00", 1)])).toEqual({ ok: false, reason: "TOO_SHORT" });
    expect(validate([seg("hall", "11:00", "09:00", 1)])).toEqual({ ok: false, reason: "TOO_SHORT" });
  });

  it("範囲の外にかかる区間を受け付けない", () => {
    expect(validate([seg("hall", "08:30", "11:00", 1)])).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
    expect(validate([seg("hall", "21:00", "22:30", 1)])).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });

  it("同じポジションで重なる区間を受け付けない", () => {
    expect(validate([seg("hall", "09:00", "12:00", 1), seg("hall", "11:30", "14:00", 2)])).toEqual({
      ok: false,
      reason: "OVERLAP",
    });
  });

  it("別のポジションの区間は、同じ時間でも重なりに数えない", () => {
    expect(validate([seg("hall", "09:00", "12:00", 1), seg("kitchen", "09:00", "12:00", 2)])).toEqual({ ok: true });
  });
});
