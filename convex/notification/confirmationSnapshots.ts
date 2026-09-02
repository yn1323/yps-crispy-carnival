import { type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { shiftConfirmationSnapshotAssignmentValidator } from "../_lib/shiftAssignmentValidators";

export const confirmationSnapshotAssignmentValidator = shiftConfirmationSnapshotAssignmentValidator;

export const confirmationSnapshotInputValidator = v.object({
  assignments: v.array(confirmationSnapshotAssignmentValidator),
  signature: v.string(),
});

export type ConfirmationSnapshotAssignment = Infer<typeof confirmationSnapshotAssignmentValidator>;

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

export function canonicalizeConfirmationSnapshotAssignments(
  assignments: ConfirmationSnapshotAssignment[],
): ConfirmationSnapshotAssignment[] {
  return normalizeExactAdjacentTimeAssignments(assignments)
    .map((assignment) => ({
      date: assignment.date,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      positionId: assignment.positionId,
      // signatureのrolling互換はbuild側で維持し、意味比較用のpresenceだけは失わない。
      ...(assignment.optionId !== undefined ? { optionId: assignment.optionId } : {}),
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime) ||
        String(a.positionId).localeCompare(String(b.positionId)) ||
        Number(a.optionId !== undefined) - Number(b.optionId !== undefined) ||
        (a.optionId ?? "").localeCompare(b.optionId ?? ""),
    );
}

export function hasValidConfirmationSnapshotSignature(args: {
  assignments: ConfirmationSnapshotAssignment[];
  signature: string;
}): boolean {
  return args.signature === buildConfirmationSnapshotSignature(args.assignments);
}

/** raw signatureが正しい保存済みsnapshotだけを、勤務内容の意味で比較する。 */
export function confirmationSnapshotMatchesAssignments(
  snapshot: { assignments: ConfirmationSnapshotAssignment[]; signature: string },
  currentAssignments: ConfirmationSnapshotAssignment[],
  canonicalizeTime: boolean,
): boolean {
  if (!hasValidConfirmationSnapshotSignature(snapshot)) return false;
  const snapshotAssignments = canonicalizeTime
    ? canonicalizeConfirmationSnapshotAssignments(snapshot.assignments)
    : normalizeConfirmationSnapshotAssignments(snapshot.assignments);
  const normalizedCurrentAssignments = canonicalizeTime
    ? canonicalizeConfirmationSnapshotAssignments(currentAssignments)
    : normalizeConfirmationSnapshotAssignments(currentAssignments);
  return canonicalizeTime
    ? JSON.stringify(snapshotAssignments) === JSON.stringify(normalizedCurrentAssignments)
    : buildConfirmationSnapshotSignature(snapshotAssignments) ===
        buildConfirmationSnapshotSignature(normalizedCurrentAssignments);
}

export function buildConfirmationSnapshotsForStaffs(
  staffIds: Id<"staffs">[],
  assignments: ConfirmationSnapshotSourceAssignment[],
  canonicalizeTime: boolean,
): ConfirmationSnapshot[] {
  const assignmentsByStaffId = new Map<Id<"staffs">, ConfirmationSnapshotAssignment[]>();

  for (const assignment of assignments) {
    const staffAssignments = assignmentsByStaffId.get(assignment.staffId) ?? [];
    staffAssignments.push(assignment);
    assignmentsByStaffId.set(assignment.staffId, staffAssignments);
  }

  return staffIds.map((staffId) => {
    const staffAssignments = assignmentsByStaffId.get(staffId) ?? [];
    const normalizedAssignments = canonicalizeTime
      ? canonicalizeConfirmationSnapshotAssignments(staffAssignments)
      : normalizeConfirmationSnapshotAssignments(staffAssignments);
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
    assignments: ConfirmationSnapshotAssignment[];
    sentAt: number;
    canonicalizeTime: boolean;
  },
) {
  const now = Date.now();
  const assignments = args.canonicalizeTime
    ? canonicalizeConfirmationSnapshotAssignments(args.assignments)
    : normalizeConfirmationSnapshotAssignments(args.assignments);
  const signature = buildConfirmationSnapshotSignature(assignments);
  const existing = await ctx.db
    .query("shiftConfirmationSnapshots")
    .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", args.recruitmentId).eq("staffId", args.staffId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      signature,
      assignments,
      sentAt: args.sentAt,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("shiftConfirmationSnapshots", {
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    signature,
    assignments,
    sentAt: args.sentAt,
    updatedAt: now,
  });
}
