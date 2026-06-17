import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const confirmationSnapshotAssignmentValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  positionId: v.id("positions"),
  optionId: v.optional(v.string()),
});

export type ConfirmationSnapshotAssignment = {
  date: string;
  startTime: string;
  endTime: string;
  positionId: Id<"positions">;
  optionId?: string;
};

export type ConfirmationSnapshot = {
  staffId: Id<"staffs">;
  assignments: ConfirmationSnapshotAssignment[];
  signature: string;
};

export type ConfirmationSnapshotSourceAssignment = ConfirmationSnapshotAssignment & {
  staffId: Id<"staffs">;
};

export function normalizeConfirmationSnapshotAssignments(
  assignments: ConfirmationSnapshotAssignment[],
): ConfirmationSnapshotAssignment[] {
  return assignments
    .map((assignment) => ({
      date: assignment.date,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      positionId: assignment.positionId,
      ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
    }))
    .sort((a, b) => {
      const aKey = [a.date, a.startTime, a.endTime, a.positionId, a.optionId ?? ""].join("|");
      const bKey = [b.date, b.startTime, b.endTime, b.positionId, b.optionId ?? ""].join("|");
      return aKey.localeCompare(bKey);
    });
}

export function buildConfirmationSnapshotSignature(assignments: ConfirmationSnapshotAssignment[]): string {
  return JSON.stringify(normalizeConfirmationSnapshotAssignments(assignments));
}

export function buildConfirmationSnapshotsForStaffs(
  staffIds: Id<"staffs">[],
  assignments: ConfirmationSnapshotSourceAssignment[],
): ConfirmationSnapshot[] {
  const assignmentsByStaffId = new Map<Id<"staffs">, ConfirmationSnapshotAssignment[]>();

  for (const assignment of assignments) {
    const staffAssignments = assignmentsByStaffId.get(assignment.staffId) ?? [];
    staffAssignments.push(assignment);
    assignmentsByStaffId.set(assignment.staffId, staffAssignments);
  }

  return staffIds.map((staffId) => {
    const normalizedAssignments = normalizeConfirmationSnapshotAssignments(assignmentsByStaffId.get(staffId) ?? []);
    return {
      staffId,
      assignments: normalizedAssignments,
      signature: buildConfirmationSnapshotSignature(normalizedAssignments),
    };
  });
}
