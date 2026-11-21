import type { PositionType, ShiftData, StaffType } from "./types";

export type ShiftTypeOptionLike = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

export const getRequestedShiftTypeOptionIds = (shift: ShiftData | undefined): string[] =>
  shift?.requestedShiftTypeOptionIds ?? [];

export const getAssignedShiftTypeOptionIds = (shift: ShiftData | undefined): string[] => {
  if (!shift) return [];
  const optionIds = shift.positions
    .map((position) => position.shiftTypeOptionId)
    .filter((optionId): optionId is string => !!optionId);
  return [...new Set(optionIds)];
};

export const getAssignedShiftTypeOptionIdsInOptionOrder = (
  shift: ShiftData | undefined,
  optionIds: string[],
): string[] => {
  const assignedIds = new Set(getAssignedShiftTypeOptionIds(shift));
  return optionIds.filter((optionId) => assignedIds.has(optionId));
};

export const countShiftTypeAssignments = (shifts: ShiftData[], optionIds: string[]): Map<string, number> => {
  const counts = new Map(optionIds.map((optionId) => [optionId, 0]));

  for (const shift of shifts) {
    for (const optionId of getAssignedShiftTypeOptionIds(shift)) {
      if (counts.has(optionId)) {
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      }
    }
  }

  return counts;
};

const toSegment = (staffId: string, date: string, option: ShiftTypeOptionLike, position: PositionType) => ({
  id: `seg-${staffId}-${date}-${option.id}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start: option.startTime,
  end: option.endTime,
  shiftTypeOptionId: option.id,
});

/**
 * 勤務パターンへ、指定したポジションで勤務を入れる。
 * すでに入っている勤務パターンでは、ポジションだけを入れ替える。1つの勤務パターンが持つポジションは1つである。
 */
export const setShiftTypeAssignment = ({
  shifts,
  staff,
  date,
  option,
  position,
}: {
  shifts: ShiftData[];
  staff: StaffType;
  date: string;
  option: ShiftTypeOptionLike;
  position: PositionType;
}): ShiftData[] => {
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
        positions: [toSegment(staff.id, date, option, position)],
      },
    ];
  }

  const isAssigned = targetShift.positions.some((segment) => segment.shiftTypeOptionId === option.id);
  const nextPositions = isAssigned
    ? targetShift.positions.map((segment) =>
        segment.shiftTypeOptionId === option.id
          ? { ...segment, positionId: position.id, positionName: position.name, color: position.color }
          : segment,
      )
    : [...targetShift.positions, toSegment(staff.id, date, option, position)];
  return shifts.map((shift) => (shift.id === targetShift.id ? { ...shift, positions: nextPositions } : shift));
};

/** 勤務パターンに入っている勤務を外す。入っていなければ何も変えない。 */
export const removeShiftTypeAssignment = ({
  shifts,
  staffId,
  date,
  optionId,
}: {
  shifts: ShiftData[];
  staffId: string;
  date: string;
  optionId: string;
}): ShiftData[] => {
  const targetShift = shifts.find((shift) => shift.staffId === staffId && shift.date === date);
  if (!targetShift?.positions.some((segment) => segment.shiftTypeOptionId === optionId)) return shifts;
  return shifts.map((shift) =>
    shift.id === targetShift.id
      ? { ...shift, positions: shift.positions.filter((segment) => segment.shiftTypeOptionId !== optionId) }
      : shift,
  );
};
