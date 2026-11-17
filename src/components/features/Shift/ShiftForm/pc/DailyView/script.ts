import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData } from "@/src/domains/shift/types";

export type ShiftPopoverViewModel = {
  requestLabel: string | null;
  showUnsubmittedBadge: boolean;
  showDeleteActions: boolean;
  segments: Array<{
    id: string;
    /** この行が表す勤務区間。シンプル表示では、ポジションの違う隣り合う区間を1行にまとめるため、複数になる。 */
    segmentIds: string[];
    timeLabel: string;
    positionId: string;
    positionName: string;
    color: string;
  }>;
  // 時刻で入れた休憩の表示
  breakLabels: string[];
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
  mergesAcrossPositions = false,
}: {
  shift: ShiftData;
  isStaffSubmitted: boolean;
  isReadOnly: boolean;
  /** ポジションを見せない表示（シンプル表示）ではtrue。ポジションだけが違う隣り合う区間を、続いた1つの勤務時間として出す。 */
  mergesAcrossPositions?: boolean;
}): ShiftPopoverViewModel => {
  const requestLabel = isReadOnly ? null : formatRequestLabel(shift, isStaffSubmitted);
  const workPositions = [...shift.positions]
    .filter(isLegacyCompatibleWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const groups: Array<{ first: (typeof workPositions)[number]; end: string; segmentIds: string[] }> = [];
  for (const position of workPositions) {
    const last = groups[groups.length - 1];
    if (mergesAcrossPositions && last && timeToMinutes(last.end) >= timeToMinutes(position.start)) {
      if (timeToMinutes(position.end) > timeToMinutes(last.end)) last.end = position.end;
      last.segmentIds.push(position.id);
    } else {
      groups.push({ first: position, end: position.end, segmentIds: [position.id] });
    }
  }
  const segments = groups.map(({ first, end, segmentIds }) => ({
    id: first.id,
    segmentIds,
    timeLabel: formatShiftClockTimeRange(first.start, end),
    positionId: first.positionId,
    positionName: first.positionName,
    color: first.color,
  }));
  const breakLabels = getEffectiveBreaks(shift, { clipToWork: true }).map((range) =>
    formatShiftClockTimeRange(range.start, range.end),
  );

  return {
    requestLabel,
    showUnsubmittedBadge: !isReadOnly && !isStaffSubmitted,
    showDeleteActions: !isReadOnly,
    segments,
    breakLabels,
  };
};
