import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { buildAssignments } from "@/src/domains/shift/buildAssignments";
import type { ShiftData } from "@/src/domains/shift/types";

type Params = {
  warnings: AssignmentWarning[];
  currentShifts: ShiftData[];
  baselineShifts: ShiftData[];
  closedDateSet: ReadonlySet<string>;
  isConfirmed: boolean;
};

const cellKey = (staffId: string, date: string) => `${staffId}\u0000${date}`;

const assignmentSignatureByCell = (shifts: ShiftData[], closedDateSet: ReadonlySet<string>) => {
  const signatures = new Map<string, string[]>();

  for (const shift of shifts) {
    signatures.set(cellKey(shift.staffId, shift.date), []);
  }

  for (const assignment of buildAssignments(shifts, closedDateSet)) {
    const key = cellKey(assignment.staffId, assignment.date);
    const segments = signatures.get(key) ?? [];
    segments.push(
      [assignment.startTime, assignment.endTime, assignment.positionId ?? "", assignment.optionId ?? ""].join("|"),
    );
    signatures.set(key, segments);
  }

  return new Map([...signatures].map(([key, segments]) => [key, segments.sort().join("\n")]));
};

const changedCellKeys = (
  currentShifts: ShiftData[],
  baselineShifts: ShiftData[],
  closedDateSet: ReadonlySet<string>,
) => {
  const current = assignmentSignatureByCell(currentShifts, closedDateSet);
  const baseline = assignmentSignatureByCell(baselineShifts, closedDateSet);
  const keys = new Set([...current.keys(), ...baseline.keys()]);

  return new Set([...keys].filter((key) => current.get(key) !== baseline.get(key)));
};

export const visibleAssignmentWarnings = ({
  warnings,
  currentShifts,
  baselineShifts,
  closedDateSet,
  isConfirmed,
}: Params): AssignmentWarning[] => {
  if (!isConfirmed) return warnings;

  const changed = changedCellKeys(currentShifts, baselineShifts, closedDateSet);
  if (changed.size === 0) return [];

  return warnings.filter((warning) => changed.has(cellKey(warning.staffId, warning.date)));
};
