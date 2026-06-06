import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { getDeadlineCutoff, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { getSubmissionPattern, type ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { hasCurrentStaffLegalConsent, recordStaffLegalConsent } from "../legal/service";
import { type SubmitShiftSelection, submitShiftRequestsSchema, submitShiftSelectionSchema } from "./schemas";

type NormalizedShiftRequest = { date: string; startTime: string; endTime: string; optionId?: string };
type NormalizedSubmissionInput = {
  slots: NormalizedShiftRequest[];
  dates: string[];
};

const shiftSubmissionInputValidator = v.union(
  v.object({
    kind: v.literal("time"),
    requests: v.array(
      v.object({
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
      }),
    ),
  }),
  v.object({
    kind: v.literal("dateOnly"),
    workingDates: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("shiftType"),
    selections: v.array(v.object({ date: v.string(), optionId: v.string() })),
  }),
);

function assertValidDateForSubmission(date: string, recruitment: Doc<"recruitments">, shopClosedDateSet: Set<string>) {
  if (date < recruitment.periodStart || date > recruitment.periodEnd) {
    throw new ConvexError("Date out of range");
  }
  if (shopClosedDateSet.has(date)) {
    throw new ConvexError("定休日には希望シフトを提出できません");
  }
}

function assertUniqueDate(date: string, requestedDates: Set<string>) {
  if (requestedDates.has(date)) {
    throw new ConvexError("同じ日の希望シフトは1件だけ登録できます");
  }
  requestedDates.add(date);
}

function validateTimeRequest(req: NormalizedShiftRequest, timeRange: { startTime: string; endTime: string }) {
  if (timeToMinutes(req.startTime) >= timeToMinutes(req.endTime)) {
    throw new ConvexError("Invalid time range");
  }
  if (
    timeToMinutes(req.startTime) < timeToMinutes(timeRange.startTime) ||
    timeToMinutes(req.endTime) > timeToMinutes(timeRange.endTime)
  ) {
    throw new ConvexError("Invalid time range");
  }
}

function normalizeSubmissionInput(
  input: SubmitShiftSelection,
  recruitment: Doc<"recruitments">,
  pattern: ShiftSubmissionPattern,
): NormalizedSubmissionInput {
  if (input.kind !== pattern.kind) {
    throw new ConvexError("提出方法がこの募集の設定と一致しません");
  }

  const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
  const requestedDates = new Set<string>();

  if (input.kind === "time") {
    if (pattern.kind !== "time") {
      throw new ConvexError("提出方法がこの募集の設定と一致しません");
    }
    for (const req of input.requests) {
      assertUniqueDate(req.date, requestedDates);
      assertValidDateForSubmission(req.date, recruitment, shopClosedDateSet);
      validateTimeRequest(req, pattern);
    }
    return { slots: input.requests, dates: [] };
  }

  if (input.kind === "dateOnly") {
    const dates = input.workingDates.map((date) => {
      assertUniqueDate(date, requestedDates);
      assertValidDateForSubmission(date, recruitment, shopClosedDateSet);
      return date;
    });
    return { slots: [], dates };
  }

  if (pattern.kind !== "shiftType") {
    throw new ConvexError("提出方法がこの募集の設定と一致しません");
  }

  const optionMap = new Map(pattern.options.map((option) => [option.id, option]));
  const requestedShiftTypeKeys = new Set<string>();
  const slots = input.selections.map((selection) => {
    assertValidDateForSubmission(selection.date, recruitment, shopClosedDateSet);
    const option = optionMap.get(selection.optionId);
    if (!option) {
      throw new ConvexError("勤務区分が見つかりません");
    }
    const selectionKey = `${selection.date}:${selection.optionId}`;
    if (requestedShiftTypeKeys.has(selectionKey)) {
      throw new ConvexError("同じ日の勤務区分が重複しています");
    }
    requestedShiftTypeKeys.add(selectionKey);
    return { date: selection.date, startTime: option.startTime, endTime: option.endTime, optionId: option.id };
  });
  return { slots, dates: [] };
}

/**
 * シフト希望を提出（新規 or 修正）
 * requests が空配列 = 全日休み提出
 */
export const submitShiftRequests = staffSessionMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    acceptedLegal: v.optional(v.boolean()),
    requests: v.optional(
      v.array(
        v.object({
          date: v.string(),
          startTime: v.string(),
          endTime: v.string(),
        }),
      ),
    ),
    submission: v.optional(shiftSubmissionInputValidator),
  },
  handler: async (ctx, args) => {
    const rateLimitResult = await rateLimit(ctx, {
      name: "submitShiftRequests",
      key: ctx.staff._id,
    });
    if (!rateLimitResult.ok) {
      throw new ConvexError({ code: "RATE_LIMITED", retryAfter: rateLimitResult.retryAt });
    }

    if (ctx.session.recruitmentId !== args.recruitmentId) {
      throw new ConvexError("Not found");
    }

    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }
    if (recruitment.status !== "open") {
      throw new ConvexError("Not found");
    }

    const now = Date.now();
    if (now >= getSubmitLinkCutoff(recruitment.periodStart)) {
      throw new ConvexError("Not found");
    }

    const existingSubmission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .first();

    // 締切後は未提出者の初回提出だけを救済し、提出済みの変更は止める。
    if (now >= getDeadlineCutoff(recruitment.deadline) && existingSubmission) {
      throw new ConvexError("Deadline passed");
    }

    const pattern = getSubmissionPattern(recruitment.submissionPattern, {
      startTime: recruitment.shiftStartTime,
      endTime: recruitment.shiftEndTime,
    });
    const rawSubmission = args.submission ?? { kind: "time", requests: args.requests ?? [] };
    const parsed = submitShiftSelectionSchema.safeParse(rawSubmission);
    if (!parsed.success) {
      throw new ConvexError("Invalid request data");
    }
    const normalizedSubmission = normalizeSubmissionInput(parsed.data, recruitment, pattern);
    const parsedRequests = submitShiftRequestsSchema.safeParse({ requests: normalizedSubmission.slots });
    if (!parsedRequests.success) {
      throw new ConvexError("Invalid request data");
    }

    if (!(await hasCurrentStaffLegalConsent(ctx, ctx.staff._id))) {
      if (args.acceptedLegal !== true) {
        throw new ConvexError("Legal consent required");
      }
      // スタッフは Clerk アカウントを持たないため、初回提出の同意を staff ドキュメントへ直接記録する。
      await recordStaffLegalConsent(ctx, {
        staffId: ctx.staff._id,
        shopId: ctx.shop._id,
        method: "shift_submit",
        sourceRecruitmentId: args.recruitmentId,
      });
    }

    const existingSlots = await ctx.db
      .query("shiftSubmissionSlots")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .collect();
    const existingDates = await ctx.db
      .query("shiftSubmissionDates")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .collect();

    // 再提出は差分更新ではなく全置換。休みの日は明細を作らないため、
    // shiftSubmissions 側の存在が「提出済み」の正になる。
    await Promise.all([
      ...existingSlots.map((r) => ctx.db.delete(r._id)),
      ...existingDates.map((r) => ctx.db.delete(r._id)),
    ]);

    let submissionId: Id<"shiftSubmissions">;
    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        // 既存データは firstSubmittedAt がないため、再提出直前の submittedAt を初回扱いにする。
        firstSubmittedAt: existingSubmission.firstSubmittedAt ?? existingSubmission.submittedAt,
        submittedAt: now,
      });
      submissionId = existingSubmission._id;
    } else {
      submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId: args.recruitmentId,
        staffId: ctx.staff._id,
        firstSubmittedAt: now,
        submittedAt: now,
      });
    }

    await Promise.all([
      ...normalizedSubmission.slots.map((r) =>
        ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId: args.recruitmentId,
          staffId: ctx.staff._id,
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
          ...(r.optionId ? { optionId: r.optionId } : {}),
        }),
      ),
      ...normalizedSubmission.dates.map((date) =>
        ctx.db.insert("shiftSubmissionDates", {
          submissionId,
          recruitmentId: args.recruitmentId,
          staffId: ctx.staff._id,
          date,
        }),
      ),
    ]);

    const stats = await ctx.db
      .query("recruitmentStats")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .first();
    if (stats) {
      await ctx.db.patch(stats._id, {
        submittedCount: existingSubmission ? stats.submittedCount : stats.submittedCount + 1,
        updatedAt: now,
      });
    } else {
      const submissions = await ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .collect();
      const activeStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
        .collect();
      await ctx.db.insert("recruitmentStats", {
        recruitmentId: args.recruitmentId,
        shopId: ctx.shop._id,
        submittedCount: submissions.length,
        activeStaffCountSnapshot: activeStaffs.length,
        updatedAt: now,
      });
    }
  },
});
