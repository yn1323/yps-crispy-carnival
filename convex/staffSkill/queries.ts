/**
 * スタッフスキルドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - スタッフのスキル一覧取得（ポジション情報付き）
 */
import { v } from "convex/values";
import { query } from "../_generated/server";

// スタッフのスキル一覧を取得（ポジション情報付き）
export const listByStaff = query({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, args) => {
    const skills = await ctx.db
      .query("staffSkills")
      .withIndex("by_staff", (q) => q.eq("staffId", args.staffId))
      .collect();

    // 並列でポジション情報を取得
    const skillsWithPositions = await Promise.all(
      skills.map(async (skill) => {
        const position = await ctx.db.get(skill.positionId);
        return {
          _id: skill._id,
          staffId: skill.staffId,
          positionId: skill.positionId,
          level: skill.level,
          updatedAt: skill.updatedAt,
          positionName: position?.name ?? "",
          positionOrder: position?.order ?? 0,
          positionIsDeleted: position?.isDeleted ?? true,
        };
      }),
    );

    // 削除されたポジションは除外し、orderでソート
    return skillsWithPositions
      .filter((skill) => !skill.positionIsDeleted)
      .sort((a, b) => a.positionOrder - b.positionOrder);
  },
});

// 店舗の全スタッフのスキル一覧を取得（スタッフ一覧表示用）
export const listByShop = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    // 店舗のスタッフ一覧を取得
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // ポジション一覧を事前に一括取得してMap化（N+1回避）
    const positions = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const positionMap = new Map(positions.map((p) => [p._id, p]));

    // 各スタッフのスキルを取得
    const staffSkillsMap = new Map<
      string,
      { positionId: string; positionName: string; level: string; order: number }[]
    >();

    for (const staff of staffs) {
      const skills = await ctx.db
        .query("staffSkills")
        .withIndex("by_staff", (q) => q.eq("staffId", staff._id))
        .collect();

      const skillsWithPositions = skills
        .map((skill) => {
          const position = positionMap.get(skill.positionId);
          if (!position) return null;
          return {
            positionId: skill.positionId as string,
            positionName: position.name,
            level: skill.level,
            order: position.order,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => a.order - b.order);

      staffSkillsMap.set(staff._id, skillsWithPositions);
    }

    return Object.fromEntries(staffSkillsMap);
  },
});
