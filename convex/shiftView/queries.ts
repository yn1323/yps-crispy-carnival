import { v } from "convex/values";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { sessionMatchesAccessKind } from "../_lib/staffAccess";
import { getSubmissionPatternTimeRange, submissionPatternValidator } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT, SHIFT_BOARD_TIME_UNIT_MINUTES } from "../constants";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { isShiftTargetStaff } from "../staff/service";

const shiftViewDataValidator = v.object({
  shopName: v.string(),
  periodLabel: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  staffs: v.array(v.object({ _id: v.id("staffs"), name: v.string() })),
  positions: v.array(
    v.object({
      _id: v.id("positions"),
      name: v.string(),
      color: v.string(),
      isDefault: v.boolean(),
    }),
  ),
  assignments: v.array(
    v.object({
      staffId: v.id("staffs"),
      date: v.string(),
      startTime: v.string(),
      endTime: v.string(),
      positionId: v.id("positions"),
      optionId: v.optional(v.string()),
    }),
  ),
  shopClosedDates: v.array(v.string()),
  submissionPattern: submissionPatternValidator,
  timeRange: v.object({
    start: v.number(),
    end: v.number(),
    unit: v.number(),
    editableStartMinutes: v.number(),
    editableEndMinutes: v.number(),
  }),
});

export const getShiftViewData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(shiftViewDataValidator, v.null()),
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    const shop = ctx.shop;
    const session = ctx.session;
    if (!sessionMatchesAccessKind(session, "view")) return null;
    if (session.recruitmentId !== recruitmentId) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, recruitmentId);
    if (recruitment?.status !== "confirmed") {
      return null;
    }

    const [staffs, assignments, positions] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(50),
    ]);
    if (assignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }

    const submissionPattern = recruitment.submissionPattern;
    const projectedAssignments =
      submissionPattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(assignments) : assignments;
    const { startTime: startTimeStr, endTime: endTimeStr } = getSubmissionPatternTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);

    return {
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      staffs: staffs.filter(isShiftTargetStaff).map((s) => ({ _id: s._id, name: s.name })),
      // TODO[narrow]: 全deploymentでm034が完走し、verifyPositionsの全pageが0になった後にBoolean fallbackを削除する。
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: Boolean(p.isDefault) })),
      assignments: projectedAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
        ...(a.optionId !== undefined ? { optionId: a.optionId } : {}),
      })),
      // TODO[narrow]: 全deploymentでm040が完走し、
      // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
      shopClosedDates: recruitment.shopClosedDates ?? [],
      submissionPattern,
      timeRange: {
        start: Math.floor(editableStartMinutes / 60),
        end: Math.ceil(editableEndMinutes / 60),
        unit: SHIFT_BOARD_TIME_UNIT_MINUTES,
        editableStartMinutes,
        editableEndMinutes,
      },
    };
  },
});
