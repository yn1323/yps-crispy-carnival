import { describe, expect, it } from "vitest";
import { buildPositionStaffingBands } from "./staffing";
import {
  buildFulfillmentSegments,
  calculateFulfillmentPercent,
  getStaffingBarsRange,
  resolveFulfillmentState,
} from "./staffingFulfillment";
import type { PositionSegment, ShiftData, StaffingBar } from "./types";

const HALL = "hall";
const KITCHEN = "kitchen";

const work = (start: string, end: string, positionId: string = HALL): PositionSegment => ({
  id: `seg-${positionId}-${start}-${end}`,
  positionId,
  positionName: positionId,
  color: "#3b82f6",
  start,
  end,
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

/** 同じ時間のバーを、必要な人数の本数だけ並べる。 */
const bars = (positionId: string, start: string, end: string, count = 1): StaffingBar[] =>
  Array.from({ length: count }, () => ({ positionId, start, end }));

const hours = (hour: number) => hour * 60;

const buildBands = (input: { shifts: ShiftData[]; bars: StaffingBar[]; positionIds?: string[] }) =>
  buildPositionStaffingBands({
    shifts: input.shifts,
    bars: input.bars,
    positionIds: input.positionIds ?? [HALL],
    startMinutes: hours(9),
    endMinutes: hours(21),
  });

/** 区間を「開始-終了 状態 差」の文字にする。 */
const describeSegments = (band: ReturnType<typeof buildBands>[number]) =>
  buildFulfillmentSegments(band.segments).map(
    (segment) => `${segment.start / 60}-${segment.end / 60} ${segment.state} ${segment.diff}`,
  );

describe("resolveFulfillmentState", () => {
  it.each([
    { count: 0, required: 2, state: "shortage" },
    { count: 1, required: 2, state: "shortage" },
    { count: 2, required: 2, state: "even" },
    { count: 3, required: 2, state: "excess" },
    { count: 1, required: 0, state: "excess" },
    { count: 0, required: 0, state: "unset" },
    { count: 0, required: null, state: "unset" },
    { count: 2, required: null, state: "unset" },
  ])("人数$count、必要$requiredは$state", ({ count, required, state }) => {
    expect(resolveFulfillmentState(count, required)).toBe(state);
  });
});

describe("buildFulfillmentSegments", () => {
  it("だれも入っていない日は、必要人数の区間ごとの不足になる", () => {
    const [band] = buildBands({
      shifts: [],
      bars: [...bars(HALL, "09:00", "13:00", 2), ...bars(HALL, "13:00", "21:00")],
    });

    expect(describeSegments(band)).toEqual(["9-13 shortage -2", "13-21 shortage -1"]);
  });

  it("人数と必要人数が変わっても、差が同じ隣どうしは1つにつなげる", () => {
    // 9〜12時は0/2、12〜15時は1/3で、どちらも2人不足。
    const [band] = buildBands({
      shifts: [shift("a", [work("12:00", "21:00")])],
      bars: [...bars(HALL, "09:00", "12:00", 2), ...bars(HALL, "12:00", "15:00", 3), ...bars(HALL, "15:00", "21:00")],
    });

    expect(describeSegments(band)).toEqual(["9-15 shortage -2", "15-21 even 0"]);
  });

  it("必要人数の区間の途中で勤務が切れると、その時刻で区切る", () => {
    const [band] = buildBands({
      shifts: [shift("a", [work("09:00", "11:30")])],
      bars: bars(HALL, "09:00", "13:00"),
    });

    expect(describeSegments(band)).toEqual(["9-11.5 even 0", "11.5-13 shortage -1", "13-21 unset 0"]);
  });

  it("休憩中の人は数えず、休憩の時間だけ不足にする", () => {
    const [band] = buildBands({
      shifts: [shift("a", [work("09:00", "21:00")], [{ start: "12:00", end: "13:00" }])],
      bars: bars(HALL, "09:00", "21:00"),
    });

    expect(describeSegments(band)).toEqual(["9-12 even 0", "12-13 shortage -1", "13-21 even 0"]);
  });

  it("必要人数のない時間は、だれもいなければ指定なし、人が入っていれば多いにする", () => {
    const [band] = buildBands({
      shifts: [shift("a", [work("09:00", "11:00")]), shift("b", [work("17:00", "19:00")])],
      bars: bars(HALL, "09:00", "11:00"),
    });

    expect(describeSegments(band)).toEqual(["9-11 even 0", "11-17 unset 0", "17-19 excess 1", "19-21 unset 0"]);
  });

  it("多い時間は、多い人数が違えば区切る", () => {
    const [band] = buildBands({
      shifts: [
        shift("a", [work("09:00", "15:00")]),
        shift("b", [work("09:00", "12:00")]),
        shift("c", [work("09:00", "12:00")]),
      ],
      bars: bars(HALL, "09:00", "21:00"),
    });

    expect(describeSegments(band)).toEqual(["9-12 excess 2", "12-15 even 0", "15-21 shortage -1"]);
  });
});

describe("calculateFulfillmentPercent", () => {
  it("だれも入っていない日は0%", () => {
    expect(calculateFulfillmentPercent(buildBands({ shifts: [], bars: bars(HALL, "09:00", "21:00", 2) }))).toBe(0);
  });

  it("すべての区間がちょうどの日は100%", () => {
    const bands = buildBands({
      shifts: [shift("a", [work("09:00", "21:00")]), shift("b", [work("09:00", "13:00")])],
      bars: [...bars(HALL, "09:00", "13:00", 2), ...bars(HALL, "13:00", "21:00")],
    });

    expect(calculateFulfillmentPercent(bands)).toBe(100);
  });

  it("多い時間で余った人数は、ほかの時間の不足に足さない", () => {
    // 9〜15時は3人（必要1人）、15〜21時は0人（必要1人）。必要12人時のうち、6人時だけを満たす。
    const bands = buildBands({
      shifts: ["a", "b", "c"].map((staffId) => shift(staffId, [work("09:00", "15:00")])),
      bars: bars(HALL, "09:00", "21:00"),
    });

    expect(calculateFulfillmentPercent(bands)).toBe(50);
  });

  it("必要人数のない時間の勤務は、分母にも分子にも入れない", () => {
    // 必要人数は9〜11時の1人だけ。17〜19時の勤務は数えない。
    const bands = buildBands({
      shifts: [shift("a", [work("09:00", "10:00")]), shift("b", [work("17:00", "19:00")])],
      bars: bars(HALL, "09:00", "11:00"),
    });

    expect(calculateFulfillmentPercent(bands)).toBe(50);
  });

  it("人数の違う区間は、人数と長さを掛けて合計する", () => {
    // 必要は 2人×4時間 + 1人×8時間 = 16人時。満たすのは 1人×4時間 + 1人×2時間 = 6人時。
    const bands = buildBands({
      shifts: [shift("a", [work("09:00", "15:00")])],
      bars: [...bars(HALL, "09:00", "13:00", 2), ...bars(HALL, "13:00", "21:00")],
    });

    expect(calculateFulfillmentPercent(bands)).toBe(37);
  });

  it("小数は切り捨て、少しでも足りない日は100%にしない", () => {
    // 必要12人時のうち、休憩の15分だけ足りない。
    const bands = buildBands({
      shifts: [shift("a", [work("09:00", "21:00")], [{ start: "12:00", end: "12:15" }])],
      bars: bars(HALL, "09:00", "21:00"),
    });

    expect(calculateFulfillmentPercent(bands)).toBe(97);
  });

  it("ポジションをまたいで合計し、必要人数を入れていないポジションは数えない", () => {
    // ホールは必要12人時を満たす。キッチンは必要人数がなく、勤務があっても数えない。
    const bands = buildBands({
      shifts: [shift("a", [work("09:00", "21:00")]), shift("b", [work("09:00", "21:00", KITCHEN)])],
      bars: bars(HALL, "09:00", "21:00"),
      positionIds: [HALL, KITCHEN],
    });

    expect(calculateFulfillmentPercent(bands)).toBe(100);
  });

  it("必要人数が1つもない日はnull", () => {
    expect(
      calculateFulfillmentPercent(buildBands({ shifts: [shift("a", [work("09:00", "21:00")])], bars: [] })),
    ).toBeNull();
  });
});

describe("getStaffingBarsRange", () => {
  const limit = { start: hours(9), end: hours(21) };

  it("最初の開始から最後の終了までを返す", () => {
    const range = getStaffingBarsRange([...bars(HALL, "11:00", "14:00"), ...bars(KITCHEN, "10:00", "20:00")], limit);

    expect(range).toEqual({ start: hours(10), end: hours(20) });
  });

  it("受付時間の外にかかる分は切り落とす", () => {
    expect(getStaffingBarsRange(bars(HALL, "07:00", "23:00"), limit)).toEqual(limit);
  });

  it("受付時間の中に必要人数がなければnull", () => {
    expect(getStaffingBarsRange(bars(HALL, "06:00", "09:00"), limit)).toBeNull();
    expect(getStaffingBarsRange([], limit)).toBeNull();
  });
});
