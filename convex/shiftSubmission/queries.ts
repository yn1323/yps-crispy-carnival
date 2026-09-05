import { v } from "convex/values";
import { getDeadlineCutoff, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { getPreviousDateOnlyPattern, getPreviousWeeklyPattern } from "../_lib/previousWeeklyPattern";
import { getRecruitmentEditVersion, isCurrentSubmission } from "../_lib/recruitmentEditing";
import { sessionMatchesAccessKind } from "../_lib/staffAccess";
import {
  getSubmissionPatternTimeRange,
  type ShiftSubmissionPattern,
  submissionPatternValidator,
} from "../_lib/submissionPattern";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { hasCurrentStaffLegalConsent } from "../legal/service";
import { staffLegalDocumentsValidator } from "../legal/validators";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";

type ExistingRequest = { date: string; startTime: string; endTime: string; optionId?: string };
type SubmissionUnavailableReason =
  | "invalid_link"
  | "recruitment_deleted"
  | "submission_closed"
  | "usage_limit_exceeded"
  | "usage_limit_evaluation_unavailable";

const existingRequestValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  optionId: v.optional(v.string()),
});

const submissionPageDataValidator = v.object({
  shopName: v.string(),
  staffName: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  editVersion: v.number(),
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
  legalDocuments: staffLegalDocumentsValidator,
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

function submissionResultUnavailable() {
  return { status: "unavailable" as const };
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
      reason: v.union(
        v.literal("invalid_link"),
        v.literal("recruitment_deleted"),
        v.literal("submission_closed"),
        v.literal("usage_limit_exceeded"),
        v.literal("usage_limit_evaluation_unavailable"),
      ),
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
    const organizationAccess = await getOrganizationAccessPolicy(ctx, ctx.shop.organizationId);
    if (!organizationAccess) {
      return unavailable("usage_limit_evaluation_unavailable");
    }
    if (organizationAccess.usageLimitStatus?.kind === "overLimit") {
      return unavailable("usage_limit_exceeded");
    }
    if (organizationAccess.usageLimitStatus?.kind === "unknown") {
      return unavailable("usage_limit_evaluation_unavailable");
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
        editVersion: getRecruitmentEditVersion(recruitment),
        shopClosedDates: recruitment.shopClosedDates,
        submissionPattern,
        isBeforeDeadline,
        hasSubmitted: isCurrentSubmission(submission),
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

/** 提出完了画面で、保存済みsubmit sessionと提出済みの事実を照合する。 */
export const getSubmissionResult = staffSessionQuery({
  args: { recruitmentId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("submitted"), shopName: v.string() }),
    v.object({ status: v.literal("unavailable") }),
  ),
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return submissionResultUnavailable();
    // staffSessionQueryのaccessKindはcaller入力なので、このqueryが要求する用途をhandlerでも固定する。
    if (!sessionMatchesAccessKind(ctx.session, "submit")) return submissionResultUnavailable();

    const normalizedInput = recruitmentId.trim();
    if (normalizedInput.length === 0 || normalizedInput.length > 128) return submissionResultUnavailable();
    const normalizedRecruitmentId = ctx.db.normalizeId("recruitments", normalizedInput);
    if (!normalizedRecruitmentId || ctx.session.recruitmentId !== normalizedRecruitmentId) {
      return submissionResultUnavailable();
    }

    const recruitment = await ctx.db.get(normalizedRecruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      return submissionResultUnavailable();
    }

    const staffId = ctx.staff._id;
    const submission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", normalizedRecruitmentId).eq("staffId", staffId),
      )
      .first();
    if (!isCurrentSubmission(submission)) return submissionResultUnavailable();

    return { status: "submitted" as const, shopName: ctx.shop.name };
  },
});
