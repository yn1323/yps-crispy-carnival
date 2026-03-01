/**
 * 店舗ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 店舗のCRUD操作
 * - スタッフ追加・退職処理
 * - 権限チェックを含むビジネスロジック
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT } from "../constants";
import {
  initializeDefaultPositions,
  initializeStaffSkills,
  isValidTimeFormat,
  requireShop,
  requireUserByAuthId,
} from "../helpers";

// 店舗作成
export const create = mutation({
  args: {
    shopName: v.string(),
    openTime: v.string(),
    closeTime: v.string(),
    timeUnit: v.number(),
    submitFrequency: v.string(),
    description: v.optional(v.string()),
    authId: v.string(),
    positions: v.optional(
      v.array(
        v.object({
          name: v.string(),
          order: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const trimmedShopName = args.shopName.trim();
    const trimmedAuthId = args.authId.trim();

    // バリデーション
    if (!trimmedShopName) {
      throw new ConvexError({ message: "店舗名は必須です", code: "EMPTY_SHOP_NAME" });
    }
    if (!trimmedAuthId) {
      throw new ConvexError({ message: "認証IDは必須です", code: "EMPTY_AUTH_ID" });
    }
    if (!isValidTimeFormat(args.openTime)) {
      throw new ConvexError({ message: "開店時間の形式が不正です", code: "INVALID_TIME_FORMAT" });
    }
    if (!isValidTimeFormat(args.closeTime)) {
      throw new ConvexError({ message: "閉店時間の形式が不正です", code: "INVALID_TIME_FORMAT" });
    }
    if (!SHOP_TIME_UNIT.includes(args.timeUnit as (typeof SHOP_TIME_UNIT)[number])) {
      throw new ConvexError({ message: "シフト時間単位が不正です", code: "INVALID_TIME_UNIT" });
    }
    if (!SHOP_SUBMIT_FREQUENCY.includes(args.submitFrequency as (typeof SHOP_SUBMIT_FREQUENCY)[number])) {
      throw new ConvexError({ message: "シフト提出頻度が不正です", code: "INVALID_SUBMIT_FREQUENCY" });
    }

    // ユーザー存在確認
    const user = await requireUserByAuthId(ctx, trimmedAuthId);

    // 店舗作成
    const shopId = await ctx.db.insert("shops", {
      shopName: trimmedShopName,
      openTime: args.openTime,
      closeTime: args.closeTime,
      timeUnit: args.timeUnit,
      submitFrequency: args.submitFrequency,
      avatar: "",
      description: args.description,
      createdBy: trimmedAuthId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    // ポジションを初期化
    if (args.positions && args.positions.length > 0) {
      // カスタムポジションを作成
      for (const pos of args.positions) {
        await ctx.db.insert("shopPositions", {
          shopId,
          name: pos.name,
          order: pos.order,
          isDeleted: false,
          createdAt: Date.now(),
        });
      }
    } else {
      // デフォルトポジションを初期化
      await initializeDefaultPositions(ctx, shopId);
    }

    // オーナーをスタッフとして追加
    const ownerStaffId = await ctx.db.insert("staffs", {
      shopId,
      email: user.email,
      displayName: user.name,
      status: "active",
      invitedBy: trimmedAuthId,
      createdAt: Date.now(),
      isDeleted: false,
      role: "manager",
      userId: user._id,
    });

    // オーナーのスキルを初期化
    await initializeStaffSkills(ctx, shopId, ownerStaffId);

    return {
      success: true,
      data: { shopId, shopName: trimmedShopName },
    };
  },
});

// 店舗情報更新（オーナーのみ）
export const update = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
    shopName: v.optional(v.string()),
    openTime: v.optional(v.string()),
    closeTime: v.optional(v.string()),
    timeUnit: v.optional(v.number()),
    submitFrequency: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    const fieldsToUpdate: Partial<{
      shopName: string;
      openTime: string;
      closeTime: string;
      timeUnit: number;
      submitFrequency: string;
      description: string;
    }> = {};

    if (args.shopName) fieldsToUpdate.shopName = args.shopName.trim();
    if (args.openTime) fieldsToUpdate.openTime = args.openTime;
    if (args.closeTime) fieldsToUpdate.closeTime = args.closeTime;
    if (args.timeUnit) fieldsToUpdate.timeUnit = args.timeUnit;
    if (args.submitFrequency) fieldsToUpdate.submitFrequency = args.submitFrequency;
    if (args.description !== undefined) fieldsToUpdate.description = args.description;

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({ message: "更新するフィールドがありません", code: "NO_FIELDS_TO_UPDATE" });
    }

    await ctx.db.patch(args.shopId, fieldsToUpdate);

    return args.shopId;
  },
});

// 店舗削除（オーナーのみ）
export const remove = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    await ctx.db.patch(args.shopId, { isDeleted: true });

    return { success: true };
  },
});

// テスト用データリセット（メールアドレス指定）
export const resetUserByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // ユーザー検索
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();

    if (!user) {
      return { success: true, message: "User not found" };
    }

    // ユーザー削除
    await ctx.db.delete(user._id);

    if (user.authId) {
      const authId = user.authId;
      // 店舗削除
      const shops = await ctx.db
        .query("shops")
        .withIndex("by_created_by", (q) => q.eq("createdBy", authId))
        .collect();

      for (const shop of shops) {
        await ctx.db.delete(shop._id);
      }

      // スタッフ削除（自分が招待したスタッフ）
      const staffs = await ctx.db
        .query("staffs")
        .filter((q) => q.eq(q.field("invitedBy"), user.authId))
        .collect();

      for (const staff of staffs) {
        await ctx.db.delete(staff._id);
      }
    }

    return { success: true, deletedUser: user.email };
  },
});
