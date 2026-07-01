import { v } from "convex/values";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT, SHIFT_BOARD_TIME_UNIT_MINUTES } from "../constants";
import { isShiftTargetStaff } from "../staff/service";

function getViewTimeRange(pattern: ShiftSubmissionPattern): { startTime: string; endTime: string } {
  if (pattern.kind === "time") return { startTime: pattern.startTime, endTime: pattern.endTime };
  if (pattern.kind === "shiftType" && pattern.options.length > 0) {
    const starts = pattern.options
      .map((option) => option.startTime)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    const ends = pattern.options.map((option) => option.endTime).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    return { startTime: starts[0], endTime: ends[ends.length - 1] };
  }
  return { startTime: "09:00", endTime: "22:00" };
}

export const getShiftViewData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    const shop = ctx.shop;
    const session = ctx.session;
    if (session.recruitmentId !== recruitmentId) return null;

    const recruitment = await ctx.db.get(recruitmentId);
    if (
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.shopId !== shop._id ||
      recruitment.status !== "confirmed"
    ) {
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
        .take(SHIFT_ASSIGNMENT_LIMIT),
      ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(50),
    ]);

    const submissionPattern = recruitment.submissionPattern;
    const { startTime: startTimeStr, endTime: endTimeStr } = getViewTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);

    return {
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      staffs: staffs.filter(isShiftTargetStaff).map((s) => ({ _id: s._id, name: s.name })),
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: Boolean(p.isDefault) })),
      assignments: assignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
        ...(a.optionId ? { optionId: a.optionId } : {}),
      })),
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
