import { computeVisualBreaks } from "@/src/domains/shift/operations";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionSegment, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { BREAK_POSITION } from "../../constants";

export type TimelineBarViewModel = {
  key: string;
  leftPercentage: number;
  widthPercentage: number;
};

export type SPDailyCardViewModel = {
  hasAssignment: boolean;
  showRequestMismatch: boolean;
  showRestLabel: boolean;
  assignedTimeLabel: string | null;
  requestedBars: TimelineBarViewModel[];
  workBars: TimelineBarViewModel[];
  breakBars: TimelineBarViewModel[];
};

export const isBreakSegment = (position: PositionSegment): boolean =>
  position.positionName === BREAK_POSITION.name || position.positionId === BREAK_POSITION.id;

export const timeToPercentage = (time: string, timeRange: TimeRange): number => {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  return (((hour - timeRange.start) * 60 + minute) / totalMinutes) * 100;
};

export const getAssignedRange = (shift: ShiftData | undefined): [string, string] | null => {
  if (!shift || shift.positions.length === 0) return null;
  const workPositions = shift.positions.filter((position) => !isBreakSegment(position));
  if (workPositions.length === 0) return null;
  const sorted = [...workPositions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

const toTimelineBar = (key: string, start: string, end: string, timeRange: TimeRange): TimelineBarViewModel => {
  const leftPercentage = timeToPercentage(start, timeRange);
  return {
    key,
    leftPercentage,
    widthPercentage: timeToPercentage(end, timeRange) - leftPercentage,
  };
};

export const buildSPDailyCardViewModel = (shift: ShiftData | undefined, timeRange: TimeRange): SPDailyCardViewModel => {
  const requestedTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  const assignedRange = getAssignedRange(shift);
  const workPositions = shift
    ? [...shift.positions]
        .filter((position) => !isBreakSegment(position))
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    : [];
  const breaks = workPositions.length >= 2 ? computeVisualBreaks(workPositions) : [];

  return {
    hasAssignment: assignedRange !== null,
    showRequestMismatch: requestedTimes.length > 0 && assignedRange === null,
    showRestLabel: requestedTimes.length === 0 && assignedRange === null,
    assignedTimeLabel: assignedRange
      ? `${formatShiftClockTime(assignedRange[0])}–${formatShiftClockTime(assignedRange[1])}`
      : null,
    requestedBars: requestedTimes.map((request, index) =>
      toTimelineBar(`${request.start}-${request.end}-${index}`, request.start, request.end, timeRange),
    ),
    workBars: workPositions.map((position) => toTimelineBar(position.id, position.start, position.end, timeRange)),
    breakBars: breaks.map((gap) => toTimelineBar(`break-${gap.start}-${gap.end}`, gap.start, gap.end, timeRange)),
  };
};
