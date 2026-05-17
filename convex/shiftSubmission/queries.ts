import { v } from "convex/values";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { getPreviousDateOnlyPattern, getPreviousWeeklyPattern } from "../_lib/previousWeeklyPattern";
import { getSubmissionPattern, type ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { hasCurrentStaffLegalConsent } from "../legal/service";

type ExistingRequest = { date: string; startTime: string; endTime: string };

function getSubmissionTimeRange(pattern: ShiftSubmissionPattern): { startTime: string; endTime: string } {
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

function buildExistingSelection(pattern: ShiftSubmissionPattern, requests: ExistingRequest[], dates: string[]) {
  if (pattern.kind === "dateOnly") {
    return {
      kind: "dateOnly" as const,
      workingDates: dates,
      unmatchedRequests: requests,
    };
  }

  if (pattern.kind === "shiftType") {
    const optionByTime = new Map(pattern.options.map((option) => [`${option.startTime}-${option.endTime}`, option]));
    const selections: Array<{ date: string; optionId: string }> = [];
    const unmatchedRequests: ExistingRequest[] = [];
    for (const request of requests) {
      const option = optionByTime.get(`${request.startTime}-${request.endTime}`);
      if (option) {
        selections.push({ date: request.date, optionId: option.id });
      } else {
        unmatchedRequests.push(request);
      }
    }
    return { kind: "shiftType" as const, selections, unmatchedRequests };
  }

  return { kind: "time" as const, requests };
}

/**
 * シフト提出画面のデータ取得
 * フロントの SubmissionData 型に対応
 */
export const getSubmissionPageData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    if (ctx.session.recruitmentId !== recruitmentId) return null;

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      return null;
    }
    if (recruitment.status !== "open") return null;

    const isBeforeDeadline = Date.now() < getDeadlineCutoff(recruitment.deadline);
    const submissionPattern = getSubmissionPattern(recruitment.submissionPattern, {
      startTime: recruitment.shiftStartTime,
      endTime: recruitment.shiftEndTime,
    });

    const staffId = ctx.staff._id;
    const [submission, slots] = await Promise.all([
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
        .first(),
      ctx.db
        .query("shiftSubmissionSlots")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
        .collect(),
    ]);
    const dateEntries = await ctx.db
      .query("shiftSubmissionDates")
      .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
      .collect();

    const existingRequests = slots.map((r) => ({
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
    }));
    const existingDates = dateEntries.map((entry) => entry.date);
    const timeRange = getSubmissionTimeRange(submissionPattern);

    return {
      shopName: ctx.shop.name,
      staffName: ctx.staff.name,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      deadline: recruitment.deadline,
      shopClosedDates: recruitment.shopClosedDates ?? [],
      submissionPattern,
      isBeforeDeadline,
      hasSubmitted: submission !== null,
      existingRequests,
      existingSelection: buildExistingSelection(submissionPattern, existingRequests, existingDates),
      legalConsentRequired: !(await hasCurrentStaffLegalConsent(ctx, ctx.staff._id)),
      legalDocuments: getLegalDocumentsForAudience("staff"),
      timeRange,
      previousWeeklyPattern:
        isBeforeDeadline && submissionPattern.kind !== "dateOnly"
          ? await getPreviousWeeklyPattern(ctx, {
              staffId,
              beforeDate: recruitment.periodStart,
              timeRange,
            })
          : null,
      previousDateOnlyPattern:
        isBeforeDeadline && submissionPattern.kind === "dateOnly"
          ? await getPreviousDateOnlyPattern(ctx, { staffId, beforeDate: recruitment.periodStart })
          : null,
    };
  },
});
