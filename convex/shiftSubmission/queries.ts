import { v } from "convex/values";
import { getDeadlineCutoff, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { getPreviousDateOnlyPattern, getPreviousWeeklyPattern } from "../_lib/previousWeeklyPattern";
import {
  getSubmissionPatternTimeRange,
  type ShiftSubmissionPattern,
  submissionPatternValidator,
} from "../_lib/submissionPattern";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { hasCurrentStaffLegalConsent } from "../legal/service";

type ExistingRequest = { date: string; startTime: string; endTime: string; optionId?: string };
type SubmissionUnavailableReason = "invalid_link" | "recruitment_deleted" | "submission_closed";

const existingRequestValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  optionId: v.optional(v.string()),
});

const legalDocumentValidator = v.object({
  audience: v.union(v.literal("manager"), v.literal("staff")),
  kind: v.union(v.literal("terms"), v.literal("privacy")),
  title: v.string(),
  documentVersion: v.string(),
  requiredConsentVersion: v.string(),
  path: v.string(),
});

const submissionPageDataValidator = v.object({
  shopName: v.string(),
  staffName: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  shopClosedDates: v.array(v.string()),
  submissionPattern: submissionPatternValidator,
  isBeforeDeadline: v.boolean(),
  hasSubmitted: v.boolean(),
  existingRequests: v.array(existingRequestValidator),
  existingSelection: v.union(
    v.object({ kind: v.literal("time"), requests: v.array(existingRequestValidator) }),
    v.object({
      kind: v.literal("dateOnly"),
      workingDates: v.array(v.string()),
      unmatchedRequests: v.array(existingRequestValidator),
    }),
    v.object({
      kind: v.literal("shiftType"),
      selections: v.array(v.object({ date: v.string(), optionId: v.string() })),
      unmatchedRequests: v.array(existingRequestValidator),
    }),
  ),
  legalConsentRequired: v.boolean(),
  legalDocuments: v.object({
    terms: legalDocumentValidator,
    privacy: legalDocumentValidator,
  }),
  timeRange: v.object({ startTime: v.string(), endTime: v.string() }),
  previousWeeklyPattern: v.union(
    v.object({
      sourceWeekStart: v.string(),
      days: v.array(v.object({ weekday: v.number(), startTime: v.string(), endTime: v.string() })),
    }),
    v.null(),
  ),
  previousDateOnlyPattern: v.union(v.object({ sourceWeekStart: v.string(), weekdays: v.array(v.number()) }), v.null()),
});

function unavailable(reason: SubmissionUnavailableReason) {
  return { status: "unavailable" as const, reason };
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
    const optionById = new Map(pattern.options.map((option) => [option.id, option]));
    const optionByTime = new Map(pattern.options.map((option) => [`${option.startTime}-${option.endTime}`, option]));
    const selections: Array<{ date: string; optionId: string }> = [];
    const unmatchedRequests: ExistingRequest[] = [];
    for (const request of requests) {
      const option = request.optionId
        ? optionById.get(request.optionId)
        : optionByTime.get(`${request.startTime}-${request.endTime}`);
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
  returns: v.union(
    v.object({
      status: v.literal("unavailable"),
      reason: v.union(v.literal("invalid_link"), v.literal("recruitment_deleted"), v.literal("submission_closed")),
    }),
    v.object({ status: v.literal("ok"), data: submissionPageDataValidator }),
  ),
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return unavailable("invalid_link");
    if (ctx.session.recruitmentId !== recruitmentId) return unavailable("invalid_link");

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.shopId !== ctx.shop._id) {
      return unavailable("invalid_link");
    }
    if (recruitment.isDeleted) {
      return unavailable("recruitment_deleted");
    }
    if (recruitment.status !== "open") {
      return unavailable("submission_closed");
    }
    const now = Date.now();
    if (now >= getSubmitLinkCutoff(recruitment.periodStart)) {
      return unavailable("submission_closed");
    }

    const isBeforeDeadline = now < getDeadlineCutoff(recruitment.deadline);
    const submissionPattern = recruitment.submissionPattern;

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
      ...(r.optionId ? { optionId: r.optionId } : {}),
    }));
    const existingDates = dateEntries.map((entry) => entry.date);
    const timeRange = getSubmissionPatternTimeRange(submissionPattern);

    return {
      status: "ok" as const,
      data: {
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
      },
    };
  },
});
