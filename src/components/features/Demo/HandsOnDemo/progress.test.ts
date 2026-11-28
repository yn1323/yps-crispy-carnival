import { describe, expect, it } from "vitest";
import type { PositionSegment, ShiftData } from "@/src/domains/shift/types";
import { buildConfirmRows, buildHandsOnCompletedShifts, getHandsOnStepIndex } from "./progress";
import {
  BREAK_STAFF_ID,
  buildHandsOnScenario,
  HANDS_ON_KITCHEN_ID,
  HANDS_ON_POSITIONS,
  runHandsOnAutoCreate,
  SATO_STAFF_ID,
} from "./scenario";

const DAY1 = "2026-11-30";
const HALL = HANDS_ON_POSITIONS[0];

const segment = (start: string, end: string, positionId = HALL.id, positionName = HALL.name): PositionSegment => ({
  id: `${positionId}-${start}`,
  positionId,
  positionName,
  color: "#000000",
  start,
  end,
});

const shift = (
  staffId: string,
  date: string,
  positions: PositionSegment[],
  breaks: ShiftData["breaks"] = [],
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffId,
  date,
  requestedTime: null,
  positions,
  breaks,
});

const step = (variant: "simple" | "detail", shifts: ShiftData[], acknowledged = true, autoCreated = false) =>
  getHandsOnStepIndex({ variant, shifts, day1: DAY1, acknowledged, autoCreated });

describe("シンプル表示の案内の手順", () => {
  it("「次へ」を押すまでは、希望を確かめる手順にとどまる", () => {
    expect(step("simple", [shift(SATO_STAFF_ID, DAY1, [segment("17:00", "22:00")])], false)).toBe(0);
  });

  it("佐藤さんの初日に勤務がなければ、勤務時間を設定する手順にする", () => {
    expect(step("simple", [shift(SATO_STAFF_ID, DAY1, [])])).toBe(1);
  });

  it("佐藤さんのほかの日に勤務があっても、初日になければ勤務時間を設定する手順にする", () => {
    expect(step("simple", [shift(SATO_STAFF_ID, "2026-12-02", [segment("17:00", "22:00")])])).toBe(1);
  });

  it("佐藤さんに勤務を入れ、渡辺さんに休憩がなければ、休憩を入れる手順にする", () => {
    const shifts = [
      shift(SATO_STAFF_ID, DAY1, [segment("17:00", "22:00")]),
      shift(BREAK_STAFF_ID, DAY1, [segment("10:00", "17:00")]),
    ];
    expect(step("simple", shifts)).toBe(2);
  });

  it("渡辺さんに休憩を入れたら、確定する手順にする", () => {
    const shifts = [
      shift(SATO_STAFF_ID, DAY1, [segment("17:00", "22:00")]),
      shift(BREAK_STAFF_ID, DAY1, [segment("10:00", "17:00")], [{ start: "12:00", end: "13:00" }]),
    ];
    expect(step("simple", shifts)).toBe(3);
  });
});

describe("くわしく表示の案内の手順", () => {
  it("佐藤さんの初日に勤務がなければ、勤務時間を設定する手順にする", () => {
    expect(step("detail", [])).toBe(1);
  });

  it("佐藤さんの勤務がホールだけなら、ポジションを変える手順にする", () => {
    expect(step("detail", [shift(SATO_STAFF_ID, DAY1, [segment("17:00", "22:00")])])).toBe(2);
  });

  it("佐藤さんの勤務にキッチンがあれば、自動で作る手順にする", () => {
    const shifts = [
      shift(SATO_STAFF_ID, DAY1, [
        segment("17:00", "19:00"),
        segment("19:00", "22:00", HANDS_ON_KITCHEN_ID, "キッチン"),
      ]),
    ];
    expect(step("detail", shifts)).toBe(3);
  });

  it("自動作成を終えたら、手で入れた勤務によらず確定する手順にする", () => {
    expect(step("detail", [], true, true)).toBe(4);
  });

  it("「次へ」を押すまでは、自動作成を終えていても希望を確かめる手順にとどまる", () => {
    expect(step("detail", [], false, true)).toBe(0);
  });
});

describe("確定のお知らせに並べる勤務", () => {
  it("日ごとに最初の開始から最後の終了までを出し、勤務がない日は休みにする", () => {
    const shifts = [
      shift(SATO_STAFF_ID, DAY1, [
        segment("19:00", "22:00", HANDS_ON_KITCHEN_ID, "キッチン"),
        segment("17:00", "19:00"),
      ]),
      shift(SATO_STAFF_ID, "2026-12-01", []),
      shift("s2", "2026-12-02", [segment("11:00", "22:00")]),
    ];

    expect(buildConfirmRows(shifts, SATO_STAFF_ID, [DAY1, "2026-12-01", "2026-12-02"])).toEqual([
      { dateLabel: "11/30(月)", timeLabel: "17:00-22:00" },
      { dateLabel: "12/1(火)", timeLabel: null },
      { dateLabel: "12/2(水)", timeLabel: null },
    ]);
  });

  it("休憩の区間は勤務に数えない", () => {
    const shifts = [
      shift(SATO_STAFF_ID, DAY1, [segment("17:00", "22:00"), segment("22:00", "23:00", "break", "休憩")]),
    ];

    expect(buildConfirmRows(shifts, SATO_STAFF_ID, [DAY1])).toEqual([
      { dateLabel: "11/30(月)", timeLabel: "17:00-22:00" },
    ]);
  });
});

describe("手順を終えたときの下書き", () => {
  const scenario = buildHandsOnScenario(DAY1);

  it("シンプル表示では、始まりの下書きに、佐藤さんの初日の勤務と渡辺さんの初日の休憩だけを足す", () => {
    const completed = buildHandsOnCompletedShifts("simple", scenario);

    expect(completed).toHaveLength(scenario.simpleInitialShifts.length);
    const changed = completed.filter((shift, index) => shift !== scenario.simpleInitialShifts[index]);
    expect(changed.map(({ staffId, date, positions, breaks }) => ({ staffId, date, positions, breaks }))).toEqual([
      {
        staffId: BREAK_STAFF_ID,
        date: DAY1,
        positions: [expect.objectContaining({ start: "10:00", end: "17:00" })],
        breaks: [{ start: "12:00", end: "13:00" }],
      },
      {
        staffId: SATO_STAFF_ID,
        date: DAY1,
        positions: [expect.objectContaining({ positionId: HALL.id, start: "17:00", end: "22:00" })],
        breaks: undefined,
      },
    ]);
  });

  it("シンプル表示の下書きでは、案内は確定する手順になる", () => {
    expect(step("simple", buildHandsOnCompletedShifts("simple", scenario))).toBe(3);
  });

  it("くわしく表示では、希望から自動作成した下書きにする", () => {
    expect(buildHandsOnCompletedShifts("detail", scenario)).toEqual(
      runHandsOnAutoCreate(scenario, scenario.requests, true),
    );
  });
});
