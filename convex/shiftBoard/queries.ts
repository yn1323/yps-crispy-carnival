import { v } from "convex/values";
import { managerQuery } from "../_lib/functions";
import { getSubmissionPattern, type ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import {
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_BOARD_TIME_UNIT_MINUTES,
} from "../constants";

function getBoardTimeRange(pattern: ShiftSubmissionPattern): { startTime: string; endTime: string } {
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

export const getShiftBoardData = managerQuery({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== shop._id) {
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
        .take(SHIFT_ASSIGNMENT_LIMIT),
      ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(50),
    ]);

    const submissions = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_BOARD_STAFF_LIMIT);
    const submissionByStaffId = new Map(submissions.map((s) => [s.staffId, s]));
    const submittedStaffIds = new Set(submissions.map((s) => s.staffId));
    // draftSavedAt 導入前の既存データは、保存済み assignment の作成時刻を暫定の保存時刻として扱う。
    const effectiveDraftSavedAt =
      recruitment.draftSavedAt ??
      (shiftAssignments.length > 0 ? Math.max(...shiftAssignments.map((a) => a._creationTime)) : null);

    // TimeRange.start/end は「時」の数値を期待（9, 22 等）
    const submissionPattern = getSubmissionPattern(recruitment.submissionPattern, {
      startTime: recruitment.shiftStartTime,
      endTime: recruitment.shiftEndTime,
    });
    const { startTime: startTimeStr, endTime: endTimeStr } = getBoardTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);
    const startHour = Math.floor(editableStartMinutes / 60);
    const endHour = Math.ceil(editableEndMinutes / 60);

    return {
      shopId: shop._id,
      recruitment: {
        _id: recruitment._id,
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        deadline: recruitment.deadline,
        shopClosedDates: recruitment.shopClosedDates ?? [],
        status: recruitment.status,
        confirmedAt: recruitment.confirmedAt ?? null,
        lastReminderSentAt: recruitment.lastReminderSentAt ?? null,
        draftSavedAt: effectiveDraftSavedAt,
      },
      staffs: allStaffs.map((s) => {
        const submission = submissionByStaffId.get(s._id);
        // firstSubmittedAt がない既存 submission は submittedAt を初回提出時刻として扱う。
        const firstSubmittedAt = submission ? (submission.firstSubmittedAt ?? submission.submittedAt) : null;
        return {
          _id: s._id,
          name: s.name,
          isSubmitted: submittedStaffIds.has(s._id),
          wasSubmittedAtDraft:
            effectiveDraftSavedAt !== null && firstSubmittedAt !== null
              ? firstSubmittedAt <= effectiveDraftSavedAt
              : false,
        };
      }),
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: Boolean(p.isDefault) })),
      requestedSlots: shiftSlots.map((r) => ({
        staffId: r.staffId,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
      })),
      requestedDates: requestedDates.map((r) => ({
        staffId: r.staffId,
        date: r.date,
      })),
      shiftAssignments: shiftAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
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
