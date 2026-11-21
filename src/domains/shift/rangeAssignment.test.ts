import { describe, expect, it } from "vitest";
import {
  assignPositionToRange,
  closeGapsWithBreaks,
  findSelectionBoundsAt,
  findWorkSectionAt,
  listWorkSections,
  removeBreakRange,
  resolveRangeAssignment,
  restoreWorkInRange,
} from "./rangeAssignment";
import { timeToMinutes } from "./time";
import type { PositionSegment, ShiftData } from "./types";

const hall = { id: "hall", name: "ホール", color: "#60a5fa" };
const kitchen = { id: "kitchen", name: "キッチン", color: "#fb923c" };
const register = { id: "register", name: "レジ", color: "#a78bfa" };

const segment = (position: typeof hall, start: string, end: string): PositionSegment => ({
  id: `seg-${start}-${end}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start,
  end,
});

const day = (positions: PositionSegment[], breaks?: ShiftData["breaks"]): ShiftData => ({
  id: "shift-1",
  staffId: "staff-1",
  staffName: "山田",
  date: "2026-07-14",
  requestedTime: null,
  positions,
  ...(breaks ? { breaks } : {}),
});

const minutes = (start: string, end: string) => ({ start: timeToMinutes(start), end: timeToMinutes(end) });
const work = (position: typeof hall, start: string, end: string) => ({
  kind: "work" as const,
  positionId: position.id,
  ...minutes(start, end),
});
const rest = (start: string, end: string) => ({ kind: "break" as const, ...minutes(start, end) });

/** 結果の勤務を、ポジションと時刻だけにして比べる。区間のIDは契約にしない。 */
const toWork = (positions: PositionSegment[] | undefined) =>
  positions?.map((item) => [item.positionName, item.start, item.end]);

const assign = (shift: ShiftData, start: string, end: string, position = kitchen) =>
  assignPositionToRange({ shift, range: minutes(start, end), position, segmentId: "new" });

describe("listWorkSections", () => {
  it("休憩のない勤務は、ポジションの区間ごとに1つの区間にする", () => {
    const shift = day([segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")]);

    expect(listWorkSections(shift)).toEqual([work(hall, "10:00", "14:00"), work(kitchen, "14:00", "18:00")]);
  });

  it("勤務の内側の休憩は、勤務を前後に区切り、休憩も1つの区間にする", () => {
    const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

    expect(listWorkSections(shift)).toEqual([
      work(hall, "10:00", "13:00"),
      rest("13:00", "14:00"),
      work(hall, "14:00", "18:00"),
    ]);
  });

  it("ポジションの境目をまたぐ休憩は、1つの区間のままにする", () => {
    const shift = day(
      [segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")],
      [{ start: "13:30", end: "14:30" }],
    );

    expect(listWorkSections(shift)).toEqual([
      work(hall, "10:00", "13:30"),
      rest("13:30", "14:30"),
      work(kitchen, "14:30", "18:00"),
    ]);
  });

  it("離れた勤務の間の空きは、休憩の区間にする。最初の勤務より前と、最後の勤務より後は区間にしない", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(hall, "14:00", "18:00")]);

    expect(listWorkSections(shift)).toEqual([
      work(hall, "10:00", "12:00"),
      rest("12:00", "14:00"),
      work(hall, "14:00", "18:00"),
    ]);
  });

  it("ポジションを見せない表示では、ポジションだけが違う隣り合う勤務を1つの区間にまとめ、休憩と空きでは区切る", () => {
    const shift = day(
      [segment(hall, "10:00", "12:00"), segment(kitchen, "12:00", "16:00"), segment(hall, "17:00", "19:00")],
      [{ start: "13:00", end: "14:00" }],
    );

    expect(listWorkSections(shift, { mergesAcrossPositions: true })).toEqual([
      work(hall, "10:00", "13:00"),
      rest("13:00", "14:00"),
      work(kitchen, "14:00", "16:00"),
      rest("16:00", "17:00"),
      work(hall, "17:00", "19:00"),
    ]);
    expect(findWorkSectionAt(shift, timeToMinutes("12:30"), { mergesAcrossPositions: true })).toEqual(
      work(hall, "10:00", "13:00"),
    );
  });

  it("勤務のない日は、区間がない", () => {
    expect(listWorkSections(day([]))).toEqual([]);
  });
});

describe("findWorkSectionAt", () => {
  const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

  it("勤務の上の時刻は、休憩で区切った勤務の区間を返す", () => {
    expect(findWorkSectionAt(shift, timeToMinutes("11:20"))).toEqual(work(hall, "10:00", "13:00"));
  });

  it("休憩の上の時刻は、その休憩を返す", () => {
    expect(findWorkSectionAt(shift, timeToMinutes("13:10"))).toEqual(rest("13:00", "14:00"));
  });

  it("区間の開始は含み、終了は含まない", () => {
    expect(findWorkSectionAt(shift, timeToMinutes("13:00"))).toEqual(rest("13:00", "14:00"));
    expect(findWorkSectionAt(shift, timeToMinutes("14:00"))).toEqual(work(hall, "14:00", "18:00"));
    expect(findWorkSectionAt(shift, timeToMinutes("18:00"))).toBeNull();
  });

  it("勤務の外の時刻はnullを返す", () => {
    expect(findWorkSectionAt(shift, timeToMinutes("09:30"))).toBeNull();
  });
});

describe("findSelectionBoundsAt", () => {
  it("隣り合う勤務は、ポジションが違っても、ひと続きの勤務として返す", () => {
    const shift = day([segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")]);

    expect(findSelectionBoundsAt(shift, timeToMinutes("15:00"))).toEqual({
      kind: "work",
      ...minutes("10:00", "18:00"),
    });
  });

  it("離れた勤務は押した側の勤務だけを返し、間の空きを押した場合はその空きを返す", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(hall, "14:00", "18:00")]);

    expect(findSelectionBoundsAt(shift, timeToMinutes("11:00"))).toEqual({
      kind: "work",
      ...minutes("10:00", "12:00"),
    });
    expect(findSelectionBoundsAt(shift, timeToMinutes("13:00"))).toEqual({ kind: "gap", ...minutes("12:00", "14:00") });
  });

  it("最初の勤務より前と、最後の勤務より後はnullを返す", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(hall, "14:00", "18:00")]);

    expect(findSelectionBoundsAt(shift, timeToMinutes("09:30"))).toBeNull();
    expect(findSelectionBoundsAt(shift, timeToMinutes("18:00"))).toBeNull();
  });
});

describe("resolveRangeAssignment", () => {
  const shift = day(
    [segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")],
    [{ start: "12:00", end: "13:00" }],
  );

  it("範囲がすべて同じポジションなら、そのポジションを返す", () => {
    expect(resolveRangeAssignment(shift, minutes("10:00", "11:30"))).toEqual({ kind: "position", positionId: "hall" });
  });

  it("ちょうど区間の境目までの範囲は、その区間のポジションを返す", () => {
    expect(resolveRangeAssignment(shift, minutes("13:00", "14:00"))).toEqual({ kind: "position", positionId: "hall" });
    expect(resolveRangeAssignment(shift, minutes("14:00", "18:00"))).toEqual({
      kind: "position",
      positionId: "kitchen",
    });
  });

  it("休憩をまたいでいても、勤務が同じポジションなら、そのポジションを返す", () => {
    expect(resolveRangeAssignment(shift, minutes("10:00", "14:00"))).toEqual({ kind: "position", positionId: "hall" });
  });

  it("範囲がすべて休憩なら、休憩を返す", () => {
    expect(resolveRangeAssignment(shift, minutes("12:00", "13:00"))).toEqual({ kind: "break" });
    expect(resolveRangeAssignment(shift, minutes("12:30", "13:00"))).toEqual({ kind: "break" });
  });

  it("勤務の間の空きだけの範囲は、休憩を返す", () => {
    const gapped = day([segment(hall, "10:00", "12:00"), segment(kitchen, "14:00", "18:00")]);

    expect(resolveRangeAssignment(gapped, minutes("12:00", "14:00"))).toEqual({ kind: "break" });
    expect(resolveRangeAssignment(gapped, minutes("12:30", "13:00"))).toEqual({ kind: "break" });
  });

  it("ポジションが混ざる範囲はnullを返す", () => {
    expect(resolveRangeAssignment(shift, minutes("13:30", "14:30"))).toBeNull();
  });

  it("勤務の外を含む範囲と、長さのない範囲はnullを返す", () => {
    expect(resolveRangeAssignment(shift, minutes("09:00", "11:00"))).toBeNull();
    expect(resolveRangeAssignment(shift, minutes("11:00", "11:00"))).toBeNull();
  });
});

describe("assignPositionToRange", () => {
  it("区間の途中を選ぶと、前後を残して3つに分ける", () => {
    const result = assign(day([segment(hall, "10:00", "18:00")]), "12:00", "14:00");

    expect(toWork(result?.positions)).toEqual([
      ["ホール", "10:00", "12:00"],
      ["キッチン", "12:00", "14:00"],
      ["ホール", "14:00", "18:00"],
    ]);
  });

  it("区間の頭から選ぶと、2つに分ける", () => {
    const result = assign(day([segment(hall, "10:00", "18:00")]), "10:00", "12:00");

    expect(toWork(result?.positions)).toEqual([
      ["キッチン", "10:00", "12:00"],
      ["ホール", "12:00", "18:00"],
    ]);
  });

  it("区間の全体を選ぶと、分けずにポジションだけを変える", () => {
    const result = assign(day([segment(hall, "10:00", "18:00")]), "10:00", "18:00");

    expect(toWork(result?.positions)).toEqual([["キッチン", "10:00", "18:00"]]);
  });

  it("選択がちょうど区間の境目までのときは、隣の区間を変えない", () => {
    const shift = day([segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")]);

    expect(toWork(assign(shift, "10:00", "14:00", register)?.positions)).toEqual([
      ["レジ", "10:00", "14:00"],
      ["キッチン", "14:00", "18:00"],
    ]);
    expect(toWork(assign(shift, "14:00", "18:00", register)?.positions)).toEqual([
      ["ホール", "10:00", "14:00"],
      ["レジ", "14:00", "18:00"],
    ]);
  });

  it("変えた結果、隣り合う同じポジションの区間は1つにまとめる", () => {
    const shift = day([segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")]);

    expect(toWork(assign(shift, "12:00", "14:00")?.positions)).toEqual([
      ["ホール", "10:00", "12:00"],
      ["キッチン", "12:00", "18:00"],
    ]);
    expect(toWork(assign(shift, "10:00", "14:00")?.positions)).toEqual([["キッチン", "10:00", "18:00"]]);
  });

  it("ポジションの境目をまたいで選ぶと、両側の区間を削って間に入れる", () => {
    const shift = day([segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")]);
    expect(toWork(assign(shift, "13:00", "15:00", register)?.positions)).toEqual([
      ["ホール", "10:00", "13:00"],
      ["レジ", "13:00", "15:00"],
      ["キッチン", "15:00", "18:00"],
    ]);
  });

  it("休憩をまたいで選ぶと、ポジションを変え、範囲の中の休憩を外す。範囲の外の休憩は残す", () => {
    const breaks = [
      { start: "13:00", end: "14:00" },
      { start: "17:00", end: "17:30" },
    ];
    const result = assign(day([segment(hall, "10:00", "18:00")], breaks), "12:00", "16:00");

    expect(toWork(result?.positions)).toEqual([
      ["ホール", "10:00", "12:00"],
      ["キッチン", "12:00", "16:00"],
      ["ホール", "16:00", "18:00"],
    ]);
    expect(result?.breaks).toEqual([{ start: "17:00", end: "17:30" }]);
  });

  it("休憩の途中までを選ぶと、範囲にかかる分だけ休憩を外す", () => {
    const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

    expect(assign(shift, "12:00", "13:30")?.breaks).toEqual([{ start: "13:30", end: "14:00" }]);
  });

  it("休憩だけを選ぶと、その休憩を外して、選んだポジションの勤務にする", () => {
    const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

    const toHall = assign(shift, "13:00", "14:00", hall);
    expect(toWork(toHall?.positions)).toEqual([["ホール", "10:00", "18:00"]]);
    expect(toHall?.breaks).toEqual([]);
    const toKitchen = assign(shift, "13:00", "14:00");
    expect(toWork(toKitchen?.positions)).toEqual([
      ["ホール", "10:00", "13:00"],
      ["キッチン", "13:00", "14:00"],
      ["ホール", "14:00", "18:00"],
    ]);
    expect(toKitchen?.breaks).toEqual([]);
  });

  it("休憩の一部だけを選ぶと、選んだ分だけ休憩を外し、ほかの休憩は残す", () => {
    const shift = day(
      [segment(hall, "10:00", "18:00")],
      [
        { start: "12:00", end: "13:00" },
        { start: "15:00", end: "15:30" },
      ],
    );

    expect(assign(shift, "12:00", "12:30", hall)?.breaks).toEqual([
      { start: "12:30", end: "13:00" },
      { start: "15:00", end: "15:30" },
    ]);
  });

  it("すでに同じポジションで、休憩のかからない範囲は、何も変えない", () => {
    const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

    expect(assign(shift, "11:00", "12:00", hall)).toBeNull();
    expect(assign(shift, "14:00", "18:00", hall)).toBeNull();
  });

  it("すでに同じポジションでも、休憩をまたいで選ぶと、範囲の中の休憩を外す", () => {
    const shift = day([segment(hall, "10:00", "18:00")], [{ start: "13:00", end: "14:00" }]);

    const result = assign(shift, "10:00", "18:00", hall);

    expect(toWork(result?.positions)).toEqual([["ホール", "10:00", "18:00"]]);
    expect(result?.breaks).toEqual([]);
  });

  it("勤務の間の空きにかかる部分は、選んだポジションの勤務で埋める", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(hall, "14:00", "18:00")]);

    expect(toWork(assign(shift, "12:00", "14:00")?.positions)).toEqual([
      ["ホール", "10:00", "12:00"],
      ["キッチン", "12:00", "14:00"],
      ["ホール", "14:00", "18:00"],
    ]);
    // 空きを同じポジションで埋めると、前後の勤務とつながる。
    expect(toWork(assign(shift, "12:00", "14:00", hall)?.positions)).toEqual([["ホール", "10:00", "18:00"]]);
    expect(toWork(assign(shift, "12:30", "13:00")?.positions)).toEqual([
      ["ホール", "10:00", "12:00"],
      ["キッチン", "12:30", "13:00"],
      ["ホール", "14:00", "18:00"],
    ]);
  });

  it("最初の勤務より前と、最後の勤務より後には、勤務を作らない", () => {
    const shift = day([segment(hall, "10:00", "12:00")]);

    expect(toWork(assign(shift, "09:00", "11:00")?.positions)).toEqual([
      ["キッチン", "10:00", "11:00"],
      ["ホール", "11:00", "12:00"],
    ]);
    expect(assign(shift, "12:00", "14:00")).toBeNull();
    expect(assign(day([]), "10:00", "12:00")).toBeNull();
  });

  it("希望時間などの勤務以外の値は変えない", () => {
    const shift = { ...day([segment(hall, "10:00", "18:00")]), requestedTime: { start: "10:00", end: "18:00" } };

    expect(Object.keys(assign(shift, "12:00", "14:00") ?? {}).sort()).toEqual(["breaks", "positions"]);
  });
});

describe("removeBreakRange", () => {
  const shift = day(
    [segment(hall, "10:00", "18:00")],
    [
      { start: "12:00", end: "13:00" },
      { start: "15:00", end: "15:30" },
    ],
  );

  it("選んだ休憩だけを外し、ほかの休憩は残す", () => {
    expect(removeBreakRange(shift, minutes("12:00", "13:00"))).toEqual([{ start: "15:00", end: "15:30" }]);
  });

  it("休憩の一部だけを選んだ場合は、選んだ分だけ外す", () => {
    expect(removeBreakRange(shift, minutes("12:30", "13:00"))).toEqual([
      { start: "12:00", end: "12:30" },
      { start: "15:00", end: "15:30" },
    ]);
  });

  it("休憩のない範囲では、何も外さない", () => {
    expect(removeBreakRange(shift, minutes("10:00", "11:00"))).toEqual([
      { start: "12:00", end: "13:00" },
      { start: "15:00", end: "15:30" },
    ]);
  });
});

describe("restoreWorkInRange", () => {
  const restore = (shift: ShiftData, start: string, end: string) =>
    restoreWorkInRange({ shift, range: minutes(start, end), segmentId: "new" });

  it("時刻で入れた休憩を選んだ範囲は、休憩を外し、勤務のポジションは変えない", () => {
    const shift = day(
      [segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")],
      [{ start: "13:00", end: "15:00" }],
    );

    const result = restore(shift, "13:00", "15:00");

    expect(toWork(result.positions)).toEqual([
      ["ホール", "10:00", "14:00"],
      ["キッチン", "14:00", "18:00"],
    ]);
    expect(result.breaks).toEqual([]);
  });

  it("勤務と休憩が混ざる範囲は、範囲の中の休憩をすべて外し、範囲の外の休憩は残す", () => {
    const shift = day(
      [segment(hall, "10:00", "22:00")],
      [
        { start: "12:00", end: "13:00" },
        { start: "17:30", end: "18:30" },
        { start: "19:30", end: "20:30" },
      ],
    );

    const result = restore(shift, "17:00", "21:00");

    expect(toWork(result.positions)).toEqual([["ホール", "10:00", "22:00"]]);
    expect(result.breaks).toEqual([{ start: "12:00", end: "13:00" }]);
  });

  it("勤務の間の空きを選んだ範囲は、直前の勤務と同じポジションで埋める", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(kitchen, "14:00", "18:00")]);

    expect(toWork(restore(shift, "12:00", "14:00").positions)).toEqual([
      ["ホール", "10:00", "14:00"],
      ["キッチン", "14:00", "18:00"],
    ]);
  });

  it("空きの一部だけを選んだ場合は、選んだ分だけ埋め、ほかの休憩は残す", () => {
    const shift = day(
      [segment(hall, "10:00", "12:00"), segment(hall, "14:00", "18:00")],
      [{ start: "15:00", end: "15:30" }],
    );

    const result = restore(shift, "12:00", "13:00");

    expect(toWork(result.positions)).toEqual([
      ["ホール", "10:00", "13:00"],
      ["ホール", "14:00", "18:00"],
    ]);
    expect(result.breaks).toEqual([{ start: "15:00", end: "15:30" }]);
  });
});

describe("closeGapsWithBreaks", () => {
  it("勤務の間の空きを、直前の勤務と同じポジションで埋め、その時間を休憩にする", () => {
    const shift = day([segment(hall, "10:00", "12:00"), segment(kitchen, "14:00", "18:00")]);

    const result = closeGapsWithBreaks(shift, "new");

    expect(toWork(result.positions)).toEqual([
      ["ホール", "10:00", "14:00"],
      ["キッチン", "14:00", "18:00"],
    ]);
    expect(result.breaks).toEqual([{ start: "12:00", end: "14:00" }]);
  });

  it("空きが複数ある日は、すべて休憩にし、入っていた休憩も残す", () => {
    const shift = day(
      [segment(hall, "09:00", "11:00"), segment(hall, "12:00", "15:00"), segment(kitchen, "16:00", "20:00")],
      [{ start: "13:00", end: "13:30" }],
    );

    const result = closeGapsWithBreaks(shift, "new");

    expect(toWork(result.positions)).toEqual([
      ["ホール", "09:00", "16:00"],
      ["キッチン", "16:00", "20:00"],
    ]);
    expect(result.breaks).toEqual([
      { start: "11:00", end: "12:00" },
      { start: "13:00", end: "13:30" },
      { start: "15:00", end: "16:00" },
    ]);
  });

  it("勤務のお尻にかかって休憩として扱っていなかった休憩は、空きとまとめずに取り除く", () => {
    const shift = day(
      [segment(hall, "10:00", "14:00"), segment(hall, "15:00", "18:00")],
      [{ start: "13:00", end: "14:00" }],
    );

    expect(closeGapsWithBreaks(shift, "new").breaks).toEqual([{ start: "14:00", end: "15:00" }]);
  });

  it("空きがなくても、勤務の外に出た休憩と、勤務の頭かお尻にかかった休憩は取り除く", () => {
    const shift = day(
      [segment(hall, "12:00", "18:00")],
      [
        { start: "10:00", end: "11:00" },
        { start: "11:30", end: "12:30" },
        { start: "15:00", end: "16:00" },
      ],
    );

    const result = closeGapsWithBreaks(shift, "new");

    expect(toWork(result.positions)).toEqual([["ホール", "12:00", "18:00"]]);
    expect(result.breaks).toEqual([{ start: "15:00", end: "16:00" }]);
  });

  it("空きのない日は、何も変えない", () => {
    const shift = day(
      [segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")],
      [{ start: "12:00", end: "13:00" }],
    );

    expect(closeGapsWithBreaks(shift, "new")).toBe(shift);
    expect(closeGapsWithBreaks(day([]), "new")).toEqual(day([]));
  });
});
