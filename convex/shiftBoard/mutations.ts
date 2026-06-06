import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";
import { getSubmissionPattern, type ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";
import { ensureDefaultPosition } from "../position/service";

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
    const { startTime: startTimeStr, endTime: endTimeStr } = getBoardTimeRange(submissionPattern);
    const shiftTypeOptionById =
      submissionPattern.kind === "shiftType"
        ? new Map(submissionPattern.options.map((option) => [option.id, option]))
        : new Map<string, never>();
    const shopStartMinutes = timeToMinutes(startTimeStr);
    const shopEndMinutes = timeToMinutes(endTimeStr);
    const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);

    const rangesByStaffDate = new Map<string, Array<{ start: number; end: number }>>();
    for (const a of args.assignments) {
      const key = `${a.staffId}-${a.date}`;
      if (a.date < recruitment.periodStart || a.date > recruitment.periodEnd) {
        throw new ConvexError("募集期間内の日付を選んでください");
      }
      if (shopClosedDateSet.has(a.date)) {
        throw new ConvexError("定休日にはシフトを登録できません");
      }

      const startMinutes = timeToMinutes(a.startTime);
      const endMinutes = timeToMinutes(a.endTime);

      if (startMinutes >= endMinutes) {
        throw new ConvexError("終了時間は開始時間より後にしてください");
      }

      if (submissionPattern.kind === "shiftType") {
        if (a.optionId === undefined) {
          throw new ConvexError("勤務区分を選択してください");
        }
        const option = shiftTypeOptionById.get(a.optionId);
        if (!option) {
          throw new ConvexError("勤務区分が見つかりません");
        }
        if (a.startTime !== option.startTime || a.endTime !== option.endTime) {
          throw new ConvexError("勤務区分の時間と一致しません");
        }
      } else if (a.optionId !== undefined) {
        throw new ConvexError("勤務区分の募集ではありません");
      }

      if (startMinutes < shopStartMinutes || endMinutes > shopEndMinutes) {
        throw new ConvexError("設定したシフト時間内にしてください");
      }

      const ranges = rangesByStaffDate.get(key) ?? [];
      if (ranges.some((range) => startMinutes < range.end && endMinutes > range.start)) {
        throw new ConvexError("同じスタッフの同じ日に、シフト時間が重なっています");
      }
      ranges.push({ start: startMinutes, end: endMinutes });
      rangesByStaffDate.set(key, ranges);
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
    const closedDateAssignment = existingAssignments.find((assignment) => shopClosedDateSet.has(assignment.date));
    if (shopClosedDateSet.size > 0 && closedDateAssignment) {
      throw new ConvexError("定休日にシフトが登録されています");
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
