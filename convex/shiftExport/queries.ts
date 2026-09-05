import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { dateToUtcMs, formatUtcDate, isPastShiftPeriod } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { DAY_MS, RECRUITMENT_PERIOD_DAYS_MAX, SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { getPreviousConfirmationDelivery } from "../notification/confirmationDelivery";
import {
  buildConfirmationSnapshotsForStaffs,
  confirmationSnapshotMatchesAssignments,
  hasValidConfirmationSnapshotSignature,
} from "../notification/confirmationSnapshots";
import { getOrganizationStaffOrderScope } from "../organization/staffOrder";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { isShiftTargetStaff } from "../staff/service";

const shiftExportDataValidator = v.object({
  shopName: v.string(),
  recruitment: v.object({
    periodStart: v.string(),
    periodEnd: v.string(),
    shopClosedDates: v.array(v.string()),
    submissionPattern: submissionPatternValidator,
    draftSavedAt: v.union(v.number(), v.null()),
    confirmedAt: v.union(v.number(), v.null()),
    isConfirmed: v.boolean(),
  }),
  staffs: v.array(v.object({ id: v.id("staffs"), name: v.string(), isRemoved: v.boolean() })),
  assignments: v.array(
    v.object({
      staffId: v.id("staffs"),
      date: v.string(),
      startTime: v.string(),
      endTime: v.string(),
      optionId: v.union(v.string(), v.null()),
    }),
  ),
  confirmationState: v.union(v.literal("unconfirmed"), v.literal("confirmed")),
  contentComparison: v.union(
    v.literal("notApplicable"),
    v.literal("same"),
    v.literal("different"),
    v.literal("unknown"),
  ),
  notificationState: v.union(
    v.literal("notApplicable"),
    v.literal("pending"),
    v.literal("failed"),
    v.literal("sent"),
    v.literal("unknown"),
  ),
  exportBlockReason: v.union(
    v.null(),
    v.literal("noSavedShifts"),
    v.literal("noStaffs"),
    v.literal("excludedStaffAssignments"),
  ),
});

function assertPeriodWithinLimit(recruitment: Doc<"recruitments">) {
  const start = dateToUtcMs(recruitment.periodStart);
  const end = dateToUtcMs(recruitment.periodEnd);
  const days = (end - start) / DAY_MS + 1;
  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > RECRUITMENT_PERIOD_DAYS_MAX ||
    formatUtcDate(start) !== recruitment.periodStart ||
    formatUtcDate(end) !== recruitment.periodEnd
  ) {
    throw new ConvexError("シフト表の期間を確認できません。最大31日以内の募集を選んでください。");
  }
}

async function getContentComparison(
  ctx: QueryCtx,
  recruitment: Doc<"recruitments">,
  staffIds: Id<"staffs">[],
  assignments: Doc<"shiftAssignments">[],
) {
  if (staffIds.length === 0) return "unknown" as const;
  const canonicalizeTime = recruitment.submissionPattern.kind === "time";
  const current = buildConfirmationSnapshotsForStaffs(staffIds, assignments, canonicalizeTime);
  const comparisons = await Promise.all(
    current.map(async (snapshot) => {
      const stored = await ctx.db
        .query("shiftConfirmationSnapshots")
        .withIndex("by_recruitmentId_staffId", (q) =>
          q.eq("recruitmentId", recruitment._id).eq("staffId", snapshot.staffId),
        )
        .take(2);
      if (
        stored.length !== 1 ||
        stored[0].assignments.length > SHIFT_ASSIGNMENT_LIMIT ||
        !hasValidConfirmationSnapshotSignature(stored[0])
      ) {
        return "unknown" as const;
      }
      return confirmationSnapshotMatchesAssignments(stored[0], snapshot.assignments, canonicalizeTime)
        ? ("same" as const)
        : ("different" as const);
    }),
  );
  // 一部だけ比較できても、表全体の比較が成立したとは扱わない。
  if (comparisons.includes("unknown")) return "unknown" as const;
  return comparisons.includes("different") ? ("different" as const) : ("same" as const);
}

async function getNotificationState(ctx: QueryCtx, recruitment: Doc<"recruitments">) {
  const operationKey = recruitment.lastConfirmationNotificationOperationKey;
  if (!operationKey) return "unknown" as const;
  const operations = await ctx.db
    .query("notificationFanoutOperations")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
    .take(2);
  const operation = operations[0];
  if (
    operations.length !== 1 ||
    operation.kind !== "confirmation" ||
    operation.shopId !== recruitment.shopId ||
    operation.recruitmentId !== recruitment._id ||
    !operation.supersedesActiveOperations ||
    operation.targetStaffIds.length === 0 ||
    operation.targetStaffIds.length > SHIFT_BOARD_STAFF_LIMIT ||
    new Set(operation.targetStaffIds).size !== operation.targetStaffIds.length ||
    operation.status === "cancelled"
  ) {
    return "unknown" as const;
  }
  const states = await Promise.all(
    operation.targetStaffIds.map((staffId) => getPreviousConfirmationDelivery(ctx, operation, staffId)),
  );
  if (states.some(({ summary }) => summary === "failed")) return "failed" as const;
  if (
    operation.status === "pending" ||
    operation.status === "processing" ||
    states.some(({ summary }) => summary === "pending")
  ) {
    return "pending" as const;
  }
  return states.every(({ summary }) => summary === "sent") ? ("sent" as const) : ("unknown" as const);
}

/** 認可済みの保存内容だけを、ブラウザで帳票生成するための最小DTOへ射影する。 */
export const getShiftExportData = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(shiftExportDataValidator, v.null()),
  handler: async (ctx, { recruitmentId }) => {
    const { shop, organization } = ctx;
    if (!shop || !organization) return null;
    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, recruitmentId);
    if (!recruitment) return null;
    assertPeriodWithinLimit(recruitment);

    const [allStaffs, assignments, orderScope] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      getOrganizationStaffOrderScope(ctx, { organizationId: organization._id, shopId: shop._id }),
    ]);
    if (allStaffs.length > SHIFT_BOARD_STAFF_LIMIT || assignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new ConvexError("シフト表のデータが出力できる上限を超えています。");
    }
    if (allStaffs.some((staff) => staff.organizationId !== organization._id)) throw new ConvexError("Not found");
    let orderedStaffs = allStaffs;
    if (orderScope.mode === "ordered") {
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shop._id))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1);
      const staffById = new Map(allStaffs.map((staff) => [staff._id, staff]));
      orderedStaffs = entries.map((entry) => {
        const staff = staffById.get(entry.staffId);
        if (
          !staff ||
          entry.organizationId !== organization._id ||
          entry.organizationPersonId !== staff.organizationPersonId
        ) {
          throw new ConvexError("Not found");
        }
        return staff;
      });
    }
    const activeStaffs = orderedStaffs.filter(isShiftTargetStaff);
    const activeStaffIds = new Set(activeStaffs.map((staff) => staff._id));
    const unmatchedStaffIds = [...new Set(assignments.map((assignment) => assignment.staffId))].filter(
      (staffId) => !activeStaffIds.has(staffId),
    );
    if (activeStaffs.length + unmatchedStaffIds.length > SHIFT_BOARD_STAFF_LIMIT) {
      throw new ConvexError("シフト表のスタッフ数が出力できる上限を超えています。");
    }
    const historicalStaffs: Doc<"staffs">[] = [];
    const past = isPastShiftPeriod(recruitment.periodEnd);
    let hasExcludedAssignments = false;
    for (const staffId of unmatchedStaffIds) {
      const staff = await ctx.db.get(staffId);
      if (past && staff?.isDeleted && staff.shopId === shop._id && staff.organizationId === organization._id) {
        historicalStaffs.push(staff);
      } else {
        hasExcludedAssignments = true;
      }
    }
    historicalStaffs.sort((a, b) => a._creationTime - b._creationTime || a._id.localeCompare(b._id));
    const staffs = [...activeStaffs, ...historicalStaffs];
    const isConfirmed = recruitment.status === "confirmed";
    const [contentComparison, notificationState] = isConfirmed
      ? await Promise.all([
          getContentComparison(
            ctx,
            recruitment,
            staffs.map((staff) => staff._id),
            assignments,
          ),
          getNotificationState(ctx, recruitment),
        ])
      : ["notApplicable" as const, "notApplicable" as const];
    const exportBlockReason = hasExcludedAssignments
      ? ("excludedStaffAssignments" as const)
      : recruitment.draftSavedAt === undefined && !isConfirmed && assignments.length === 0
        ? ("noSavedShifts" as const)
        : staffs.length === 0
          ? ("noStaffs" as const)
          : null;
    // 対象外・別店舗の参照がある場合は出力停止を明示し、部分的な割当DTOも返さない。
    const exportAssignments = hasExcludedAssignments
      ? []
      : recruitment.submissionPattern.kind === "time"
        ? normalizeExactAdjacentTimeAssignments(assignments)
        : assignments;

    return {
      shopName: shop.name,
      recruitment: {
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        shopClosedDates: recruitment.shopClosedDates,
        submissionPattern: recruitment.submissionPattern,
        draftSavedAt: recruitment.draftSavedAt ?? null,
        confirmedAt: recruitment.confirmedAt ?? null,
        isConfirmed,
      },
      staffs: staffs.map((staff) => ({ id: staff._id, name: staff.name, isRemoved: staff.isDeleted })),
      assignments: exportAssignments.map((assignment) => ({
        staffId: assignment.staffId,
        date: assignment.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        optionId: assignment.optionId ?? null,
      })),
      confirmationState: isConfirmed ? ("confirmed" as const) : ("unconfirmed" as const),
      contentComparison,
      notificationState,
      exportBlockReason,
    };
  },
});
