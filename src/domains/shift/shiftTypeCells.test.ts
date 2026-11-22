import { describe, expect, it } from "vitest";
import { buildShiftTypeCells, isShiftTypeRestRequestWithoutWork } from "./shiftTypeCells";
import type { PositionSegment, ShiftData, StaffPositionSkill } from "./types";

const EARLY = { id: "early", name: "早番", startTime: "09:00", endTime: "15:00" };
const LATE = { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00" };
// 日をまたぐ勤務パターンは、終了を24時より後の時刻で持つ。
const NIGHT = { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00" };
const MIDNIGHT = { id: "midnight", name: "深夜", startTime: "23:00", endTime: "29:00" };
const options = [EARLY, LATE, NIGHT];

const segment = (option: typeof EARLY, positionId = "hall"): PositionSegment => ({
  id: `seg-${option.id}`,
  positionId,
  positionName: positionId,
  color: "#60a5fa",
  start: option.startTime,
  end: option.endTime,
  shiftTypeOptionId: option.id,
});

const shift = (requested: string[], assigned: PositionSegment[]): ShiftData => ({
  id: "shift-1",
  staffId: "staff-1",
  staffName: "田中 太郎",
  date: "2026-12-16",
  requestedTime: null,
  requestedShiftTypeOptionIds: requested,
  positions: assigned,
});

const submitted = { isSubmitted: true };
const summarize = (cells: ReturnType<typeof buildShiftTypeCells>) =>
  cells.map(({ option, isRequested, segment: assigned, notices, dot }) => ({
    option: option.id,
    isRequested,
    position: assigned?.positionId ?? null,
    notices,
    dot,
  }));

describe("buildShiftTypeCells", () => {
  it("希望と割り当てを勤務パターンの並びで返し、希望どおりの割り当てには理由を付けない", () => {
    const cells = buildShiftTypeCells({ shift: shift(["early", "late"], [segment(EARLY)]), staff: submitted, options });

    expect(summarize(cells)).toEqual([
      { option: "early", isRequested: true, position: "hall", notices: [], dot: null },
      { option: "late", isRequested: true, position: null, notices: [], dot: null },
      { option: "night", isRequested: false, position: null, notices: [], dot: null },
    ]);
  });

  it("希望していない勤務パターンへの割り当てに、希望外の理由と橙の点を付ける", () => {
    const cells = buildShiftTypeCells({ shift: shift(["late"], [segment(EARLY)]), staff: submitted, options });

    expect(summarize(cells)[0]).toEqual({
      option: "early",
      isRequested: false,
      position: "hall",
      notices: [{ kind: "unrequested" }],
      dot: "orange",
    });
  });

  it("休み希望の人への割り当ては、希望外として扱う", () => {
    const cells = buildShiftTypeCells({ shift: shift([], [segment(LATE)]), staff: submitted, options });

    expect(summarize(cells).map(({ notices, dot }) => ({ notices, dot }))).toEqual([
      { notices: [], dot: null },
      { notices: [{ kind: "unrequested" }], dot: "orange" },
      { notices: [], dot: null },
    ]);
  });

  it("未提出の人は希望を持たず、割り当てには未提出の理由を付ける", () => {
    // 未提出のまま希望のデータが残っていても、希望として出さない。
    const cells = buildShiftTypeCells({
      shift: shift(["early"], [segment(EARLY)]),
      staff: { isSubmitted: false },
      options,
    });

    expect(summarize(cells)[0]).toEqual({
      option: "early",
      isRequested: false,
      position: "hall",
      notices: [{ kind: "notSubmitted" }],
      dot: "orange",
    });
  });

  it("担当外のポジションへの割り当ては、希望どおりでも理由を付け、希望外と重なる場合は両方を並べる", () => {
    const positionSkills: StaffPositionSkill[] = [{ positionId: "kitchen", level: "unavailable" }];
    const cells = buildShiftTypeCells({
      shift: shift(["early"], [segment(EARLY, "kitchen"), segment(NIGHT, "kitchen")]),
      staff: { isSubmitted: true, positionSkills },
      options,
    });

    expect(summarize(cells).map(({ notices, dot }) => ({ notices, dot }))).toEqual([
      { notices: [{ kind: "positionUnavailable" }], dot: "orange" },
      { notices: [], dot: null },
      { notices: [{ kind: "unrequested" }, { kind: "positionUnavailable" }], dot: "orange" },
    ]);
  });

  it("時間が重なる2つの勤務パターンの両方に、相手の名前つきの理由と赤い点を付ける", () => {
    const cells = buildShiftTypeCells({
      shift: shift(["late", "night"], [segment(LATE), segment(NIGHT)]),
      staff: submitted,
      options,
    });

    expect(summarize(cells).map(({ notices, dot }) => ({ notices, dot }))).toEqual([
      { notices: [], dot: null },
      { notices: [{ kind: "overlap", optionNames: ["夜番"] }], dot: "red" },
      { notices: [{ kind: "overlap", optionNames: ["遅番"] }], dot: "red" },
    ]);
  });

  it("時間が隣り合うだけの勤務パターン（15時終わりと15時始まり）は、重なりにしない", () => {
    const cells = buildShiftTypeCells({
      shift: shift(["early", "late"], [segment(EARLY), segment(LATE)]),
      staff: submitted,
      options,
    });

    expect(cells.map(({ dot }) => dot)).toEqual([null, null, null]);
  });

  it("日をまたぐ勤務パターンは、24時より後の時刻で重なりを判定する", () => {
    // 夜番（18:00〜24:00）と深夜（23:00〜翌5:00）は重なり、遅番（〜21:00）と深夜は重ならない。
    const cells = buildShiftTypeCells({
      shift: shift(["late", "night", "midnight"], [segment(LATE), segment(NIGHT), segment(MIDNIGHT)]),
      staff: submitted,
      options: [LATE, NIGHT, MIDNIGHT],
    });

    expect(cells.map(({ notices }) => notices)).toEqual([
      [{ kind: "overlap", optionNames: ["夜番"] }],
      [{ kind: "overlap", optionNames: ["遅番", "深夜"] }],
      [{ kind: "overlap", optionNames: ["夜番"] }],
    ]);
  });

  it("希望外で時間も重なる割り当ては、理由を両方並べ、点を赤にする", () => {
    const cells = buildShiftTypeCells({
      shift: shift(["late"], [segment(LATE), segment(NIGHT)]),
      staff: submitted,
      options,
    });

    expect(summarize(cells)[2]).toEqual({
      option: "night",
      isRequested: false,
      position: "hall",
      notices: [{ kind: "unrequested" }, { kind: "overlap", optionNames: ["遅番"] }],
      dot: "red",
    });
  });

  it("その日のデータがない人は、どの勤務パターンも空にする", () => {
    expect(summarize(buildShiftTypeCells({ shift: undefined, staff: submitted, options }))).toEqual(
      options.map((option) => ({ option: option.id, isRequested: false, position: null, notices: [], dot: null })),
    );
  });
});

describe("isShiftTypeRestRequestWithoutWork", () => {
  const isRest = (target: ShiftData | undefined, staff = submitted, hasNote = false) =>
    isShiftTypeRestRequestWithoutWork({ shift: target, staff, hasNote });

  it("提出済みで希望も割り当ても連絡事項もない人だけを、休み希望としてまとめる", () => {
    expect(isRest(shift([], []))).toBe(true);
    expect(isRest(undefined)).toBe(true);
  });

  it("休み希望でも割り当てがある人、希望がある人、未提出の人は、まとめない", () => {
    expect(isRest(shift([], [segment(EARLY)]))).toBe(false);
    expect(isRest(shift(["early"], []))).toBe(false);
    expect(isRest(shift([], []), { isSubmitted: false })).toBe(false);
  });

  it("休み希望でも、その日の連絡事項がある人は、まとめない", () => {
    expect(isRest(shift([], []), submitted, true)).toBe(false);
  });
});
