/**
 * シフト割当ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 管理者が編集したシフト割当データの保存（upsert）
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";

const assignmentValidator = v.object({
  staffId: v.string(),
  date: v.string(),
  positions: v.array(
    v.object({
      positionId: v.string(),
      positionName: v.string(),
      color: v.string(),
      start: v.string(),
      end: v.string(),
    }),
  ),
});

// シフト割当データの保存（upsert）
export const save = mutation({
  args: {
    recruitmentId: v.id("recruitments"),
    assignments: v.array(assignmentValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitment", (q) => q.eq("recruitmentId", args.recruitmentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        assignments: args.assignments,
        updatedAt: Date.now(),
      });
      return { success: true, id: existing._id, isNew: false };
    }

    const id = await ctx.db.insert("shiftAssignments", {
      recruitmentId: args.recruitmentId,
      assignments: args.assignments,
      updatedAt: Date.now(),
    });
    return { success: true, id, isNew: true };
  },
});
