import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { type BuildAssignmentsOptions, buildAssignments } from "@/src/domains/shift/buildAssignments";
import type { ShiftData } from "@/src/domains/shift/types";

type Params = {
  warnings: AssignmentWarning[];
  currentShifts: ShiftData[];
  baselineShifts: ShiftData[];
  closedDateSet: ReadonlySet<string>;
  buildAssignmentsOptions: BuildAssignmentsOptions;
  isConfirmed: boolean;
};

const cellKey = (staffId: string, date: string) => `${staffId}\u0000${date}`;

const assignmentSignatureByCell = (
  shifts: ShiftData[],
  closedDateSet: ReadonlySet<string>,
  buildAssignmentsOptions: BuildAssignmentsOptions,
) => {
  const signatures = new Map<string, string[]>();

  for (const shift of shifts) {
    signatures.set(cellKey(shift.staffId, shift.date), []);
  }

  for (const assignment of buildAssignments(shifts, closedDateSet, buildAssignmentsOptions)) {
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
  buildAssignmentsOptions: BuildAssignmentsOptions,
) => {
  const current = assignmentSignatureByCell(currentShifts, closedDateSet, buildAssignmentsOptions);
  const baseline = assignmentSignatureByCell(baselineShifts, closedDateSet, buildAssignmentsOptions);
  const keys = new Set([...current.keys(), ...baseline.keys()]);

  return new Set([...keys].filter((key) => current.get(key) !== baseline.get(key)));
};

export const visibleAssignmentWarnings = ({
  warnings,
  currentShifts,
  baselineShifts,
  closedDateSet,
  buildAssignmentsOptions,
  isConfirmed,
}: Params): AssignmentWarning[] => {
  if (!isConfirmed) return warnings;

  const changed = changedCellKeys(currentShifts, baselineShifts, closedDateSet, buildAssignmentsOptions);
  if (changed.size === 0) return [];

  return warnings.filter((warning) => changed.has(cellKey(warning.staffId, warning.date)));
};
