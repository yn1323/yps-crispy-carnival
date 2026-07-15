import { describe, expect, test } from "vitest";
import {
  computeVisualBreaks,
  deletePositionFromShift,
  fillGapsWithBreak,
  mergeAdjacentPositions,
  normalizePositions,
  paintPosition,
  resizeLinkedPositions,
  resizePosition,
} from "./operations";
import type { LinkedResizeTarget, PositionSegment, ShiftData } from "./types";

const breakPosition = { id: "pos4", name: "休憩", color: "#6b7280" };

const seg = (overrides: Partial<PositionSegment> & { id: string; start: string; end: string }): PositionSegment => ({
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  ...overrides,
});

const shift = (positions: PositionSegment[]): ShiftData => ({
  id: "shift1",
  staffId: "staff1",
  staffName: "田中",
  date: "2026-01-27",
  requestedTime: { start: "09:00", end: "18:00" },
  requestedTimes: [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "18:00" },
  ],
  requestedShiftTypeOptionIds: ["morning", "late"],
  positions,
});

describe("paintPosition", () => {
  test.each([
    { name: "順方向", startMinutes: 600, endMinutes: 660 },
    { name: "逆方向", startMinutes: 660, endMinutes: 600 },
  ])("$nameのドラッグ範囲を同じポジションとして追加する", ({ startMinutes, endMinutes }) => {
    const source = shift([]);

    const result = paintPosition({
      shift: source,
      positionId: "pos2",
      positionName: "キッチン",
      positionColor: "#f97316",
      startMinutes,
      endMinutes,
      segmentId: "painted",
    });

    expect(result).toEqual({
      ...source,
      positions: [
        {
          id: "painted",
          positionId: "pos2",
          positionName: "キッチン",
          color: "#f97316",
          start: "10:00",
          end: "11:00",
        },
      ],
    });
    expect(source.positions).toEqual([]);
  });

  test("塗った範囲を優先し、完全重複を削除して左右の部分重複をtrimする", () => {
    const source = shift([
      seg({ id: "left", start: "08:00", end: "10:00", shiftTypeOptionId: "morning" }),
      seg({ id: "covered", start: "10:00", end: "12:00" }),
      seg({ id: "right", start: "12:00", end: "16:00", positionId: "pos3" }),
    ]);

    const result = paintPosition({
      shift: source,
      positionId: "pos2",
      positionName: "キッチン",
      positionColor: "#f97316",
      startMinutes: 540,
      endMinutes: 900,
      segmentId: "painted",
    });

    expect(result.positions).toEqual([
      seg({ id: "left-before", start: "08:00", end: "09:00", shiftTypeOptionId: "morning" }),
      seg({ id: "right-after", start: "15:00", end: "16:00", positionId: "pos3" }),
      seg({
        id: "painted",
        start: "09:00",
        end: "15:00",
        positionId: "pos2",
        positionName: "キッチン",
        color: "#f97316",
      }),
    ]);
    expect(result.requestedTime).toEqual(source.requestedTime);
    expect(result.requestedTimes).toEqual(source.requestedTimes);
    expect(result.requestedShiftTypeOptionIds).toEqual(source.requestedShiftTypeOptionIds);
    expect(result).toMatchObject({ id: source.id, staffId: source.staffId, date: source.date });
  });

  test("既存バーの中央だけを塗ると前後へ分割し、元の勤務区分IDを保持する", () => {
    const source = shift([seg({ id: "wide", start: "08:00", end: "18:00", shiftTypeOptionId: "morning" })]);

    const result = paintPosition({
      shift: source,
      positionId: "pos2",
      positionName: "キッチン",
      positionColor: "#f97316",
      startMinutes: 600,
      endMinutes: 720,
      segmentId: "painted",
    });

    expect(result.positions).toEqual([
      seg({ id: "wide-before", start: "08:00", end: "10:00", shiftTypeOptionId: "morning" }),
      seg({ id: "wide-after", start: "12:00", end: "18:00", shiftTypeOptionId: "morning" }),
      seg({
        id: "painted",
        start: "10:00",
        end: "12:00",
        positionId: "pos2",
        positionName: "キッチン",
        color: "#f97316",
      }),
    ]);
  });

  test("隣接境界に触れるだけの既存バーは変更しない", () => {
    const source = shift([
      seg({ id: "before", start: "08:00", end: "10:00" }),
      seg({ id: "after", start: "12:00", end: "14:00" }),
    ]);

    const result = paintPosition({
      shift: source,
      positionId: "pos2",
      positionName: "キッチン",
      positionColor: "#f97316",
      startMinutes: 600,
      endMinutes: 720,
      segmentId: "painted",
    });

    expect(result.positions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: "before", start: "08:00", end: "10:00" },
      { id: "after", start: "12:00", end: "14:00" },
      { id: "painted", start: "10:00", end: "12:00" },
    ]);
  });

  test("ドラッグ幅が0なら何も変更しない", () => {
    const source = shift([seg({ id: "a", start: "10:00", end: "12:00" })]);

    const result = paintPosition({
      shift: source,
      positionId: "pos2",
      positionName: "キッチン",
      positionColor: "#f97316",
      startMinutes: 660,
      endMinutes: 660,
      segmentId: "painted",
    });

    expect(result).toBe(source);
  });
});

describe("resizePosition", () => {
  test.each([
    { name: "開始端を右へ縮める", edge: "start" as const, newMinutes: 720, expected: ["12:00", "14:00"] },
    { name: "終了端を左へ縮める", edge: "end" as const, newMinutes: 720, expected: ["10:00", "12:00"] },
  ])("$name", ({ edge, newMinutes, expected }) => {
    const source = shift([seg({ id: "target", start: "10:00", end: "14:00", shiftTypeOptionId: "morning" })]);

    const result = resizePosition({
      shift: source,
      positionId: "target",
      edge,
      newMinutes,
      minDuration: 30,
    });

    expect(result.positions[0]).toMatchObject({
      id: "target",
      start: expected[0],
      end: expected[1],
      shiftTypeOptionId: "morning",
    });
    expect(result.requestedTimes).toEqual(source.requestedTimes);
    expect(result.requestedShiftTypeOptionIds).toEqual(source.requestedShiftTypeOptionIds);
    expect(result).toMatchObject({ id: source.id, staffId: source.staffId, date: source.date });
  });

  test.each([
    { name: "開始端", edge: "start" as const, newMinutes: 850, expected: ["13:30", "14:00"] },
    { name: "終了端", edge: "end" as const, newMinutes: 610, expected: ["10:00", "10:30"] },
  ])("$nameを反対側より先へ動かしても最小幅を維持する", ({ edge, newMinutes, expected }) => {
    const source = shift([seg({ id: "target", start: "10:00", end: "14:00" })]);

    const result = resizePosition({
      shift: source,
      positionId: "target",
      edge,
      newMinutes,
      minDuration: 30,
    });

    expect(result.positions[0]).toMatchObject({ start: expected[0], end: expected[1] });
  });

  test("開始端を左へ広げると完全重複を削除し、左側の部分重複だけをtrimする", () => {
    const source = shift([
      seg({ id: "left-outer", start: "08:00", end: "10:00" }),
      seg({ id: "left-covered", start: "10:00", end: "11:00", positionId: "pos2" }),
      seg({ id: "target", start: "11:00", end: "13:00", positionId: "pos3" }),
      seg({ id: "right", start: "13:00", end: "14:00", positionId: "pos2" }),
    ]);

    const result = resizePosition({
      shift: source,
      positionId: "target",
      edge: "start",
      newMinutes: 540,
      minDuration: 30,
    });

    expect(result.positions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: "left-outer-before", start: "08:00", end: "09:00" },
      { id: "target", start: "09:00", end: "13:00" },
      { id: "right", start: "13:00", end: "14:00" },
    ]);
  });

  test("終了端を右へ広げると完全重複を削除し、右側の部分重複だけをtrimする", () => {
    const source = shift([
      seg({ id: "left", start: "09:00", end: "10:00" }),
      seg({ id: "target", start: "10:00", end: "12:00", positionId: "pos3" }),
      seg({ id: "right-covered", start: "12:00", end: "13:00", positionId: "pos2" }),
      seg({ id: "right-outer", start: "13:00", end: "15:00" }),
    ]);

    const result = resizePosition({
      shift: source,
      positionId: "target",
      edge: "end",
      newMinutes: 840,
      minDuration: 30,
    });

    expect(result.positions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: "left", start: "09:00", end: "10:00" },
      { id: "target", start: "10:00", end: "14:00" },
      { id: "right-outer-after", start: "14:00", end: "15:00" },
    ]);
  });

  test("広げたバーが別バーの中央に重なると前後へ分割する", () => {
    const source = shift([
      seg({ id: "wide", start: "08:00", end: "18:00", shiftTypeOptionId: "late" }),
      seg({ id: "target", start: "10:00", end: "12:00", positionId: "pos2" }),
    ]);

    const result = resizePosition({
      shift: source,
      positionId: "target",
      edge: "end",
      newMinutes: 840,
      minDuration: 30,
    });

    expect(result.positions).toEqual([
      seg({ id: "wide-before", start: "08:00", end: "10:00", shiftTypeOptionId: "late" }),
      seg({ id: "wide-after", start: "14:00", end: "18:00", shiftTypeOptionId: "late" }),
      seg({ id: "target", start: "10:00", end: "14:00", positionId: "pos2" }),
    ]);
  });

  test("境界が変わらない場合と対象IDがない場合は何も変更しない", () => {
    const source = shift([seg({ id: "target", start: "10:00", end: "12:00" })]);

    expect(
      resizePosition({
        shift: source,
        positionId: "target",
        edge: "start",
        newMinutes: 600,
        minDuration: 30,
      }),
    ).toBe(source);
    expect(
      resizePosition({
        shift: source,
        positionId: "missing",
        edge: "end",
        newMinutes: 780,
        minDuration: 30,
      }),
    ).toBe(source);
  });
});

describe("mergeAdjacentPositions", () => {
  test("同一positionIdの隣接バーが1本にマージされる", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      seg({ id: "b", start: "12:00", end: "14:00" }),
    ];
    const result = mergeAdjacentPositions(positions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    expect(result[0].start).toBe("10:00");
    expect(result[0].end).toBe("14:00");
  });

  test("同一positionIdの重複バーが1本にマージされる", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "13:00" }),
      seg({ id: "b", start: "12:00", end: "14:00" }),
    ];
    const result = mergeAdjacentPositions(positions);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe("10:00");
    expect(result[0].end).toBe("14:00");
  });

  test("異なるpositionIdの隣接バーはマージされない", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "12:00", positionId: "pos1" }),
      seg({ id: "b", start: "12:00", end: "14:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ];
    const result = mergeAdjacentPositions(positions);
    expect(result).toHaveLength(2);
  });

  test("3つ連続する同一positionIdバーが1本にマージされる", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "11:00" }),
      seg({ id: "b", start: "11:00", end: "12:00" }),
      seg({ id: "c", start: "12:00", end: "13:00" }),
    ];
    const result = mergeAdjacentPositions(positions);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe("10:00");
    expect(result[0].end).toBe("13:00");
  });

  test("空配列はそのまま返される", () => {
    expect(mergeAdjacentPositions([])).toHaveLength(0);
  });

  test("1要素の配列はそのまま返される", () => {
    const positions: PositionSegment[] = [seg({ id: "a", start: "10:00", end: "12:00" })];
    const result = mergeAdjacentPositions(positions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});

describe("fillGapsWithBreak", () => {
  test("バー間の空白に休憩が挿入される", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      seg({ id: "b", start: "13:00", end: "15:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ];
    const result = fillGapsWithBreak({ positions, breakPosition });
    expect(result).toHaveLength(3);
    expect(result[1].positionId).toBe("pos4");
    expect(result[1].start).toBe("12:00");
    expect(result[1].end).toBe("13:00");
    expect(result[1].id).toBe("break-720-780");
  });

  test("隣接バー間には休憩が挿入されない", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      seg({ id: "b", start: "12:00", end: "14:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ];
    const result = fillGapsWithBreak({ positions, breakPosition });
    expect(result).toHaveLength(2);
  });

  test("最初のバーの前と最後のバーの後には休憩が挿入されない", () => {
    const positions: PositionSegment[] = [seg({ id: "a", start: "12:00", end: "14:00" })];
    const result = fillGapsWithBreak({ positions, breakPosition });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  test("空配列はそのまま返される", () => {
    expect(fillGapsWithBreak({ positions: [], breakPosition })).toHaveLength(0);
  });

  test("複数ギャップにそれぞれ休憩が挿入される", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "11:00" }),
      seg({ id: "b", start: "12:00", end: "13:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
      seg({ id: "c", start: "14:00", end: "15:00" }),
    ];
    const result = fillGapsWithBreak({ positions, breakPosition });
    expect(result).toHaveLength(5);
    expect(result[1].positionId).toBe("pos4");
    expect(result[3].positionId).toBe("pos4");
  });
});

describe("normalizePositions", () => {
  test("マージとギャップ埋めが順番に実行される", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "11:00" }),
      seg({ id: "b", start: "11:00", end: "12:00" }),
      // ギャップ: 12:00-13:00
      seg({ id: "c", start: "13:00", end: "15:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ];
    const result = normalizePositions({ positions, breakPosition });
    // a+bがマージされて1本、ギャップに休憩、c = 3本
    expect(result).toHaveLength(3);
    expect(result[0].start).toBe("10:00");
    expect(result[0].end).toBe("12:00");
    expect(result[1].positionId).toBe("pos4");
    expect(result[2].positionId).toBe("pos2");
  });

  test("既存の休憩バーが除去されて再計算される", () => {
    const positions: PositionSegment[] = [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      // 古い休憩（場所がずれている）
      {
        id: "old-break",
        positionId: "pos4",
        positionName: "休憩",
        color: "#6b7280",
        start: "11:00",
        end: "13:00",
      },
      seg({ id: "c", start: "14:00", end: "16:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ];
    const result = normalizePositions({ positions, breakPosition });
    // 休憩は12:00-14:00に再計算されるべき
    expect(result).toHaveLength(3);
    expect(result[0].start).toBe("10:00");
    expect(result[0].end).toBe("12:00");
    expect(result[1].positionId).toBe("pos4");
    expect(result[1].start).toBe("12:00");
    expect(result[1].end).toBe("14:00");
    expect(result[2].positionId).toBe("pos2");
  });

  test("空配列はそのまま返される", () => {
    expect(normalizePositions({ positions: [], breakPosition })).toHaveLength(0);
  });

  test("休憩のみの場合は空配列が返される", () => {
    const positions: PositionSegment[] = [
      {
        id: "brk",
        positionId: "pos4",
        positionName: "休憩",
        color: "#6b7280",
        start: "12:00",
        end: "13:00",
      },
    ];
    const result = normalizePositions({ positions, breakPosition });
    expect(result).toHaveLength(0);
  });
});

describe("deletePositionFromShift", () => {
  const baseShift: ShiftData = {
    id: "shift1",
    staffId: "staff1",
    staffName: "田中",
    date: "2026-01-27",
    requestedTime: null,
    positions: [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      {
        id: "brk",
        positionId: "pos4",
        positionName: "休憩",
        color: "#6b7280",
        start: "12:00",
        end: "13:00",
      },
      seg({ id: "c", start: "13:00", end: "15:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ],
  };

  test("非休憩バーを削除するとフィルタされる", () => {
    const result = deletePositionFromShift({
      shift: baseShift,
      positionSegmentId: "a",
      breakPositionId: "pos4",
    });
    expect(result.positions).toHaveLength(2);
    expect(result.positions.find((p) => p.id === "a")).toBeUndefined();
  });

  test("休憩を削除すると前のバーが延長される", () => {
    const result = deletePositionFromShift({
      shift: baseShift,
      positionSegmentId: "brk",
      breakPositionId: "pos4",
    });
    expect(result.positions).toHaveLength(2);
    // 前のバー(a)のendが休憩のend(13:00)まで延長
    const barA = result.positions.find((p) => p.id === "a");
    expect(barA?.end).toBe("13:00");
    // 休憩は消えている
    expect(result.positions.find((p) => p.id === "brk")).toBeUndefined();
  });

  test("最初の位置の休憩を削除すると単純に削除される", () => {
    const shiftWithBreakFirst: ShiftData = {
      ...baseShift,
      positions: [
        {
          id: "brk-first",
          positionId: "pos4",
          positionName: "休憩",
          color: "#6b7280",
          start: "09:00",
          end: "10:00",
        },
        seg({ id: "a", start: "10:00", end: "12:00" }),
      ],
    };
    const result = deletePositionFromShift({
      shift: shiftWithBreakFirst,
      positionSegmentId: "brk-first",
      breakPositionId: "pos4",
    });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].id).toBe("a");
  });

  test("存在しないIDを指定するとシフトがそのまま返される", () => {
    const result = deletePositionFromShift({
      shift: baseShift,
      positionSegmentId: "nonexistent",
      breakPositionId: "pos4",
    });
    expect(result.positions).toHaveLength(3);
  });
});

describe("resizeLinkedPositions", () => {
  const linkedShift: ShiftData = {
    id: "shift1",
    staffId: "staff1",
    staffName: "田中",
    date: "2026-01-27",
    requestedTime: null,
    positions: [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      seg({ id: "b", start: "12:00", end: "14:00", positionId: "pos2", positionName: "キッチン", color: "#f97316" }),
    ],
  };

  const linkedTarget: LinkedResizeTarget = {
    prevPosition: { positionId: "a", positionColor: "#3b82f6" },
    nextPosition: { positionId: "b", positionColor: "#f97316" },
    boundaryMinutes: 720, // 12:00
  };

  test("UNIT以上の場合は通常通りリサイズされる", () => {
    const result = resizeLinkedPositions({
      shift: linkedShift,
      linkedTarget,
      newMinutes: 690, // 11:30
      minDuration: 30,
    });
    expect(result.positions).toHaveLength(2);
    const barA = result.positions.find((p) => p.id === "a");
    const barB = result.positions.find((p) => p.id === "b");
    expect(barA?.end).toBe("11:30");
    expect(barB?.start).toBe("11:30");
  });

  test("左方向ドラッグでprevバーがUNIT未満になると削除される", () => {
    const result = resizeLinkedPositions({
      shift: linkedShift,
      linkedTarget,
      newMinutes: 610, // 10:10
      minDuration: 30,
    });
    expect(result.positions).toHaveLength(1);
    expect(result.positions.find((p) => p.id === "a")).toBeUndefined();
    const barB = result.positions.find((p) => p.id === "b");
    expect(barB?.start).toBe("10:10");
  });

  test("右方向ドラッグでnextバーがUNIT未満になると削除される", () => {
    const result = resizeLinkedPositions({
      shift: linkedShift,
      linkedTarget,
      newMinutes: 830, // 13:50
      minDuration: 30,
    });
    expect(result.positions).toHaveLength(1);
    expect(result.positions.find((p) => p.id === "b")).toBeUndefined();
    const barA = result.positions.find((p) => p.id === "a");
    expect(barA?.end).toBe("13:50");
  });

  test("片側のみ（prevなし）でnextバーがUNIT未満になると削除される", () => {
    const singleTarget: LinkedResizeTarget = {
      prevPosition: null,
      nextPosition: { positionId: "b", positionColor: "#f97316" },
      boundaryMinutes: 720,
    };
    const result = resizeLinkedPositions({
      shift: linkedShift,
      linkedTarget: singleTarget,
      newMinutes: 830, // 13:50 → nextは10分 < 30分
      minDuration: 30,
    });
    expect(result.positions).toHaveLength(1);
    expect(result.positions.find((p) => p.id === "b")).toBeUndefined();
  });
});

describe("computeVisualBreaks", () => {
  test("2つのポジション間のギャップが休憩として返される", () => {
    const positions = [seg({ id: "a", start: "10:00", end: "12:00" }), seg({ id: "b", start: "14:00", end: "18:00" })];
    const result = computeVisualBreaks(positions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: "12:00", end: "14:00" });
  });

  test("隣接するポジション間にはギャップなし", () => {
    const positions = [seg({ id: "a", start: "10:00", end: "12:00" }), seg({ id: "b", start: "12:00", end: "14:00" })];
    const result = computeVisualBreaks(positions);
    expect(result).toHaveLength(0);
  });

  test("ポジション1つのみ → 空配列", () => {
    const positions = [seg({ id: "a", start: "10:00", end: "14:00" })];
    expect(computeVisualBreaks(positions)).toHaveLength(0);
  });

  test("空配列 → 空配列", () => {
    expect(computeVisualBreaks([])).toHaveLength(0);
  });

  test("3つのポジション間に複数ギャップ", () => {
    const positions = [
      seg({ id: "a", start: "10:00", end: "12:00" }),
      seg({ id: "b", start: "13:00", end: "14:00" }),
      seg({ id: "c", start: "16:00", end: "18:00" }),
    ];
    const result = computeVisualBreaks(positions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: "12:00", end: "13:00" });
    expect(result[1]).toEqual({ start: "14:00", end: "16:00" });
  });
});
