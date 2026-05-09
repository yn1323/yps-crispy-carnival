import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";
import { timeToMinutes } from "../_lib/time";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";

export const saveShiftAssignments = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    assignments: v.array(
      v.object({
        staffId: v.id("staffs"),
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    // 募集時点のスナップショットを優先し、マイグレーション未適用時のみ店舗の現在値にフォールバック
    // TODO[narrow]: m001_recruitments_add_shift_times 完走後に `?? ctx.shop.xxx` を削除（schema の narrow と同じ PR で対応）
    const startTimeStr = recruitment.shiftStartTime ?? ctx.shop.shiftStartTime;
    const endTimeStr = recruitment.shiftEndTime ?? ctx.shop.shiftEndTime;
    const shopStartMinutes = timeToMinutes(startTimeStr);
    const shopEndMinutes = timeToMinutes(endTimeStr);

    const seen = new Set<string>();
    for (const a of args.assignments) {
      const key = `${a.staffId}-${a.date}`;
      if (seen.has(key)) {
        throw new ConvexError("同じスタッフの同じ日に、シフト時間が重なっています");
      }
      seen.add(key);

      if (a.date < recruitment.periodStart || a.date > recruitment.periodEnd) {
        throw new ConvexError("募集期間内の日付を選んでください");
      }

      const startMinutes = timeToMinutes(a.startTime);
      const endMinutes = timeToMinutes(a.endTime);

      if (startMinutes >= endMinutes) {
        throw new ConvexError("終了時間は開始時間より後にしてください");
      }

      if (startMinutes < shopStartMinutes || endMinutes > shopEndMinutes) {
        throw new ConvexError("設定したシフト時間内にしてください");
      }
    }

    const uniqueStaffIds = [...new Set(args.assignments.map((a) => a.staffId))];
    await Promise.all(
      uniqueStaffIds.map(async (staffId) => {
        const staff = await ctx.db.get(staffId);
        if (!staff || staff.isDeleted || staff.shopId !== ctx.shop._id) {
          throw new ConvexError("Not found");
        }
      }),
    );

    const draftSavedAt = Date.now();

    // 既存のshiftAssignmentsを全削除
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT);

    await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

    // 新しいassignmentsを一括挿入
    await Promise.all(
      args.assignments.map((assignment) =>
        ctx.db.insert("shiftAssignments", {
          recruitmentId: args.recruitmentId,
          staffId: assignment.staffId,
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
        }),
      ),
    );

    await ctx.db.patch(args.recruitmentId, { draftSavedAt });
  },
});

export const confirmRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    const isResend = recruitment.status === "confirmed";

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
