import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { isPastShiftPeriod } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { buildConfirmationSnapshotsForStaffs } from "../notification/confirmationSnapshots";
import { ensureDefaultPosition } from "../position/service";
import { buildAssignmentIssue, SHIFT_ASSIGNMENT_VALIDATION, validateShiftAssignments } from "./validation";

const PAST_SHIFT_SAVE_ERROR = "過去のシフトは保存できません";
const PAST_SHIFT_NOTIFY_ERROR = "過去のシフトはスタッフに通知できません";

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
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      throw new ConvexError(PAST_SHIFT_SAVE_ERROR);
    }

    const submissionPattern = recruitment.submissionPattern;
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
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      throw new ConvexError(PAST_SHIFT_NOTIFY_ERROR);
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

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT);
    const currentSnapshots = buildConfirmationSnapshotsForStaffs(
      staffs.map((staff) => staff._id),
      existingAssignments.map((assignment) => ({
        staffId: assignment.staffId,
        date: assignment.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        positionId: assignment.positionId,
        ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
      })),
    );
    // シフトボードで扱うスタッフ上限に合わせ、snapshotも差分判定対象のスタッフ分だけ読む。
    const sentSnapshots = isResend
      ? await Promise.all(
          currentSnapshots.map((snapshot) =>
            ctx.db
              .query("shiftConfirmationSnapshots")
              .withIndex("by_recruitmentId_staffId", (q) =>
                q.eq("recruitmentId", args.recruitmentId).eq("staffId", snapshot.staffId),
              )
              .first(),
          ),
        )
      : [];
    const sentSnapshotByStaffId = new Map(
      sentSnapshots.flatMap((snapshot) => (snapshot ? [[snapshot.staffId, snapshot] as const] : [])),
    );

    const targetStaffIds = isResend
      ? currentSnapshots
          .filter((snapshot) => {
            const sentSnapshot = sentSnapshotByStaffId.get(snapshot.staffId);
            return !sentSnapshot || sentSnapshot.signature !== snapshot.signature;
          })
          .map((snapshot) => snapshot.staffId)
      : currentSnapshots.map((snapshot) => snapshot.staffId);

    if (isResend && targetStaffIds.length === 0) {
      return { status: "no_changes" as const, notifiedStaffCount: 0 };
    }

    const notificationRunId = Date.now();
    // 再確定も同じ導線で許可する。再通知では前回通知時点から変わったスタッフだけに届ける。
    await ctx.db.patch(args.recruitmentId, {
      status: "confirmed",
      confirmedAt: notificationRunId,
    });

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: args.recruitmentId,
      isResend,
      ...(isResend ? { targetStaffIds, notificationRunId } : {}),
    });
    return { status: "scheduled" as const, notifiedStaffCount: targetStaffIds.length };
  },
});
