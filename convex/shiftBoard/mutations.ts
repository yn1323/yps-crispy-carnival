import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";
import { getSubmissionPattern } from "../_lib/submissionPattern";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";
import { ensureDefaultPosition } from "../position/service";
import { buildAssignmentIssue, SHIFT_ASSIGNMENT_VALIDATION, validateShiftAssignments } from "./validation";

export const saveShiftAssignments = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    assignments: v.array(
      v.object({
        staffId: v.id("staffs"),
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        positionId: v.optional(v.id("positions")),
        optionId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    const submissionPattern = getSubmissionPattern(recruitment.submissionPattern, {
      startTime: recruitment.shiftStartTime,
      endTime: recruitment.shiftEndTime,
    });
    // 違反は全件収集して構造化エラーで返し、フロントのエラー一覧UIにマップする
    const issues = validateShiftAssignments({
      assignments: args.assignments,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      closedDates: recruitment.shopClosedDates ?? [],
      pattern: submissionPattern,
    });
    if (issues.length > 0) {
      throw new ConvexError({ code: SHIFT_ASSIGNMENT_VALIDATION, issues });
    }

    const uniqueStaffIds = [...new Set(args.assignments.map((a) => a.staffId))];
    const uniquePositionIds = [...new Set(args.assignments.flatMap((a) => (a.positionId ? [a.positionId] : [])))];
    await Promise.all(
      [
        uniqueStaffIds.map(async (staffId) => {
          const staff = await ctx.db.get(staffId);
          if (!staff || staff.isDeleted || staff.shopId !== ctx.shop._id) {
            throw new ConvexError("Not found");
          }
        }),
        uniquePositionIds.map(async (positionId) => {
          const position = await ctx.db.get(positionId);
          if (!position || position.isDeleted || position.shopId !== ctx.shop._id) {
            throw new ConvexError("Not found");
          }
        }),
      ].flat(),
    );

    const draftSavedAt = Date.now();
    const defaultPositionId = await ensureDefaultPosition(ctx, ctx.shop._id);

    // シフト表は1募集分をまとめて編集するため、保存時は全置換にしてクライアント状態を正とする。
    // 個別 patch にすると、削除された行や日付移動の扱いが複雑になりやすい。
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT);

    await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

    await Promise.all(
      args.assignments.map((assignment) =>
        ctx.db.insert("shiftAssignments", {
          recruitmentId: args.recruitmentId,
          staffId: assignment.staffId,
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          positionId: assignment.positionId ?? defaultPositionId,
          ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
        }),
      ),
    );

    await ctx.db.patch(args.recruitmentId, { draftSavedAt });
  },
});

export const confirmRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    intent: v.optional(v.union(v.literal("confirm"), v.literal("resend"))),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    const isResend = recruitment.status === "confirmed";
    const intent = args.intent ?? "confirm";
    if (intent === "resend" && !isResend) {
      throw new ConvexError("確定済みのシフトだけ再通知できます");
    }
    if (intent === "confirm" && isResend) {
      return null;
    }

    const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
    const existingAssignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT);
    const closedDateAssignments =
      shopClosedDateSet.size > 0
        ? existingAssignments.filter((assignment) => shopClosedDateSet.has(assignment.date))
        : [];
    if (closedDateAssignments.length > 0) {
      throw new ConvexError({
        code: SHIFT_ASSIGNMENT_VALIDATION,
        issues: closedDateAssignments.map((assignment) =>
          buildAssignmentIssue("CLOSED_DAY", assignment.date, assignment.staffId),
        ),
      });
    }

    // 再確定も同じ導線で許可する。通知文面だけ変更して、既存スタッフには変更連絡として届ける。
    await ctx.db.patch(args.recruitmentId, {
      status: "confirmed",
      confirmedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: args.recruitmentId,
      isResend,
    });
  },
});
