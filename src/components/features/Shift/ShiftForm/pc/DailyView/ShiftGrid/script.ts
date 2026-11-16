import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { computeVisualBreaks } from "@/src/domains/shift/operations";
import { isLegacyCompatibleBreakPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { LinkedResizeTarget, ShiftData, TimeRange } from "@/src/domains/shift/types";

export type ShiftBarSegmentViewModel = {
  key: string;
  positionId: string;
  // ポジションの色。くわしく表示でポジションを塗り分けるときに使う。
  color: string;
  // 区間のポジション。そのポジションでの熟練度の印に使う。
  workPosition: { positionId: string; positionName: string };
  left: number;
  width: number;
  isResizing: boolean;
  edgeShape: "isolated" | "start" | "middle" | "end";
  // 熟練度の印（新・責）を、バーの右端に置けるかどうか。狭いバーと、勤務時刻のラベルに重なるバーには置かない。
  fitsSkillMark: boolean;
};

// 熟練度の印の幅と、バーの右端からの余白。
export const SKILL_MARK_WIDTH_PX = 16;
export const SKILL_MARK_INSET_PX = 3;
// 勤務時刻のラベル（「10:00–18:00」）が、勤務の左端から占める幅の目安。
const WORK_LABEL_RESERVED_PX = 88;

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
}: {
  shift: ShiftData;
  timeRange: TimeRange;
  hourWidth: number;
  isReadOnly: boolean;
  currentMinutes?: number;
  linkedTarget?: LinkedResizeTarget | null;
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

  const placedWorkBars = workPositions.flatMap((position, index): Omit<ShiftBarSegmentViewModel, "fitsSkillMark">[] => {
    const isResizingPrev = linkedTarget?.prevPosition?.positionId === position.id && currentMinutes !== undefined;
    const isResizingNext = linkedTarget?.nextPosition?.positionId === position.id && currentMinutes !== undefined;
    const isResizing = isResizingPrev || isResizingNext;
    const startMinutes =
      isResizingNext && currentMinutes !== undefined ? currentMinutes : timeToMinutes(position.start);
    const endMinutes = isResizingPrev && currentMinutes !== undefined ? currentMinutes : timeToMinutes(position.end);
    if (isResizing && endMinutes - startMinutes < timeRange.unit) return [];

    const segmentLeft = minutesToPixel(startMinutes, timeRange, hourWidth);
    const segmentRight = minutesToPixel(endMinutes, timeRange, hourWidth);
    const isAdjacentToPrev = index > 0 && workPositions[index - 1].end === position.start;
    const isAdjacentToNext = index < workPositions.length - 1 && position.end === workPositions[index + 1].start;
    return [
      {
        key: position.id,
        positionId: position.id,
        color: position.color,
        workPosition: { positionId: position.positionId, positionName: position.positionName },
        left: segmentLeft - left,
        width: segmentRight - segmentLeft,
        isResizing,
        edgeShape: getEdgeShape(isAdjacentToPrev, isAdjacentToNext),
      },
    ];
  });

  const breakBars = linkedTarget
    ? []
    : computeVisualBreaks(workPositions).map((gap): ShiftBarOverlayViewModel => {
        const start = minutesToPixel(timeToMinutes(gap.start), timeRange, hourWidth);
        const end = minutesToPixel(timeToMinutes(gap.end), timeRange, hourWidth);
        return { key: `break-${gap.start}-${gap.end}`, left: start - left, width: end - start };
      });
  const explicitBreakBars = linkedTarget
    ? []
    : getEffectiveBreaks({ positions: workPositions, breaks: shift.breaks }, { clipToWork: true }).map(
        (range): ShiftBarOverlayViewModel => {
          const start = minutesToPixel(timeToMinutes(range.start), timeRange, hourWidth);
          const end = minutesToPixel(timeToMinutes(range.end), timeRange, hourWidth);
          return { key: `explicit-break-${range.start}-${range.end}`, left: start - left, width: end - start };
        },
      );
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

  // 印は各バーの右端に置く。バーに収まり、勤務時刻のラベルに重ならないバーにだけ置く。
  const labelEnd = workLabel ? workLabel.left + WORK_LABEL_RESERVED_PX : Number.NEGATIVE_INFINITY;
  const workBars = placedWorkBars.map((bar): ShiftBarSegmentViewModel => {
    const markStart = bar.left + bar.width - SKILL_MARK_INSET_PX - SKILL_MARK_WIDTH_PX;
    return {
      ...bar,
      fitsSkillMark: !bar.isResizing && markStart >= bar.left + SKILL_MARK_INSET_PX && markStart >= labelEnd,
    };
  });

  return { shiftId: shift.id, left, width, requestedBars, workBars, breakBars, explicitBreakBars, workLabel };
};
