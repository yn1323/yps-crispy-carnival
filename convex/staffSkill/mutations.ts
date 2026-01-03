/**
 * スタッフスキルドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - スタッフのスキルレベル更新
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SKILL_LEVELS } from "../constants";
import { getStaff } from "../helpers";

// スキルレベル更新
export const updateLevel = mutation({
  args: {
    staffSkillId: v.id("staffSkills"),
    level: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const staffSkill = await ctx.db.get(args.staffSkillId);
    if (!staffSkill) {
      throw new ConvexError({ message: "スキルが見つかりません", code: "NOT_FOUND" });
    }

    if (!SKILL_LEVELS.includes(args.level as (typeof SKILL_LEVELS)[number])) {
      throw new ConvexError({ message: "無効なスキルレベルです", code: "INVALID_LEVEL" });
    }

    await ctx.db.patch(args.staffSkillId, {
      level: args.level,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// 複数スキルを一括更新（スタッフ編集画面用）
export const updateMultiple = mutation({
  args: {
    staffId: v.id("staffs"),
    skills: v.array(
      v.object({
        positionId: v.id("shopPositions"),
        level: v.string(),
      }),
    ),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await getStaff(ctx, args.staffId);
    if (!staff) {
      throw new ConvexError({ message: "スタッフが見つかりません", code: "STAFF_NOT_FOUND" });
    }

    // 既存のスキルを取得
    const existingSkills = await ctx.db
      .query("staffSkills")
      .withIndex("by_staff", (q) => q.eq("staffId", args.staffId))
      .collect();

    const existingSkillMap = new Map(existingSkills.map((s) => [s.positionId, s]));

    for (const skillInput of args.skills) {
      if (!SKILL_LEVELS.includes(skillInput.level as (typeof SKILL_LEVELS)[number])) {
        throw new ConvexError({ message: "無効なスキルレベルです", code: "INVALID_LEVEL" });
      }

      const existing = existingSkillMap.get(skillInput.positionId);

      if (existing) {
        // 既存のスキルを更新
        await ctx.db.patch(existing._id, {
          level: skillInput.level,
          updatedAt: Date.now(),
        });
      } else {
        // 新規スキルを作成
        await ctx.db.insert("staffSkills", {
          staffId: args.staffId,
          positionId: skillInput.positionId,
          level: skillInput.level,
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});
