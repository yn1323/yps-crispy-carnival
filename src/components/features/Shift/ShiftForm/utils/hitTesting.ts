import { timeToMinutes } from "@/src/domains/shift/time";
import type { LinkedResizeTarget, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { minutesToPixel } from "./timelineGeometry";

// ポジションバー端（リサイズ対象）の検出（固定幅ベース）
export const detectPositionResizeEdge = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  x: number;
  timeRange: TimeRange;
  threshold: number;
  hourWidth?: number;
}): { shiftId: string; positionId: string; positionColor: string; edge: "start" | "end" } | null => {
  const { shifts, staffId, date, x, timeRange, threshold, hourWidth } = params;

  for (const shift of shifts) {
    if (shift.staffId !== staffId || shift.date !== date) {
      continue;
    }

    for (const pos of shift.positions) {
      const startX = minutesToPixel(timeToMinutes(pos.start), timeRange, hourWidth);
      const endX = minutesToPixel(timeToMinutes(pos.end), timeRange, hourWidth);

      if (Math.abs(x - startX) <= threshold) {
        return { shiftId: shift.id, positionId: pos.id, positionColor: pos.color, edge: "start" };
      }
      if (Math.abs(x - endX) <= threshold) {
        return { shiftId: shift.id, positionId: pos.id, positionColor: pos.color, edge: "end" };
      }
    }
  }

  return null;
};

// 連結リサイズ対象の検出（隣接バーの境界を検出、固定幅ベース）
export const detectLinkedResizeEdge = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  x: number;
  timeRange: TimeRange;
  threshold: number;
  hourWidth?: number;
}): { shiftId: string; linkedTarget: LinkedResizeTarget } | null => {
  const { shifts, staffId, date, x, timeRange, threshold, hourWidth } = params;

  const targetShift = shifts.find((shift) => shift.staffId === staffId && shift.date === date);
  if (!targetShift) return null;

  const sortedPositions = [...targetShift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  for (let i = 0; i < sortedPositions.length; i++) {
    const pos = sortedPositions[i];
    const prevPos = i > 0 ? sortedPositions[i - 1] : null;
    const nextPos = i < sortedPositions.length - 1 ? sortedPositions[i + 1] : null;

    const startX = minutesToPixel(timeToMinutes(pos.start), timeRange, hourWidth);
    const endX = minutesToPixel(timeToMinutes(pos.end), timeRange, hourWidth);

    if (Math.abs(x - startX) <= threshold) {
      const isLinkedToPrev = prevPos && prevPos.end === pos.start;
      return {
        shiftId: targetShift.id,
        linkedTarget: {
          prevPosition: isLinkedToPrev ? { positionId: prevPos.id, positionColor: prevPos.color } : null,
          nextPosition: { positionId: pos.id, positionColor: pos.color },
          boundaryMinutes: timeToMinutes(pos.start),
        },
      };
    }

    if (Math.abs(x - endX) <= threshold) {
      const isLinkedToNext = nextPos && pos.end === nextPos.start;
      return {
        shiftId: targetShift.id,
        linkedTarget: {
          prevPosition: { positionId: pos.id, positionColor: pos.color },
          nextPosition: isLinkedToNext ? { positionId: nextPos.id, positionColor: nextPos.color } : null,
          boundaryMinutes: timeToMinutes(pos.end),
        },
      };
    }
  }

  return null;
};
