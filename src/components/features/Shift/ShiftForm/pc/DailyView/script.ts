import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData } from "@/src/domains/shift/types";

export type ShiftPopoverViewModel = {
  requestLabel: string | null;
  showUnsubmittedBadge: boolean;
  showDeleteActions: boolean;
  segments: Array<{ id: string; timeLabel: string }>;
};

export const buildShiftPopoverViewModel = ({
  shift,
  isStaffSubmitted,
  isReadOnly,
}: {
  shift: ShiftData;
  isStaffSubmitted: boolean;
  isReadOnly: boolean;
}): ShiftPopoverViewModel => {
  const requestedTimes = shift.requestedTimes ?? [];
  const requestLabel = isReadOnly
    ? null
    : requestedTimes.length > 0
      ? `希望：${requestedTimes.map((request) => formatShiftClockTimeRange(request.start, request.end)).join(" / ")}`
      : shift.requestedTime
        ? `希望：${formatShiftClockTimeRange(shift.requestedTime.start, shift.requestedTime.end)}`
        : "希望：なし";
  const segments = [...shift.positions]
    .filter(isLegacyCompatibleWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    .map((position) => ({
      id: position.id,
      timeLabel: formatShiftClockTimeRange(position.start, position.end),
    }));

  return {
    requestLabel,
    showUnsubmittedBadge: !isReadOnly && !isStaffSubmitted,
    showDeleteActions: !isReadOnly,
    segments,
  };
};
