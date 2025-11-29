/**
 * 店舗ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 店舗のCRUD操作
 * - ユーザー追加・役割変更・退職処理
 * - 権限チェックを含むビジネスロジック
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT, SHOP_USER_ROLE, type ShopUserRoleType } from "../constants";
import {
  getShopBelonging,
  isValidTimeFormat,
  requireShop,
  requireShopPermission,
  requireUserByAuthId,
} from "../helpers";
import { canResignUser, canUpdateShopUserInfo, canUpdateUserRole } from "./policies";

// 店舗作成 + owner自動紐付け
export const create = mutation({
  args: {
    shopName: v.string(),
    openTime: v.string(),
    closeTime: v.string(),
    timeUnit: v.number(),
    submitFrequency: v.string(),
    description: v.optional(v.string()),
    authId: v.string(),
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

    // 作成者をownerとして自動紐付け
    await ctx.db.insert("shopUserBelongings", {
      shopId,
      userId: user._id,
      displayName: user.name,
      role: "owner",
      status: "active",
      createdAt: Date.now(),
      isDeleted: false,
    });

    return {
      success: true,
      data: { shopId, shopName: trimmedShopName },
    };
  },
});

// 店舗情報更新（owner/managerのみ）
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
    const user = await requireUserByAuthId(ctx, args.authId);
    await requireShopPermission(ctx, args.shopId, user._id);

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

// 店舗削除（ownerのみ）
export const remove = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    const user = await requireUserByAuthId(ctx, args.authId);
    await requireShopPermission(ctx, args.shopId, user._id, ["owner"]);

    await ctx.db.patch(args.shopId, { isDeleted: true });

    return { success: true };
  },
});

// ユーザーを店舗に追加（owner/managerのみ）
export const addUser = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    role: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!SHOP_USER_ROLE.includes(args.role as ShopUserRoleType)) {
      throw new ConvexError({
        message: `役割は${SHOP_USER_ROLE.join("、")}のいずれかを指定してください`,
        code: "INVALID_ROLE",
      });
    }

    await requireShop(ctx, args.shopId);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.isDeleted) {
      throw new ConvexError({ message: "追加するユーザーが見つかりません", code: "USER_NOT_FOUND" });
    }

    const executor = await requireUserByAuthId(ctx, args.authId);
    await requireShopPermission(ctx, args.shopId, executor._id);

    const existingBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (existingBelonging) {
      throw new ConvexError({ message: "このユーザーは既に店舗に所属しています", code: "ALREADY_BELONGS" });
    }

    const belongingId = await ctx.db.insert("shopUserBelongings", {
      shopId: args.shopId,
      userId: args.userId,
      displayName: targetUser.name,
      role: args.role,
      status: "active",
      createdAt: Date.now(),
      isDeleted: false,
    });

    return belongingId;
  },
});

// ユーザーの役割変更（owner/managerが実行可能）
export const updateUserRole = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    newRole: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newRole !== "manager" && args.newRole !== "staff") {
      throw new ConvexError({ message: "ロールはmanagerまたはstaffのみ指定可能です", code: "INVALID_ROLE" });
    }

    const executor = await requireUserByAuthId(ctx, args.authId);
    const executorBelonging = await getShopBelonging(ctx, args.shopId, executor._id);

    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({ message: "対象ユーザーが店舗に所属していません", code: "BELONGING_NOT_FOUND" });
    }

    // ポリシーで権限チェック
    if (!canUpdateUserRole(executorBelonging?.role as ShopUserRoleType, targetBelonging.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    await ctx.db.patch(targetBelonging._id, { role: args.newRole });

    return targetBelonging._id;
  },
});

// ユーザーを店舗から退職処理（owner/managerのみ、自分自身は不可）
export const resignUser = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    authId: v.string(),
    resignationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    const executor = await requireUserByAuthId(ctx, args.authId);

    if (executor._id === args.userId) {
      throw new ConvexError({ message: "自分自身を退職処理することはできません", code: "CANNOT_RESIGN_SELF" });
    }

    const executorBelonging = await getShopBelonging(ctx, args.shopId, executor._id);

    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({ message: "対象ユーザーが店舗に所属していません", code: "BELONGING_NOT_FOUND" });
    }

    if (targetBelonging.status === "resigned") {
      throw new ConvexError({ message: "このユーザーは既に退職済みです", code: "ALREADY_RESIGNED" });
    }

    // ポリシーで権限チェック
    if (!canResignUser(executorBelonging?.role as ShopUserRoleType, targetBelonging.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    await ctx.db.patch(targetBelonging._id, {
      status: "resigned",
      resignedAt: Date.now(),
      resignationReason: args.resignationReason,
    });

    return { success: true };
  },
});

// 店舗内ユーザーの管理情報更新（owner/managerのみ）
export const updateUserInfo = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    authId: v.string(),
    memo: v.optional(v.string()),
    workStyleNote: v.optional(v.string()),
    maxWorkingHoursPerMonth: v.optional(v.union(v.number(), v.null())),
    hourlyWage: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const executor = await requireUserByAuthId(ctx, args.authId);
    const executorBelonging = await getShopBelonging(ctx, args.shopId, executor._id);

    // ポリシーで権限チェック
    if (!canUpdateShopUserInfo(executorBelonging?.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({ message: "対象ユーザーが店舗に所属していません", code: "BELONGING_NOT_FOUND" });
    }

    const fieldsToUpdate: Partial<{
      memo: string;
      workStyleNote: string;
      maxWorkingHoursPerMonth: number | undefined;
      hourlyWage: number | undefined;
    }> = {};

    if (args.memo !== undefined) {
      fieldsToUpdate.memo = args.memo;
    }
    if (args.workStyleNote !== undefined) {
      fieldsToUpdate.workStyleNote = args.workStyleNote;
    }
    if (args.maxWorkingHoursPerMonth !== undefined) {
      fieldsToUpdate.maxWorkingHoursPerMonth = args.maxWorkingHoursPerMonth ?? undefined;
    }
    if (args.hourlyWage !== undefined) {
      fieldsToUpdate.hourlyWage = args.hourlyWage ?? undefined;
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({ message: "更新するフィールドがありません", code: "NO_FIELDS_TO_UPDATE" });
    }

    await ctx.db.patch(targetBelonging._id, fieldsToUpdate);

    return { success: true };
  },
});
