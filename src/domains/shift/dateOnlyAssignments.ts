import { DEFAULT_POSITION } from "./constants";
import { isCanonicalWorkPosition } from "./positions";
import { minutesToTime } from "./time";
import type { PositionType, ShiftData, StaffType, TimeRange } from "./types";

export const getDateOnlyAssignmentRange = (timeRange: TimeRange): { start: string; end: string } => ({
  start: minutesToTime(timeRange.editableStartMinutes ?? timeRange.start * 60),
  end: minutesToTime(timeRange.editableEndMinutes ?? timeRange.end * 60),
});

export const hasDateOnlyAssignment = (shift: ShiftData | undefined): boolean =>
  shift?.positions.some(isCanonicalWorkPosition) ?? false;

export const hasDateOnlyRequest = (shift: ShiftData | undefined): boolean =>
  !!shift?.requestedTime || (shift?.requestedTimes?.length ?? 0) > 0;

export const countDateOnlyAssignmentsByDate = (shifts: ShiftData[], dates: string[]): Map<string, number> => {
  const counts = new Map(dates.map((date) => [date, 0]));

  for (const shift of shifts) {
    if (counts.has(shift.date) && hasDateOnlyAssignment(shift)) {
      counts.set(shift.date, (counts.get(shift.date) ?? 0) + 1);
    }
  }

  return counts;
};

/**
 * その日に、選んだポジションで勤務を入れる。すでに勤務がある日は、ポジションだけを入れ替える。
 * 1人の1日に持てるポジションは1つである。
 */
export const setDateOnlyAssignment = ({
  shifts,
  staff,
  date,
  timeRange,
  position = DEFAULT_POSITION,
}: {
  shifts: ShiftData[];
  staff: StaffType;
  date: string;
  timeRange: TimeRange;
  position?: PositionType;
}): ShiftData[] => {
  const { start, end } = getDateOnlyAssignmentRange(timeRange);
  const positions = [
    {
      id: `seg-${staff.id}-${date}`,
      positionId: position.id,
      positionName: position.name,
      color: position.color,
      start,
      end,
    },
  ];
  const targetShift = shifts.find((shift) => shift.staffId === staff.id && shift.date === date);
  if (!targetShift) {
    return [
      ...shifts,
      {
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: null,
        positions,
      },
    ];
  }
  return shifts.map((shift) => (shift.id === targetShift.id ? { ...shift, positions } : shift));
};

/** その日の勤務を外す。希望は残す。 */
export const removeDateOnlyAssignment = ({
  shifts,
  staffId,
  date,
}: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
}): ShiftData[] =>
  shifts.map((shift) => (shift.staffId === staffId && shift.date === date ? { ...shift, positions: [] } : shift));
