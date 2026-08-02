import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";
import { migrations } from "./index";

/**
 * draftSavedAt導入前に保存された下書きだけを、現行readerと同じassignment作成時刻へ補完する。
 * assignmentがない募集は「下書き未保存」が正しいため、fieldを追加しない。
 */
export const migration = migrations.define({
  table: "recruitments",
  batchSize: 10,
  migrateOne: async (ctx, recruitment) => {
    if (recruitment.draftSavedAt !== undefined) return;

    const assignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(SHIFT_ASSIGNMENT_LIMIT);
    if (assignments.length === 0) return;

    return {
      draftSavedAt: assignments.reduce(
        (latest, assignment) => Math.max(latest, assignment._creationTime),
        assignments[0]._creationTime,
      ),
    };
  },
});
