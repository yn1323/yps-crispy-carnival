import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { computeVisualBreaks } from "@/src/domains/shift/operations";
import { isLegacyCompatibleBreakPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { LinkedResizeTarget, ShiftData, TimeRange } from "@/src/domains/shift/types";

export type ShiftBarSegmentViewModel = {
  key: string;
  positionId: string;
  // ポジションの色。くわしく表示でポジションを塗り分けるときに使う。
  color: string;
  left: number;
  width: number;
  isResizing: boolean;
  edgeShape: "isolated" | "start" | "middle" | "end";
};

export type ShiftBarOverlayViewModel = {
  key: string;
  left: number;
  width: number;
};

export type ShiftBarRequestViewModel = ShiftBarOverlayViewModel & {
  label: string;
};

export type ShiftBarLabelViewModel = {
  left: number;
  width: number;
  label: string;
};

export type ShiftBarViewModel = {
  shiftId: string;
  left: number;
  width: number;
  requestedBars: ShiftBarRequestViewModel[];
  workBars: ShiftBarSegmentViewModel[];
  breakBars: ShiftBarOverlayViewModel[];
  // 時刻で入れた休憩。勤務のバーの内側に重ねる。
  explicitBreakBars: ShiftBarOverlayViewModel[];
  workLabel: ShiftBarLabelViewModel | null;
};

const getEdgeShape = (isAdjacentToPrev: boolean, isAdjacentToNext: boolean): ShiftBarSegmentViewModel["edgeShape"] => {
  if (!isAdjacentToPrev && !isAdjacentToNext) return "isolated";
  if (!isAdjacentToPrev) return "start";
  if (!isAdjacentToNext) return "end";
  return "middle";
};

export const buildShiftBarViewModel = ({
  shift,
  timeRange,
  hourWidth,
  isReadOnly,
  currentMinutes,
  linkedTarget,
  breakResize,
}: {
  shift: ShiftData;
  timeRange: TimeRange;
  hourWidth: number;
  isReadOnly: boolean;
  currentMinutes?: number;
  linkedTarget?: LinkedResizeTarget | null;
  /** 休憩の端をつまんで動かしている間の、動かす前の休憩と、動かしている途中の休憩（分）。 */
  breakResize?: { from: { start: number; end: number }; to: { start: number; end: number } } | null;
}): ShiftBarViewModel | null => {
  const requestedTimes = shift.requestedTimes ?? (shift.requestedTime ? [shift.requestedTime] : []);
  const hasRequestedTime = requestedTimes.length > 0;
  if (!hasRequestedTime && shift.positions.length === 0) return null;

  const workPositions = [...shift.positions]
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    .filter((position) => !isLegacyCompatibleBreakPosition(position));
  const requestedStartMinutes = hasRequestedTime
    ? Math.min(...requestedTimes.map((request) => timeToMinutes(request.start)))
    : timeRange.start * 60;
  const requestedEndMinutes = hasRequestedTime
    ? Math.max(...requestedTimes.map((request) => timeToMinutes(request.end)))
    : timeRange.end * 60;
  const left = minutesToPixel(requestedStartMinutes, timeRange, hourWidth);
  const width = minutesToPixel(requestedEndMinutes, timeRange, hourWidth) - left;

  const requestedBars = isReadOnly
    ? []
    : requestedTimes.map((request, index): ShiftBarRequestViewModel => {
        const start = minutesToPixel(timeToMinutes(request.start), timeRange, hourWidth);
        const end = minutesToPixel(timeToMinutes(request.end), timeRange, hourWidth);
        return {
          key: `${request.start}-${request.end}-${index}`,
          left: start - left,
          width: end - start,
          label: `希望：${formatShiftClockTime(request.start)}-${formatShiftClockTime(request.end)}`,
        };
      });

  // 勤務の長さを変えている間は、動かしている途中の時刻で描く。
  const previewWork = workPositions.flatMap((position, index) => {
    const isResizingPrev = linkedTarget?.prevPosition?.positionId === position.id && currentMinutes !== undefined;
    const isResizingNext = linkedTarget?.nextPosition?.positionId === position.id && currentMinutes !== undefined;
    const isResizing = isResizingPrev || isResizingNext;
    const startMinutes =
      isResizingNext && currentMinutes !== undefined ? currentMinutes : timeToMinutes(position.start);
    const endMinutes = isResizingPrev && currentMinutes !== undefined ? currentMinutes : timeToMinutes(position.end);
    if (isResizing && endMinutes - startMinutes < timeRange.unit) return [];
    return [{ position, index, isResizing, startMinutes, endMinutes }];
  });

  const workBars = previewWork.map(
    ({ position, index, isResizing, startMinutes, endMinutes }): ShiftBarSegmentViewModel => {
      const segmentLeft = minutesToPixel(startMinutes, timeRange, hourWidth);
      const segmentRight = minutesToPixel(endMinutes, timeRange, hourWidth);
      // 勤務の間の空きは休憩の斜線で埋めるため、空きをはさむ場合も、隣り合う場合と同じく角を丸めない。
      // 休憩を勤務の内側へ入れた場合と、別の勤務を離して入れて休憩ができた場合で、形をそろえる。
      const isAdjacentToPrev = index > 0;
      const isAdjacentToNext = index < workPositions.length - 1;
      return {
        key: position.id,
        positionId: position.id,
        color: position.color,
        left: segmentLeft - left,
        width: segmentRight - segmentLeft,
        isResizing,
        edgeShape: getEdgeShape(isAdjacentToPrev, isAdjacentToNext),
      };
    },
  );

  // 休憩は、勤務の長さを変えている間も出し続ける。動かしている途中の勤務に合わせ、勤務の外へ出た休憩は出さない。
  const previewPositions = previewWork.map(({ position, startMinutes, endMinutes }) => ({
    ...position,
    start: minutesToTime(startMinutes),
    end: minutesToTime(endMinutes),
  }));
  const breakBars = computeVisualBreaks(previewPositions).map((gap): ShiftBarOverlayViewModel => {
    const start = minutesToPixel(timeToMinutes(gap.start), timeRange, hourWidth);
    const end = minutesToPixel(timeToMinutes(gap.end), timeRange, hourWidth);
    return { key: `break-${gap.start}-${gap.end}`, left: start - left, width: end - start };
  });
  const explicitBreakBars = getEffectiveBreaks(
    { positions: previewPositions, breaks: shift.breaks },
    { clipToWork: true },
  ).map((range): ShiftBarOverlayViewModel => {
    const minutes = { start: timeToMinutes(range.start), end: timeToMinutes(range.end) };
    // 休憩の端をつまんで動かしている間は、その休憩だけを、動かしている途中の時刻で描く。
    const shown =
      breakResize && breakResize.from.start === minutes.start && breakResize.from.end === minutes.end
        ? breakResize.to
        : minutes;
    const start = minutesToPixel(shown.start, timeRange, hourWidth);
    const end = minutesToPixel(shown.end, timeRange, hourWidth);
    return { key: `explicit-break-${range.start}-${range.end}`, left: start - left, width: end - start };
  });
  const firstWork = workPositions[0];
  const lastWork = workPositions[workPositions.length - 1];
  const workLabel =
    linkedTarget || !firstWork || !lastWork
      ? null
      : (() => {
          const start = minutesToPixel(timeToMinutes(firstWork.start), timeRange, hourWidth);
          const end = minutesToPixel(timeToMinutes(lastWork.end), timeRange, hourWidth);
          return {
            left: start - left,
            width: end - start,
            label: `${formatShiftClockTime(firstWork.start)}–${formatShiftClockTime(lastWork.end)}`,
          };
        })();

  return { shiftId: shift.id, left, width, requestedBars, workBars, breakBars, explicitBreakBars, workLabel };
};
