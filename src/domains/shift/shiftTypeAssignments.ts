import type { PositionType, ShiftData, StaffType } from "./types";

export type ShiftTypeOptionLike = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type ToggleShiftTypeAssignmentParams = {
  shifts: ShiftData[];
  staff: StaffType;
  date: string;
  option: ShiftTypeOptionLike;
  position: PositionType;
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

export const hasShiftTypeAssignment = (shift: ShiftData | undefined, optionId: string): boolean =>
  getAssignedShiftTypeOptionIds(shift).includes(optionId);

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

export const getShiftTypeRequestLabel = (
  shift: ShiftData | undefined,
  options: ShiftTypeOptionLike[],
  isSubmitted: boolean,
): string => {
  if (!isSubmitted) return "未提出";

  const requestedIds = getRequestedShiftTypeOptionIds(shift);
  if (requestedIds.length === 0) return "休み";

  const optionNameById = new Map(options.map((option) => [option.id, option.name]));
  return requestedIds.map((optionId) => optionNameById.get(optionId) ?? "勤務区分").join("・");
};

export const toggleShiftTypeAssignment = ({
  shifts,
  staff,
  date,
  option,
  position,
}: ToggleShiftTypeAssignmentParams): ShiftData[] => {
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
        positions: [
          {
            id: `seg-${staff.id}-${date}-${option.id}`,
            positionId: position.id,
            positionName: position.name,
            color: position.color,
            start: option.startTime,
            end: option.endTime,
            shiftTypeOptionId: option.id,
          },
        ],
      },
    ];
  }

  const hasOption = targetShift.positions.some((positionSegment) => positionSegment.shiftTypeOptionId === option.id);
  const nextPositions = hasOption
    ? targetShift.positions.filter((positionSegment) => positionSegment.shiftTypeOptionId !== option.id)
    : [
        ...targetShift.positions,
        {
          id: `seg-${staff.id}-${date}-${option.id}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: option.startTime,
          end: option.endTime,
          shiftTypeOptionId: option.id,
        },
      ];

  return shifts.map((shift) => (shift.id === targetShift.id ? { ...shift, positions: nextPositions } : shift));
};
