import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const confirmationSnapshotAssignmentValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  positionId: v.id("positions"),
  optionId: v.optional(v.string()),
});

export const confirmationSnapshotInputValidator = v.object({
  assignments: v.array(confirmationSnapshotAssignmentValidator),
  signature: v.string(),
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

export async function upsertConfirmationSnapshotRecord(
  ctx: MutationCtx,
  args: {
    recruitmentId: Id<"recruitments">;
    staffId: Id<"staffs">;
    signature: string;
    assignments: ConfirmationSnapshotAssignment[];
    sentAt: number;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("shiftConfirmationSnapshots")
    .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", args.recruitmentId).eq("staffId", args.staffId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      signature: args.signature,
      assignments: args.assignments,
      sentAt: args.sentAt,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("shiftConfirmationSnapshots", {
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    signature: args.signature,
    assignments: args.assignments,
    sentAt: args.sentAt,
    updatedAt: now,
  });
}
