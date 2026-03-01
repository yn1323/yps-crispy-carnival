/**
 * シフト割当ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 募集に紐づく管理者編集済みシフトデータの取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";

// 募集に紐づくシフト割当データを取得
export const getByRecruitment = query({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitment", (q) => q.eq("recruitmentId", args.recruitmentId))
      .first();

    if (!record) {
      return null;
    }

    return {
      _id: record._id,
      recruitmentId: record.recruitmentId,
      assignments: record.assignments,
      updatedAt: record.updatedAt,
    };
  },
});
