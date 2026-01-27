import {
  type LinkedResizeTarget,
  type PositionSegment,
  type ShiftData,
  TIME_AXIS_PADDING_PX,
  type TimeRange,
} from "../types";

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

// X座標（ピクセル） → 分 + unitスナップ（パディング考慮）
export const pixelToMinutes = (params: { x: number; containerWidth: number; timeRange: TimeRange }): number => {
  const { x, containerWidth, timeRange } = params;
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  // パディングを考慮した実際の時間軸エリア幅
  const effectiveWidth = containerWidth - TIME_AXIS_PADDING_PX * 2;
  // パディング分を引いたx座標
  const effectiveX = x - TIME_AXIS_PADDING_PX;
  const rawMinutes = (effectiveX / effectiveWidth) * totalMinutes + timeRange.start * 60;
  // unitにスナップ
  return Math.round(rawMinutes / timeRange.unit) * timeRange.unit;
};

// 分 → X座標（パーセント）
export const minutesToPercent = (minutes: number, timeRange: TimeRange): number => {
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  return ((minutes - timeRange.start * 60) / totalMinutes) * 100;
};

// パーセント値をcalc()式に変換（パディング考慮）
// percent=0 → left: 20px, percent=100 → left: calc(100% - 20px)
export const percentToCalcLeft = (percent: number, padding: number = TIME_AXIS_PADDING_PX): string => {
  return `calc(${padding}px + (100% - ${padding * 2}px) * ${percent / 100})`;
};

// 幅のパーセント値をcalc()式に変換（パディング考慮）
export const percentToCalcWidth = (widthPercent: number, padding: number = TIME_AXIS_PADDING_PX): string => {
  return `calc((100% - ${padding * 2}px) * ${widthPercent / 100})`;
};

// === シフト検索ユーティリティ ===

// 指定位置のシフトを検索（希望シフト時間内かどうかに関わらず、スタッフのシフトを返す）
export const findShiftAtPosition = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  minutes: number;
}): ShiftData | null => {
  const { shifts, staffId, date } = params;
  // スタッフの当日シフトを返す（希望時間外にもポジションを塗れるため、位置は問わない）
  return shifts.find((shift) => shift.staffId === staffId && shift.date === date) ?? null;
};

// ポジションバー端（リサイズ対象）の検出（パディング考慮）
export const detectPositionResizeEdge = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  x: number;
  containerWidth: number;
  timeRange: TimeRange;
  threshold: number;
}): { shiftId: string; positionId: string; positionColor: string; edge: "start" | "end" } | null => {
  const { shifts, staffId, date, x, containerWidth, timeRange, threshold } = params;

  // パディングを考慮した実際の時間軸エリア幅
  const effectiveWidth = containerWidth - TIME_AXIS_PADDING_PX * 2;

  for (const shift of shifts) {
    if (shift.staffId !== staffId || shift.date !== date) {
      continue;
    }

    for (const pos of shift.positions) {
      const startPercent = minutesToPercent(timeToMinutes(pos.start), timeRange);
      const endPercent = minutesToPercent(timeToMinutes(pos.end), timeRange);
      // パディング分を加算してピクセル位置を計算
      const startX = TIME_AXIS_PADDING_PX + (startPercent / 100) * effectiveWidth;
      const endX = TIME_AXIS_PADDING_PX + (endPercent / 100) * effectiveWidth;

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

// 連結リサイズ対象の検出（隣接バーの境界を検出、パディング考慮）
export const detectLinkedResizeEdge = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  x: number;
  containerWidth: number;
  timeRange: TimeRange;
  threshold: number;
}): { shiftId: string; linkedTarget: LinkedResizeTarget } | null => {
  const { shifts, staffId, date, x, containerWidth, timeRange, threshold } = params;

  const targetShift = shifts.find((shift) => shift.staffId === staffId && shift.date === date);
  if (!targetShift) return null;

  // パディングを考慮した実際の時間軸エリア幅
  const effectiveWidth = containerWidth - TIME_AXIS_PADDING_PX * 2;

  // ポジションを時間順にソート
  const sortedPositions = [...targetShift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  // 各ポジションの端を走査
  for (let i = 0; i < sortedPositions.length; i++) {
    const pos = sortedPositions[i];
    const prevPos = i > 0 ? sortedPositions[i - 1] : null;
    const nextPos = i < sortedPositions.length - 1 ? sortedPositions[i + 1] : null;

    const startPercent = minutesToPercent(timeToMinutes(pos.start), timeRange);
    const endPercent = minutesToPercent(timeToMinutes(pos.end), timeRange);
    // パディング分を加算してピクセル位置を計算
    const startX = TIME_AXIS_PADDING_PX + (startPercent / 100) * effectiveWidth;
    const endX = TIME_AXIS_PADDING_PX + (endPercent / 100) * effectiveWidth;

    // start側の判定（連結 or 単独）
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

    // end側の判定（連結 or 単独）
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

// 指定位置のポジションセグメントを検索
export const findPositionAtPosition = (params: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  minutes: number;
}): { shiftId: string; positionId: string } | null => {
  const { shifts, staffId, date, minutes } = params;

  for (const shift of shifts) {
    if (shift.staffId !== staffId || shift.date !== date) {
      continue;
    }

    for (const pos of shift.positions) {
      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);

      if (minutes >= posStart && minutes < posEnd) {
        return { shiftId: shift.id, positionId: pos.id };
      }
    }
  }

  return null;
};

// === ポジション操作（希望シフトバーは編集不可） ===

// ポジション消去（指定範囲のポジションセグメントを削除）
export const erasePosition = (params: { shift: ShiftData; startMinutes: number; endMinutes: number }): ShiftData => {
  const { shift, startMinutes, endMinutes } = params;

  const [eraseStart, eraseEnd] = startMinutes < endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];

  // 既存ポジションとの重複処理（削除/分割）
  const adjustedPositions = shift.positions
    .flatMap((pos) => {
      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);

      // 完全に消去範囲内 → 削除
      if (posStart >= eraseStart && posEnd <= eraseEnd) {
        return null;
      }

      // 重複なし → そのまま
      if (posEnd <= eraseStart || posStart >= eraseEnd) {
        return pos;
      }

      // 部分重複 → 分割 or カット
      const segments: PositionSegment[] = [];

      // 前半残り
      if (posStart < eraseStart) {
        segments.push({
          ...pos,
          id: `${pos.id}-before`,
          end: minutesToTime(eraseStart),
        });
      }

      // 後半残り
      if (posEnd > eraseEnd) {
        segments.push({
          ...pos,
          id: `${pos.id}-after`,
          start: minutesToTime(eraseEnd),
        });
      }

      return segments.length === 1 ? segments[0] : segments;
    })
    .filter((pos): pos is PositionSegment => pos !== null);

  return {
    ...shift,
    positions: adjustedPositions,
  };
};

// ポジションリサイズ（希望シフト時間は変更しない）
export const resizePosition = (params: {
  shift: ShiftData;
  positionId: string;
  edge: "start" | "end";
  newMinutes: number;
  minDuration: number;
}): ShiftData => {
  const { shift, positionId, edge, newMinutes, minDuration } = params;

  const targetPosition = shift.positions.find((pos) => pos.id === positionId);
  if (!targetPosition) return shift;

  const currentPosStart = timeToMinutes(targetPosition.start);
  const currentPosEnd = timeToMinutes(targetPosition.end);

  let newPosStart = currentPosStart;
  let newPosEnd = currentPosEnd;

  if (edge === "start") {
    newPosStart = Math.min(newMinutes, currentPosEnd - minDuration);
  } else {
    newPosEnd = Math.max(newMinutes, currentPosStart + minDuration);
  }

  // 他のポジションとの重複処理（上書き）
  const adjustedPositions = shift.positions
    .flatMap((pos) => {
      if (pos.id === positionId) {
        return {
          ...pos,
          start: minutesToTime(newPosStart),
          end: minutesToTime(newPosEnd),
        };
      }

      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);

      // 完全に上書き → 削除
      if (posStart >= newPosStart && posEnd <= newPosEnd) {
        return null;
      }

      // 重複なし → そのまま
      if (posEnd <= newPosStart || posStart >= newPosEnd) {
        return pos;
      }

      // 部分重複 → 分割 or カット
      const segments: PositionSegment[] = [];

      // 前半残り
      if (posStart < newPosStart) {
        segments.push({
          ...pos,
          id: `${pos.id}-before`,
          end: minutesToTime(newPosStart),
        });
      }

      // 後半残り
      if (posEnd > newPosEnd) {
        segments.push({
          ...pos,
          id: `${pos.id}-after`,
          start: minutesToTime(newPosEnd),
        });
      }

      return segments.length === 1 ? segments[0] : segments;
    })
    .filter((pos): pos is PositionSegment => pos !== null);

  // 希望シフト時間（requestedTime）は変更しない
  return {
    ...shift,
    positions: adjustedPositions,
  };
};

// 連結リサイズ（隣接する2つのポジションの境界を同時に移動）
// 隣接バーがUNIT未満になる場合はそのバーを削除（上書き）する
export const resizeLinkedPositions = (params: {
  shift: ShiftData;
  linkedTarget: LinkedResizeTarget;
  newMinutes: number;
  minDuration: number;
}): ShiftData => {
  const { shift, linkedTarget, newMinutes, minDuration } = params;
  const { prevPosition, nextPosition } = linkedTarget;

  // prev/nextの実体を取得
  const prev = prevPosition ? shift.positions.find((p) => p.id === prevPosition.positionId) : null;
  const next = nextPosition ? shift.positions.find((p) => p.id === nextPosition.positionId) : null;

  const prevStart = prev ? timeToMinutes(prev.start) : 0;
  const nextEnd = next ? timeToMinutes(next.end) : 24 * 60;

  // UNIT未満になるバーを判定
  const shouldDeletePrev = prev && newMinutes - prevStart < minDuration;
  const shouldDeleteNext = next && nextEnd - newMinutes < minDuration;

  // ポジションを更新（UNIT未満のバーは削除）
  const updatedPositions = shift.positions
    .filter((pos) => {
      if (shouldDeletePrev && prevPosition && pos.id === prevPosition.positionId) return false;
      if (shouldDeleteNext && nextPosition && pos.id === nextPosition.positionId) return false;
      return true;
    })
    .map((pos) => {
      if (!shouldDeletePrev && prevPosition && pos.id === prevPosition.positionId) {
        return { ...pos, end: minutesToTime(newMinutes) };
      }
      if (!shouldDeleteNext && nextPosition && pos.id === nextPosition.positionId) {
        return { ...pos, start: minutesToTime(newMinutes) };
      }
      return pos;
    });

  return { ...shift, positions: updatedPositions };
};

// ポジション塗り（希望シフト時間は変更しない + 重複上書き含む）
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

  const [paintStart, paintEnd] = startMinutes < endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];

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

  // 希望シフト時間（requestedTime）は変更しない
  return {
    ...shift,
    positions: [...adjustedPositions, newPosition],
  };
};

// === 正規化ユーティリティ ===

// 同一positionIdの隣接/重複バーをマージ
export const mergeAdjacentPositions = (positions: PositionSegment[]): PositionSegment[] => {
  if (positions.length <= 1) return positions;

  const sorted = [...positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  const merged: PositionSegment[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    const lastEnd = timeToMinutes(last.end);
    const currentStart = timeToMinutes(current.start);

    // 同じpositionIdかつ隣接(end === start)または重複(end > start)
    if (current.positionId === last.positionId && lastEnd >= currentStart) {
      const newEnd = Math.max(lastEnd, timeToMinutes(current.end));
      merged[merged.length - 1] = {
        ...last,
        end: minutesToTime(newEnd),
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
};

// バー間の空白を休憩で埋める（端は埋めない）
export const fillGapsWithBreak = (params: {
  positions: PositionSegment[];
  breakPosition: { id: string; name: string; color: string };
}): PositionSegment[] => {
  const { positions, breakPosition } = params;

  if (positions.length <= 1) return positions;

  const sorted = [...positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  const result: PositionSegment[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const current = sorted[i];

    const prevEnd = timeToMinutes(prev.end);
    const currentStart = timeToMinutes(current.start);

    if (currentStart > prevEnd) {
      result.push({
        id: `break-${prevEnd}-${currentStart}`,
        positionId: breakPosition.id,
        positionName: breakPosition.name,
        color: breakPosition.color,
        start: minutesToTime(prevEnd),
        end: minutesToTime(currentStart),
      });
    }

    result.push(current);
  }

  return result;
};

// 正規化パイプライン: 休憩除去 → マージ → ギャップ埋め
export const normalizePositions = (params: {
  positions: PositionSegment[];
  breakPosition: { id: string; name: string; color: string };
}): PositionSegment[] => {
  const { positions, breakPosition } = params;

  if (positions.length === 0) return positions;

  // 既存の休憩バーを除去（再計算するため）
  const nonBreakPositions = positions.filter((p) => p.positionId !== breakPosition.id);

  if (nonBreakPositions.length === 0) return [];

  // 同一positionIdの隣接/重複バーをマージ
  const merged = mergeAdjacentPositions(nonBreakPositions);

  // ギャップに休憩を挿入
  return fillGapsWithBreak({ positions: merged, breakPosition });
};

// ポジション削除（休憩削除時は前のバーを延長）
export const deletePositionFromShift = (params: {
  shift: ShiftData;
  positionSegmentId: string;
  breakPositionId: string;
}): ShiftData => {
  const { shift, positionSegmentId, breakPositionId } = params;

  const target = shift.positions.find((p) => p.id === positionSegmentId);
  if (!target) return shift;

  const isBreak = target.positionId === breakPositionId;

  if (!isBreak) {
    // 非休憩: 単純削除（正規化で休憩が自動挿入される）
    return {
      ...shift,
      positions: shift.positions.filter((p) => p.id !== positionSegmentId),
    };
  }

  // 休憩削除: 前のバーを延長して隙間を埋める
  const sorted = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const sortedIndex = sorted.findIndex((p) => p.id === positionSegmentId);
  const prevBar = sortedIndex > 0 ? sorted[sortedIndex - 1] : null;

  if (prevBar && prevBar.positionId !== breakPositionId) {
    return {
      ...shift,
      positions: shift.positions
        .filter((p) => p.id !== positionSegmentId)
        .map((p) => (p.id === prevBar.id ? { ...p, end: target.end } : p)),
    };
  }

  // 前のバーがない or 前も休憩: 単純削除
  return {
    ...shift,
    positions: shift.positions.filter((p) => p.id !== positionSegmentId),
  };
};
