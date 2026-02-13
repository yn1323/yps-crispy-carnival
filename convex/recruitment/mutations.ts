/**
 * 募集ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - シフト募集の作成
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { RECRUITMENT_STATUS } from "../constants";
import { requireShop, requireShopOwnerOrManager } from "../helpers";

// 日付形式バリデーション（YYYY-MM-DD形式）
const isValidDateFormat = (date: string) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime());
};

// シフト募集作成
export const create = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // 権限チェック（オーナーまたはマネージャーのみ）
    await requireShopOwnerOrManager(ctx, args.shopId, args.authId);

    // 日付形式バリデーション
    if (!isValidDateFormat(args.startDate)) {
      throw new ConvexError({ message: "開始日の形式が不正です", code: "INVALID_START_DATE" });
    }
    if (!isValidDateFormat(args.endDate)) {
      throw new ConvexError({ message: "終了日の形式が不正です", code: "INVALID_END_DATE" });
    }
    if (!isValidDateFormat(args.deadline)) {
      throw new ConvexError({ message: "締切日の形式が不正です", code: "INVALID_DEADLINE" });
    }

    // ビジネスルールバリデーション（フロントエンドのzodスキーマと一致）
    if (args.startDate > args.endDate) {
      throw new ConvexError({ message: "終了日は開始日以降を指定してください", code: "END_BEFORE_START" });
    }
    if (args.deadline >= args.startDate) {
      throw new ConvexError({
        message: "締切日は開始日より前を指定してください",
        code: "DEADLINE_NOT_BEFORE_START",
      });
    }

    // アクティブスタッフ数を取得（非削除かつ非退職）
    const activeStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("status"), "resigned")))
      .collect();

    const totalStaffCount = activeStaffs.length;

    // 募集作成
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: args.shopId,
      startDate: args.startDate,
      endDate: args.endDate,
      deadline: args.deadline,
      status: RECRUITMENT_STATUS[0], // "open"
      appliedCount: 0,
      totalStaffCount,
      createdBy: args.authId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return { success: true, data: { recruitmentId, totalStaffCount } };
  },
});
