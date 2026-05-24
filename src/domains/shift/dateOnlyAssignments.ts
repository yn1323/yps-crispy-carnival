import { BREAK_POSITION, DEFAULT_POSITION } from "./constants";
import { minutesToTime } from "./time";
import type { PositionType, ShiftData, StaffType, TimeRange } from "./types";

type ToggleDateOnlyAssignmentParams = {
  shifts: ShiftData[];
  staff: StaffType;
  date: string;
  timeRange: TimeRange;
  position?: PositionType;
};

export const getDateOnlyAssignmentRange = (timeRange: TimeRange): { start: string; end: string } => ({
  start: minutesToTime(timeRange.editableStartMinutes ?? timeRange.start * 60),
  end: minutesToTime(timeRange.editableEndMinutes ?? timeRange.end * 60),
});

export const hasDateOnlyAssignment = (shift: ShiftData | undefined): boolean =>
  shift?.positions.some((position) => position.positionId !== BREAK_POSITION.id) ?? false;

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

export const toggleDateOnlyAssignment = ({
  shifts,
  staff,
  date,
  timeRange,
  position = DEFAULT_POSITION,
}: ToggleDateOnlyAssignmentParams): ShiftData[] => {
  const targetShift = shifts.find((shift) => shift.staffId === staff.id && shift.date === date);

  if (!targetShift) {
    const { start, end } = getDateOnlyAssignmentRange(timeRange);
    return [
      ...shifts,
      {
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: null,
        positions: [
          {
            id: `seg-${staff.id}-${date}`,
            positionId: position.id,
            positionName: position.name,
            color: position.color,
            start,
            end,
          },
        ],
      },
    ];
  }

  if (hasDateOnlyAssignment(targetShift)) {
    return shifts.map((shift) => (shift.id === targetShift.id ? { ...shift, positions: [] } : shift));
  }

  const { start, end } = getDateOnlyAssignmentRange(timeRange);
  return shifts.map((shift) =>
    shift.id === targetShift.id
      ? {
          ...shift,
          positions: [
            {
              id: `seg-${staff.id}-${date}`,
              positionId: position.id,
              positionName: position.name,
              color: position.color,
              start,
              end,
            },
          ],
        }
      : shift,
  );
};
