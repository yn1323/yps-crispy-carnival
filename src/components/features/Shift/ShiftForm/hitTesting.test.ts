import { describe, expect, it } from "vitest";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { PositionSegment, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { detectBreakResizeEdge, detectLinkedResizeEdge } from "./hitTesting";

const timeRange: TimeRange = { start: 9, end: 18, unit: 30 };
const hourWidth = 60;
const threshold = 10;

const position = (overrides: Partial<PositionSegment> & Pick<PositionSegment, "id" | "start" | "end">) => ({
  positionId: "position1",
  positionName: "ホール",
  color: "#0d9488",
  ...overrides,
});

const shift = (overrides: Partial<ShiftData> = {}): ShiftData => ({
  id: "shift1",
  staffId: "staff1",
  staffName: "田中",
  date: "2026-05-21",
  requestedTime: null,
  positions: [
    position({ id: "later", start: "12:00", end: "14:00", color: "#f97316" }),
    position({ id: "earlier", start: "10:00", end: "12:00", color: "#0d9488" }),
  ],
  ...overrides,
});

const detect = (overrides: Partial<Parameters<typeof detectLinkedResizeEdge>[0]> = {}) =>
  detectLinkedResizeEdge({
    shifts: [shift()],
    staffId: "staff1",
    date: "2026-05-21",
    x: 90,
    timeRange,
    threshold,
    hourWidth,
    ...overrides,
  });

describe("detectLinkedResizeEdge", () => {
  it("左端ぴったりでは開始端だけを返す", () => {
    expect(detect({ x: 90 })).toEqual({
      shiftId: "shift1",
      linkedTarget: {
        prevPosition: null,
        nextPosition: { positionId: "earlier", positionColor: "#0d9488" },
        boundaryMinutes: 600,
      },
    });
  });

  it("右端ぴったりでは終了端だけを返す", () => {
    expect(detect({ x: 330 })).toEqual({
      shiftId: "shift1",
      linkedTarget: {
        prevPosition: { positionId: "later", positionColor: "#f97316" },
        nextPosition: null,
        boundaryMinutes: 840,
      },
    });
  });

  it("隣接バーの共有境界では前後両方を返す", () => {
    expect(detect({ x: 210 })).toEqual({
      shiftId: "shift1",
      linkedTarget: {
        prevPosition: { positionId: "earlier", positionColor: "#0d9488" },
        nextPosition: { positionId: "later", positionColor: "#f97316" },
        boundaryMinutes: 720,
      },
    });
  });

  it.each([
    { name: "左側", x: 80 },
    { name: "右側", x: 100 },
  ])("thresholdちょうどの$nameを端として検出する", ({ x }) => {
    expect(detect({ x })?.linkedTarget.boundaryMinutes).toBe(600);
  });

  it.each([
    { name: "左側", x: 79 },
    { name: "右側", x: 101 },
  ])("threshold外の$nameは検出しない", ({ x }) => {
    expect(detect({ x })).toBeNull();
  });

  it("隙間を挟むバーの終了端と開始端を連結しない", () => {
    const gapShift = shift({
      positions: [
        position({ id: "before", start: "10:00", end: "11:00" }),
        position({ id: "after", start: "12:00", end: "14:00", color: "#f97316" }),
      ],
    });

    expect(detect({ shifts: [gapShift], x: 150 })?.linkedTarget).toEqual({
      prevPosition: { positionId: "before", positionColor: "#0d9488" },
      nextPosition: null,
      boundaryMinutes: 660,
    });
    expect(detect({ shifts: [gapShift], x: 210 })?.linkedTarget).toEqual({
      prevPosition: null,
      nextPosition: { positionId: "after", positionColor: "#f97316" },
      boundaryMinutes: 720,
    });
  });

  it.each([
    { name: "staffが異なる", staffId: "staff2", date: "2026-05-21" },
    { name: "日付が異なる", staffId: "staff1", date: "2026-05-22" },
  ])("$nameシフトは対象にしない", ({ staffId, date }) => {
    expect(detect({ staffId, date })).toBeNull();
  });

  it("対象シフトが空またはポジションが空なら検出しない", () => {
    expect(detect({ shifts: [] })).toBeNull();
    expect(detect({ shifts: [shift({ positions: [] })] })).toBeNull();
  });
});

describe("detectBreakResizeEdge", () => {
  // 10:00〜18:00の勤務。12:00〜13:00の休憩と、15:00〜15:15の短い休憩がある。
  const worked = {
    positions: [position({ id: "work", start: "10:00", end: "18:00" })],
    breaks: [
      { start: "12:00", end: "13:00" },
      { start: "15:00", end: "15:15" },
    ],
  };
  const xOf = (minutes: number) => minutesToPixel(minutes, timeRange, hourWidth);
  const detect = (x: number) => detectBreakResizeEdge({ shift: worked, x, timeRange, threshold, hourWidth });

  it("休憩の開始と終了の近くでは、その休憩と、どちらの端かを返す", () => {
    expect(detect(xOf(12 * 60) + 5)).toEqual({ range: { start: 720, end: 780 }, edge: "start" });
    expect(detect(xOf(13 * 60) - 5)).toEqual({ range: { start: 720, end: 780 }, edge: "end" });
  });

  it("休憩の中央と、休憩のない場所ではnullを返す", () => {
    expect(detect(xOf(12 * 60 + 30))).toBeNull();
    expect(detect(xOf(11 * 60))).toBeNull();
  });

  it("短い休憩は、中央を押して選べるよう、端の当たり判定を休憩の幅の3分の1までにする", () => {
    // 15分の休憩は幅15px。端から5pxまでが端、中央は端にしない。
    expect(detect(xOf(15 * 60) + 4)).toEqual({ range: { start: 900, end: 915 }, edge: "start" });
    expect(detect(xOf(15 * 60) + 7.5)).toBeNull();
    expect(detect(xOf(15 * 60 + 15) - 4)).toEqual({ range: { start: 900, end: 915 }, edge: "end" });
  });

  it("勤務の頭かお尻にかかって休憩として扱っていない休憩は、つまめない", () => {
    const stale = { ...worked, breaks: [{ start: "17:00", end: "18:00" }] };

    expect(detectBreakResizeEdge({ shift: stale, x: xOf(17 * 60), timeRange, threshold, hourWidth })).toBeNull();
  });
});
