/**
 * スタッフドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - スタッフの追加・退職・情報更新
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SKILL_LEVELS } from "../constants";
import { createDefaultSkills, getStaff, getStaffByEmail, initializeStaffSkills, requireShop } from "../helpers";

// スタッフを店舗に追加（オーナーのみ）
export const addStaff = mutation({
  args: {
    shopId: v.id("shops"),
    email: v.string(),
    displayName: v.string(),
    authId: v.string(),
    skills: v.optional(
      v.array(
        v.object({
          position: v.string(),
          level: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    const trimmedEmail = args.email.trim().toLowerCase();
    const trimmedDisplayName = args.displayName.trim();

    if (!trimmedEmail) {
      throw new ConvexError({ message: "メールアドレスは必須です", code: "EMPTY_EMAIL" });
    }
    if (!trimmedDisplayName) {
      throw new ConvexError({ message: "表示名は必須です", code: "EMPTY_DISPLAY_NAME" });
    }

    // 同じ店舗に同じメールアドレスのスタッフがいないかチェック
    const existingStaff = await getStaffByEmail(ctx, args.shopId, trimmedEmail);
    if (existingStaff) {
      throw new ConvexError({ message: "このメールアドレスは既に登録されています", code: "EMAIL_ALREADY_EXISTS" });
    }

    // skillsが渡されなかった場合、全ポジション「未経験」で初期化
    const skills = args.skills ?? createDefaultSkills();

    const staffId = await ctx.db.insert("staffs", {
      shopId: args.shopId,
      email: trimmedEmail,
      displayName: trimmedDisplayName,
      status: "active",
      skills, // 後方互換のため残す
      invitedBy: args.authId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    // 新テーブルにもスキルを初期化
    await initializeStaffSkills(ctx, args.shopId, staffId);

    return { success: true, staffId };
  },
});

// スタッフを退職処理（オーナーのみ）
export const resignStaff = mutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
    resignationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    const staff = await getStaff(ctx, args.staffId);
    if (!staff || staff.shopId !== args.shopId) {
      throw new ConvexError({ message: "スタッフが見つかりません", code: "STAFF_NOT_FOUND" });
    }

    if (staff.status === "resigned") {
      throw new ConvexError({ message: "このスタッフは既に退職済みです", code: "ALREADY_RESIGNED" });
    }

    await ctx.db.patch(args.staffId, {
      status: "resigned",
      resignedAt: Date.now(),
      resignationReason: args.resignationReason,
    });

    return { success: true };
  },
});

// スタッフ情報更新（オーナーのみ）
export const updateStaffInfo = mutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    skills: v.optional(
      v.array(
        v.object({
          positionId: v.id("shopPositions"),
          level: v.string(),
        }),
      ),
    ),
    memo: v.optional(v.string()),
    workStyleNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await getStaff(ctx, args.staffId);
    if (!staff || staff.shopId !== args.shopId) {
      throw new ConvexError({ message: "スタッフが見つかりません", code: "STAFF_NOT_FOUND" });
    }

    const fieldsToUpdate: Partial<{
      email: string;
      displayName: string;
      memo: string;
      workStyleNote: string;
    }> = {};

    if (args.email !== undefined) {
      fieldsToUpdate.email = args.email.trim().toLowerCase();
    }
    if (args.displayName !== undefined) {
      fieldsToUpdate.displayName = args.displayName.trim();
    }
    if (args.memo !== undefined) {
      fieldsToUpdate.memo = args.memo;
    }
    if (args.workStyleNote !== undefined) {
      fieldsToUpdate.workStyleNote = args.workStyleNote;
    }

    // スキルの更新（staffSkillsテーブル）
    if (args.skills !== undefined) {
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
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      await ctx.db.patch(args.staffId, fieldsToUpdate);
    }

    return { success: true };
  },
});
