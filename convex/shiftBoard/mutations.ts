import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";

const MAX_SHIFT_ASSIGNMENTS = 2000;

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

    // 既存のshiftAssignmentsを全削除
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(MAX_SHIFT_ASSIGNMENTS);

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

    await ctx.db.patch(args.recruitmentId, {
      status: "confirmed",
      confirmedAt: Date.now(),
    });

    // TODO: メール送信（Phase 2）
  },
});
