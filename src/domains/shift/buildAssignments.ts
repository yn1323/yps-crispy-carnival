import { DEFAULT_POSITION } from "./constants";
import { isValidIsoDateString } from "./date";
import { isCanonicalWorkPosition } from "./positions";
import { isSupportedShiftTime, timeToMinutes } from "./time";
import type { ShiftData } from "./types";

export type ShiftAssignmentDraft<StaffId extends string = string, PositionId extends string = string> = {
  staffId: StaffId;
  date: string;
  startTime: string;
  endTime: string;
  optionId?: string;
  positionId?: PositionId;
};

type CanonicalizableTimeAssignment = {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  optionId?: string | null;
  positionId?: string;
};

export type BuildAssignmentsOptions<PositionId extends string = string> = {
  defaultPositionId?: PositionId;
  submissionPatternKind?: "time" | "dateOnly" | "shiftType";
};

const resolveVirtualDefaultPosition = <Assignment extends CanonicalizableTimeAssignment>(
  assignment: Assignment,
  defaultPositionId?: string,
): Assignment => {
  if (assignment.positionId !== DEFAULT_POSITION.id) return assignment;

  const { positionId: _virtualPositionId, ...rest } = assignment;
  return (defaultPositionId ? { ...rest, positionId: defaultPositionId } : rest) as Assignment;
};

const staffDateKey = (assignment: CanonicalizableTimeAssignment): string =>
  `${assignment.staffId}\u0000${assignment.date}`;

const compareAssignments = (a: CanonicalizableTimeAssignment, b: CanonicalizableTimeAssignment): number =>
  timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
  timeToMinutes(a.endTime) - timeToMinutes(b.endTime) ||
  (a.positionId ?? "").localeCompare(b.positionId ?? "") ||
  (a.optionId ?? "").localeCompare(b.optionId ?? "");

const canCanonicalizeCell = (assignments: CanonicalizableTimeAssignment[]): boolean => {
  if (
    assignments.some(
      (assignment) =>
        !isValidIsoDateString(assignment.date) ||
        typeof assignment.optionId === "string" ||
        !isSupportedShiftTime(assignment.startTime) ||
        !isSupportedShiftTime(assignment.endTime) ||
        timeToMinutes(assignment.startTime) >= timeToMinutes(assignment.endTime),
    )
  ) {
    return false;
  }

  const sorted = [...assignments].sort(compareAssignments);
  let latestEnd = -1;
  for (const assignment of sorted) {
    const start = timeToMinutes(assignment.startTime);
    if (start < latestEnd) return false;
    latestEnd = Math.max(latestEnd, timeToMinutes(assignment.endTime));
  }
  return true;
};

// 時間入力方式の保存表現だけを正規化する。
// 不正時刻や重複を含むセルは手を加えず、後続validationが元の入力を拒否できるようにする。
export const canonicalizeTimeAssignments = <Assignment extends CanonicalizableTimeAssignment>(
  assignments: readonly Assignment[],
  defaultPositionId?: string,
): Assignment[] => {
  const resolved = assignments.map((assignment) => resolveVirtualDefaultPosition(assignment, defaultPositionId));
  const assignmentsByCell = new Map<string, Assignment[]>();

  for (const assignment of resolved) {
    const key = staffDateKey(assignment);
    const cellAssignments = assignmentsByCell.get(key) ?? [];
    cellAssignments.push(assignment);
    assignmentsByCell.set(key, cellAssignments);
  }

  return [...assignmentsByCell.values()].flatMap((cellAssignments) => {
    if (!canCanonicalizeCell(cellAssignments)) return cellAssignments;

    const merged: Assignment[] = [];
    for (const current of [...cellAssignments].sort(compareAssignments)) {
      const previous = merged.at(-1);
      if (
        previous &&
        previous.optionId == null &&
        current.optionId == null &&
        previous.positionId === current.positionId &&
        timeToMinutes(previous.endTime) === timeToMinutes(current.startTime)
      ) {
        merged[merged.length - 1] = { ...previous, endTime: current.endTime };
        continue;
      }
      merged.push(current);
    }
    return merged;
  });
};

// ShiftFormの編集状態をmutation引数のassignmentsに変換する。
// 定休日セルと休憩（BREAK）は保存対象から除外する。
export const buildAssignments = <StaffId extends string = string, PositionId extends string = string>(
  shifts: ShiftData[],
  closedDateSet: ReadonlySet<string>,
  options: BuildAssignmentsOptions<PositionId> = {},
): ShiftAssignmentDraft<StaffId, PositionId>[] => {
  const assignments = shifts.flatMap((s) => {
    if (closedDateSet.has(s.date)) return [];
    return s.positions.filter(isCanonicalWorkPosition).map((position) => ({
      staffId: s.staffId as StaffId,
      date: s.date,
      startTime: position.start,
      endTime: position.end,
      ...(position.shiftTypeOptionId ? { optionId: position.shiftTypeOptionId } : {}),
      ...(position.positionId !== DEFAULT_POSITION.id
        ? { positionId: position.positionId as PositionId }
        : options.defaultPositionId
          ? { positionId: options.defaultPositionId }
          : {}),
    }));
  });

  if (options.submissionPatternKind === "time") {
    return canonicalizeTimeAssignments(assignments, options.defaultPositionId);
  }
  return assignments.map((assignment) => resolveVirtualDefaultPosition(assignment, options.defaultPositionId));
};
