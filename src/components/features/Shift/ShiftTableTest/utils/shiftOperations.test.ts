import { describe, expect, test } from "vitest";
import type { LinkedResizeTarget, PositionSegment, ShiftData } from "../types";
import {
  deletePositionFromShift,
  fillGapsWithBreak,
  mergeAdjacentPositions,
  normalizePositions,
  resizeLinkedPositions,
} from "./shiftOperations";

const breakPosition = { id: "pos4", name: "休憩", color: "#6b7280" };

const seg = (overrides: Partial<PositionSegment> & { id: string; start: string; end: string }): PositionSegment => ({
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  ...overrides,
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
