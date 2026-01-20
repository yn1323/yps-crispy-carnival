import type { PositionSegment, ShiftData, TimeRange } from "../types";

// === 時間変換ユーティリティ ===

// 時刻文字列 → 分（"10:30" → 630）
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// 分 → 時刻文字列（630 → "10:30"）
export const minutesToTime = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

// X座標（ピクセル） → 分 + unitスナップ
export const pixelToMinutes = (params: { x: number; containerWidth: number; timeRange: TimeRange }): number => {
  const { x, containerWidth, timeRange } = params;
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  const rawMinutes = (x / containerWidth) * totalMinutes + timeRange.start * 60;
  // unitにスナップ
  return Math.round(rawMinutes / timeRange.unit) * timeRange.unit;
};

// 分 → X座標（パーセント）
export const minutesToPercent = (minutes: number, timeRange: TimeRange): number => {
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  return ((minutes - timeRange.start * 60) / totalMinutes) * 100;
};

// === シフト検索ユーティリティ ===

// 指定位置のシフトを検索
export const findShiftAtPosition = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  minutes: number;
}): ShiftData | null => {
  const { shifts, staffId, date, minutes } = params;
  return (
    shifts.find((shift) => {
      if (shift.staffId !== staffId || shift.date !== date || !shift.workingTime) {
        return false;
      }
      const start = timeToMinutes(shift.workingTime.start);
      const end = timeToMinutes(shift.workingTime.end);
      return minutes >= start && minutes <= end;
    }) ?? null
  );
};

// バー端（リサイズ対象）の検出
export const detectResizeEdge = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  x: number;
  containerWidth: number;
  timeRange: TimeRange;
  threshold: number;
}): { shiftId: string; edge: "start" | "end" } | null => {
  const { shifts, staffId, date, x, containerWidth, timeRange, threshold } = params;

  for (const shift of shifts) {
    if (shift.staffId !== staffId || shift.date !== date || !shift.workingTime) {
      continue;
    }

    const startPercent = minutesToPercent(timeToMinutes(shift.workingTime.start), timeRange);
    const endPercent = minutesToPercent(timeToMinutes(shift.workingTime.end), timeRange);
    const startX = (startPercent / 100) * containerWidth;
    const endX = (endPercent / 100) * containerWidth;

    if (Math.abs(x - startX) <= threshold) {
      return { shiftId: shift.id, edge: "start" };
    }
    if (Math.abs(x - endX) <= threshold) {
      return { shiftId: shift.id, edge: "end" };
    }
  }

  return null;
};

// === シフト操作（エッジケース対応） ===

// 新規シフト作成
export const createShift = (params: {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
}): ShiftData => {
  const { id, staffId, staffName, date, startMinutes, endMinutes } = params;
  const [actualStart, actualEnd] = startMinutes < endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];

  return {
    id,
    staffId,
    staffName,
    date,
    workingTime: {
      start: minutesToTime(actualStart),
      end: minutesToTime(actualEnd),
    },
    positions: [],
  };
};

// シフトリサイズ（ポジション自動カット含む）
export const resizeShift = (params: {
  shift: ShiftData;
  edge: "start" | "end";
  newMinutes: number;
  minDuration: number;
}): ShiftData => {
  const { shift, edge, newMinutes, minDuration } = params;
  if (!shift.workingTime) return shift;

  const currentStart = timeToMinutes(shift.workingTime.start);
  const currentEnd = timeToMinutes(shift.workingTime.end);

  let newStart = currentStart;
  let newEnd = currentEnd;

  if (edge === "start") {
    newStart = Math.min(newMinutes, currentEnd - minDuration);
  } else {
    newEnd = Math.max(newMinutes, currentStart + minDuration);
  }

  // ポジション色の自動カット
  const adjustedPositions = shift.positions
    .map((pos) => {
      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);

      // 完全にはみ出し → 削除
      if (posEnd <= newStart || posStart >= newEnd) {
        return null;
      }

      // 部分的にはみ出し → カット
      return {
        ...pos,
        start: minutesToTime(Math.max(posStart, newStart)),
        end: minutesToTime(Math.min(posEnd, newEnd)),
      };
    })
    .filter((pos): pos is PositionSegment => pos !== null);

  return {
    ...shift,
    workingTime: {
      start: minutesToTime(newStart),
      end: minutesToTime(newEnd),
    },
    positions: adjustedPositions,
  };
};

// ポジション塗り（労働時間自動延長 + 重複上書き含む）
export const paintPosition = (params: {
  shift: ShiftData;
  positionId: string;
  positionName: string;
  positionColor: string;
  startMinutes: number;
  endMinutes: number;
  segmentId: string;
}): ShiftData => {
  const { shift, positionId, positionName, positionColor, startMinutes, endMinutes, segmentId } = params;
  if (!shift.workingTime) return shift;

  const [paintStart, paintEnd] = startMinutes < endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];

  const workStart = timeToMinutes(shift.workingTime.start);
  const workEnd = timeToMinutes(shift.workingTime.end);

  // 労働時間の自動延長
  const newWorkStart = Math.min(workStart, paintStart);
  const newWorkEnd = Math.max(workEnd, paintEnd);

  // 既存ポジションとの重複処理（上書き）
  const adjustedPositions = shift.positions
    .flatMap((pos) => {
      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);

      // 完全に上書き → 削除
      if (posStart >= paintStart && posEnd <= paintEnd) {
        return null;
      }

      // 重複なし → そのまま
      if (posEnd <= paintStart || posStart >= paintEnd) {
        return pos;
      }

      // 部分重複 → 分割 or カット
      const segments: PositionSegment[] = [];

      // 前半残り
      if (posStart < paintStart) {
        segments.push({
          ...pos,
          id: `${pos.id}-before`,
          end: minutesToTime(paintStart),
        });
      }

      // 後半残り
      if (posEnd > paintEnd) {
        segments.push({
          ...pos,
          id: `${pos.id}-after`,
          start: minutesToTime(paintEnd),
        });
      }

      return segments.length === 1 ? segments[0] : segments;
    })
    .filter((pos): pos is PositionSegment => pos !== null);

  // 新しいポジション追加
  const newPosition: PositionSegment = {
    id: segmentId,
    positionId,
    positionName,
    color: positionColor,
    start: minutesToTime(paintStart),
    end: minutesToTime(paintEnd),
  };

  return {
    ...shift,
    workingTime: {
      start: minutesToTime(newWorkStart),
      end: minutesToTime(newWorkEnd),
    },
    positions: [...adjustedPositions, newPosition],
  };
};

// workingTimeが存在するシフトの型
type ShiftWithWorkingTime = ShiftData & { workingTime: NonNullable<ShiftData["workingTime"]> };

// 型ガード関数
const hasWorkingTime = (shift: ShiftData): shift is ShiftWithWorkingTime => {
  return shift.workingTime !== null;
};

// シフト結合（重複バー同士）
export const mergeOverlappingShifts = (params: { shifts: ShiftData[]; staffId: string; date: string }): ShiftData[] => {
  const { shifts, staffId, date } = params;

  const staffShifts = shifts.filter((s) => s.staffId === staffId && s.date === date).filter(hasWorkingTime);
  const otherShifts = shifts.filter((s) => s.staffId !== staffId || s.date !== date);

  if (staffShifts.length <= 1) return shifts;

  // 開始時間でソート
  const sorted = [...staffShifts].sort(
    (a, b) => timeToMinutes(a.workingTime.start) - timeToMinutes(b.workingTime.start),
  );

  const merged: ShiftWithWorkingTime[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = timeToMinutes(current.workingTime.end);
    const nextStart = timeToMinutes(next.workingTime.start);

    if (nextStart <= currentEnd) {
      // 重複 → 結合
      const newEnd = Math.max(currentEnd, timeToMinutes(next.workingTime.end));
      current = {
        ...current,
        workingTime: {
          start: current.workingTime.start,
          end: minutesToTime(newEnd),
        },
        positions: [...current.positions, ...next.positions],
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return [...otherShifts, ...merged];
};
