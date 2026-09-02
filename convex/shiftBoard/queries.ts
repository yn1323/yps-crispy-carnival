import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { isPastShiftPeriod } from "../_lib/dateFormat";
import { managerQuery, organizationQuery } from "../_lib/functions";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { shiftAssignmentReadValidator } from "../_lib/shiftAssignmentValidators";
import { getSubmissionPatternTimeRange, submissionPatternValidator } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import {
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_BOARD_TIME_UNIT_MINUTES,
} from "../constants";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { isShiftTargetStaff } from "../staff/service";

const shiftBoardWriteBlockReasonValidator = v.union(
  v.literal("paymentResultPending"),
  v.literal("usageLimitExceeded"),
  v.literal("usageLimitEvaluationUnavailable"),
  v.null(),
);

const shiftBoardDataValidator = v.object({
  shopId: v.id("shops"),
  canWriteBusinessData: v.boolean(),
  businessWriteBlockReason: shiftBoardWriteBlockReasonValidator,
  recruitment: v.object({
    _id: v.id("recruitments"),
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    shopClosedDates: v.array(v.string()),
    status: v.union(v.literal("open"), v.literal("confirmed")),
    confirmedAt: v.union(v.number(), v.null()),
    reminderScheduledAt: v.union(v.number(), v.null()),
    lastReminderSentAt: v.union(v.number(), v.null()),
    draftSavedAt: v.union(v.number(), v.null()),
  }),
  submissionPattern: submissionPatternValidator,
  staffs: v.array(
    v.object({
      _id: v.id("staffs"),
      name: v.string(),
      isRemoved: v.boolean(),
      isSubmitted: v.boolean(),
      createdAt: v.number(),
      wasSubmittedAtDraft: v.boolean(),
    }),
  ),
  positions: v.array(v.object({ _id: v.id("positions"), name: v.string(), color: v.string(), isDefault: v.boolean() })),
  requestedSlots: v.array(
    v.object({
      staffId: v.id("staffs"),
      date: v.string(),
      startTime: v.string(),
      endTime: v.string(),
      optionId: v.optional(v.string()),
    }),
  ),
  requestedDates: v.array(v.object({ staffId: v.id("staffs"), date: v.string() })),
  shiftAssignments: v.array(shiftAssignmentReadValidator),
  timeRange: v.object({
    start: v.number(),
    end: v.number(),
    unit: v.number(),
    editableStartMinutes: v.number(),
    editableEndMinutes: v.number(),
  }),
});

export const getShiftBoardData = managerQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    // rolling deploy中の旧client（引数なし / asOfDate）も受け入れる。どちらも表示判定の時計としては信用しない。
    refreshDayKey: v.optional(v.string()),
    asOfDate: v.optional(v.string()),
  },
  returns: v.union(shiftBoardDataValidator, v.null()),
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, args.recruitmentId);
    if (!recruitment) {
      return null;
    }

    const [allStaffs, shiftSlots, requestedDates, shiftAssignments, positions] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftSubmissionSlots")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftSubmissionDates")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(50),
    ]);
    if (shiftAssignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }

    const submissions = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_BOARD_STAFF_LIMIT);
    const activeShiftTargetStaffs = allStaffs.filter(isShiftTargetStaff);
    const historicalRemovedStaffs: Doc<"staffs">[] = [];
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      const activeStaffIds = new Set(activeShiftTargetStaffs.map((staff) => staff._id));
      const removedStaffIds = [...new Set(shiftAssignments.map((assignment) => assignment.staffId))].filter(
        (staffId) => !activeStaffIds.has(staffId),
      );
      for (const staffId of removedStaffIds.slice(0, SHIFT_BOARD_STAFF_LIMIT - activeShiftTargetStaffs.length)) {
        const removedStaff = await ctx.db.get(staffId);
        if (removedStaff?.isDeleted && removedStaff.shopId === shop._id) historicalRemovedStaffs.push(removedStaff);
      }
    }
    const submissionByStaffId = new Map(submissions.map((s) => [s.staffId, s]));
    const submittedStaffIds = new Set(submissions.map((s) => s.staffId));
    // draftSavedAt 導入前の既存データは、保存済み assignment の作成時刻を暫定の保存時刻として扱う。
    // TODO[narrow]: 全deploymentでm038が完走し、
    // verifyRecruitments.assignmentsWithoutDraftSavedAtが0件になった後にfallbackを削除する。
    const effectiveDraftSavedAt =
      recruitment.draftSavedAt ??
      (shiftAssignments.length > 0 ? Math.max(...shiftAssignments.map((a) => a._creationTime)) : null);

    // TimeRange.start/end は「時」の数値を期待（9, 22 等）
    const submissionPattern = recruitment.submissionPattern;
    const projectedAssignments =
      submissionPattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(shiftAssignments) : shiftAssignments;
    const { startTime: startTimeStr, endTime: endTimeStr } = getSubmissionPatternTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);
    const startHour = Math.floor(editableStartMinutes / 60);
    const endHour = Math.ceil(editableEndMinutes / 60);
    const organizationAccess = ctx.organization ? await getOrganizationAccessPolicy(ctx, ctx.organization._id) : null;
    const businessWriteBlockReason =
      organizationAccess?.usageLimitStatus?.kind === "unknown"
        ? ("usageLimitEvaluationUnavailable" as const)
        : (organizationAccess?.businessWriteBlockReason ?? null);

    return {
      shopId: shop._id,
      canWriteBusinessData: businessWriteBlockReason === null,
      businessWriteBlockReason,
      recruitment: {
        _id: recruitment._id,
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        deadline: recruitment.deadline,
        // TODO[narrow]: 全deploymentでm040が完走し、
        // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
        shopClosedDates: recruitment.shopClosedDates ?? [],
        status: recruitment.status,
        confirmedAt: recruitment.confirmedAt ?? null,
        reminderScheduledAt: recruitment.reminderScheduledAt ?? null,
        lastReminderSentAt: recruitment.lastReminderSentAt ?? null,
        draftSavedAt: effectiveDraftSavedAt,
      },
      submissionPattern,
      staffs: [
        ...activeShiftTargetStaffs.map((s) => {
          const submission = submissionByStaffId.get(s._id);
          // firstSubmittedAt がない既存 submission は submittedAt を初回提出時刻として扱う。
          // TODO[narrow]: 全deploymentでm033が完走し、verifyShiftSubmissionsの全pageが0になった後にsubmittedAt fallbackを削除する。
          const firstSubmittedAt = submission ? (submission.firstSubmittedAt ?? submission.submittedAt) : null;
          return {
            _id: s._id,
            name: s.name,
            isRemoved: false,
            isSubmitted: submittedStaffIds.has(s._id),
            createdAt: s._creationTime,
            wasSubmittedAtDraft:
              effectiveDraftSavedAt !== null && firstSubmittedAt !== null
                ? firstSubmittedAt <= effectiveDraftSavedAt
                : false,
          };
        }),
        ...historicalRemovedStaffs.map((staff) => ({
          _id: staff._id,
          name: staff.name,
          isRemoved: true,
          isSubmitted: true,
          createdAt: staff._creationTime,
          wasSubmittedAtDraft: false,
        })),
      ],
      // TODO[narrow]: 全deploymentでm034が完走し、verifyPositionsの全pageが0になった後にBoolean fallbackを削除する。
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: Boolean(p.isDefault) })),
      requestedSlots: shiftSlots.map((r) => ({
        staffId: r.staffId,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        ...(r.optionId ? { optionId: r.optionId } : {}),
      })),
      requestedDates: requestedDates.map((r) => ({
        staffId: r.staffId,
        date: r.date,
      })),
      shiftAssignments: projectedAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
        ...(a.optionId !== undefined ? { optionId: a.optionId } : {}),
      })),
      timeRange: {
        start: startHour,
        end: endHour,
        unit: SHIFT_BOARD_TIME_UNIT_MINUTES,
        editableStartMinutes,
        editableEndMinutes,
      },
    };
  },
});

/** 認証済みappの必須orgから募集→店舗→組織を再検証し、既存ShiftBoard queryへ渡す明示scopeを返す。 */
export const getShiftBoardShopScopeForOrganization = organizationQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(v.object({ shopId: v.id("shops"), shopName: v.string() }), v.null()),
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted || shop.organizationId !== ctx.organization._id) return null;

    return { shopId: shop._id, shopName: shop.name };
  },
});
