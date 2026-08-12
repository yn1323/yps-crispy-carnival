import { computeVisualBreaks, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionSegment, PositionType, ShiftData, TimeRange } from "@/src/domains/shift/types";

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

const getWorkPositions = (shift: ShiftData | undefined): PositionSegment[] =>
  shift
    ? [...shift.positions]
        .filter(isLegacyCompatibleWorkPosition)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    : [];

export type SPShiftEditState =
  | {
      kind: "editable";
      initialStart: string;
      initialEnd: string;
    }
  | {
      kind: "multiple";
      workPositions: PositionSegment[];
    };

export const getSPShiftEditState = (shift: ShiftData | undefined): SPShiftEditState => {
  const workPositions = getWorkPositions(shift);
  if (workPositions.length >= 2) {
    return { kind: "multiple", workPositions };
  }

  const workPosition = workPositions[0];
  return {
    kind: "editable",
    initialStart: workPosition?.start ?? "",
    initialEnd: workPosition?.end ?? "",
  };
};

export type SPShiftTimeEditResult =
  | { kind: "created"; shift: ShiftData }
  | { kind: "replaced"; shift: ShiftData }
  | { kind: "multiple"; workPositions: PositionSegment[] };

type BuildSPShiftTimeEditResultParams = {
  shift: ShiftData;
  positions: PositionType[];
  startTime: string;
  endTime: string;
  segmentId: string;
};

export const buildSPShiftTimeEditResult = ({
  shift,
  positions,
  startTime,
  endTime,
  segmentId,
}: BuildSPShiftTimeEditResultParams): SPShiftTimeEditResult => {
  const workPositions = getWorkPositions(shift);

  if (workPositions.length >= 2) {
    return { kind: "multiple", workPositions };
  }

  const workPosition = workPositions[0];
  if (workPosition) {
    return {
      kind: "replaced",
      shift: {
        ...shift,
        positions: [{ ...workPosition, start: startTime, end: endTime }],
      },
    };
  }

  const defaultPosition = resolveDefaultPosition(positions);
  return {
    kind: "created",
    shift: {
      ...shift,
      positions: [
        {
          id: segmentId,
          positionId: defaultPosition.id,
          positionName: defaultPosition.name,
          color: defaultPosition.color,
          start: startTime,
          end: endTime,
        },
      ],
    },
  };
};

export const timeToPercentage = (time: string, timeRange: TimeRange): number => {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  return (((hour - timeRange.start) * 60 + minute) / totalMinutes) * 100;
};

export const getAssignedRange = (shift: ShiftData | undefined): [string, string] | null => {
  const workPositions = getWorkPositions(shift);
  if (workPositions.length === 0) return null;
  return [workPositions[0].start, workPositions[workPositions.length - 1].end];
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
  const workPositions = getWorkPositions(shift);
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
