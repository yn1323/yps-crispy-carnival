import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData } from "@/src/domains/shift/types";

export type ShiftPopoverViewModel = {
  requestLabel: string | null;
  showUnsubmittedBadge: boolean;
  showDeleteActions: boolean;
  segments: Array<{ id: string; timeLabel: string }>;
};

const formatRequestLabel = (shift: ShiftData, isStaffSubmitted: boolean): string => {
  const requestedTimes = shift.requestedTimes ?? [];
  if (requestedTimes.length > 0) {
    return `希望：${requestedTimes.map((request) => formatShiftClockTimeRange(request.start, request.end)).join(" / ")}`;
  }
  if (shift.requestedTime) {
    return `希望：${formatShiftClockTimeRange(shift.requestedTime.start, shift.requestedTime.end)}`;
  }
  // 提出済みで希望時間がない日は休み希望。未提出は希望自体がないため「なし」のまま。
  return isStaffSubmitted ? "希望：休み" : "希望：なし";
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
  const requestLabel = isReadOnly ? null : formatRequestLabel(shift, isStaffSubmitted);
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
