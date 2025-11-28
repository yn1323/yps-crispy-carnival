import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT, SHOP_USER_ROLE, type ShopUserRoleType } from "./constants";
import {
  getShopBelonging,
  getUserByAuthId,
  isValidTimeFormat,
  requireShop,
  requireShopPermission,
  requireUserByAuthId,
} from "./helpers";

// 店舗作成 + owner自動紐付け
export const createShop = mutation({
  args: {
    shopName: v.string(),
    openTime: v.string(),
    closeTime: v.string(),
    timeUnit: v.number(),
    submitFrequency: v.string(),
    useTimeCard: v.boolean(),
    description: v.optional(v.string()),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // trim処理
    const trimmedShopName = args.shopName.trim();
    const trimmedAuthId = args.authId.trim();

    // バリデーション: 店舗名
    if (!trimmedShopName) {
      throw new ConvexError({
        message: "店舗名は必須です",
        code: "EMPTY_SHOP_NAME",
      });
    }

    // バリデーション: authId
    if (!trimmedAuthId) {
      throw new ConvexError({
        message: "認証IDは必須です",
        code: "EMPTY_AUTH_ID",
      });
    }

    // バリデーション: 時間形式チェック
    if (!isValidTimeFormat(args.openTime)) {
      throw new ConvexError({
        message: "開店時間の形式が不正です（HH:mm形式で入力してください）",
        code: "INVALID_TIME_FORMAT",
      });
    }
    if (!isValidTimeFormat(args.closeTime)) {
      throw new ConvexError({
        message: "閉店時間の形式が不正です（HH:mm形式で入力してください）",
        code: "INVALID_TIME_FORMAT",
      });
    }

    // バリデーション: timeUnit
    if (!SHOP_TIME_UNIT.includes(args.timeUnit as (typeof SHOP_TIME_UNIT)[number])) {
      throw new ConvexError({
        message: "シフト時間単位が不正です",
        code: "INVALID_TIME_UNIT",
      });
    }

    // バリデーション: submitFrequency
    if (!SHOP_SUBMIT_FREQUENCY.includes(args.submitFrequency as (typeof SHOP_SUBMIT_FREQUENCY)[number])) {
      throw new ConvexError({
        message: "シフト提出頻度が不正です",
        code: "INVALID_SUBMIT_FREQUENCY",
      });
    }

    // authIdからuserIdを取得
    const user = await requireUserByAuthId(ctx, trimmedAuthId);

    // 店舗作成
    const shopId = await ctx.db.insert("shops", {
      shopName: trimmedShopName,
      openTime: args.openTime,
      closeTime: args.closeTime,
      timeUnit: args.timeUnit,
      submitFrequency: args.submitFrequency,
      avatar: "",
      useTimeCard: args.useTimeCard,
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
      data: {
        shopId,
        shopName: trimmedShopName,
      },
    };
  },
});

// 店舗情報更新（owner/managerのみ）
export const updateShop = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
    shopName: v.optional(v.string()),
    openTime: v.optional(v.string()),
    closeTime: v.optional(v.string()),
    timeUnit: v.optional(v.number()),
    submitFrequency: v.optional(v.string()),
    useTimeCard: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // authIdからuserIdを取得
    const user = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック: owner/manager
    await requireShopPermission(ctx, args.shopId, user._id);

    // 更新フィールドを構築
    const fieldsToUpdate: Partial<{
      shopName: string;
      openTime: string;
      closeTime: string;
      timeUnit: number;
      submitFrequency: string;
      useTimeCard: boolean;
      description: string;
    }> = {};

    if (args.shopName) fieldsToUpdate.shopName = args.shopName.trim();
    if (args.openTime) fieldsToUpdate.openTime = args.openTime;
    if (args.closeTime) fieldsToUpdate.closeTime = args.closeTime;
    if (args.timeUnit) fieldsToUpdate.timeUnit = args.timeUnit;
    if (args.submitFrequency) fieldsToUpdate.submitFrequency = args.submitFrequency;
    if (args.useTimeCard !== undefined) fieldsToUpdate.useTimeCard = args.useTimeCard;
    if (args.description !== undefined) fieldsToUpdate.description = args.description;

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({
        message: "更新するフィールドがありません",
        code: "NO_FIELDS_TO_UPDATE",
      });
    }

    await ctx.db.patch(args.shopId, fieldsToUpdate);

    return args.shopId;
  },
});

// 店舗削除(ownerのみ)
export const deleteShop = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // authIdからuserIdを取得
    const user = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック: ownerのみ
    await requireShopPermission(ctx, args.shopId, user._id, ["owner"]);

    // 論理削除
    await ctx.db.patch(args.shopId, { isDeleted: true });

    return { success: true };
  },
});

// ユーザーを店舗に追加(owner/managerのみ)
export const addUserToShop = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    role: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // roleバリデーション
    if (!SHOP_USER_ROLE.includes(args.role as ShopUserRoleType)) {
      throw new ConvexError({
        message: `役割は${SHOP_USER_ROLE.join("、")}のいずれかを指定してください`,
        code: "INVALID_ROLE",
      });
    }

    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // 追加対象ユーザー存在チェック
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.isDeleted) {
      throw new ConvexError({
        message: "追加するユーザーが見つかりません",
        code: "USER_NOT_FOUND",
      });
    }

    // 実行者のauthIdからuserIdを取得
    const executor = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック: owner/manager
    await requireShopPermission(ctx, args.shopId, executor._id);

    // 既に所属していないかチェック
    const existingBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (existingBelonging) {
      throw new ConvexError({
        message: "このユーザーは既に店舗に所属しています",
        code: "ALREADY_BELONGS",
      });
    }

    // 紐付け追加
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

// ユーザーの役割変更(owner/managerが実行可能)
export const updateUserRole = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    newRole: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // newRoleバリデーション
    if (args.newRole !== "manager" && args.newRole !== "staff") {
      throw new ConvexError({
        message: "ロールはmanagerまたはstaffのみ指定可能です",
        code: "INVALID_ROLE",
      });
    }

    // 実行者のauthIdからuserIdを取得
    const executor = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック: owner/manager
    await requireShopPermission(ctx, args.shopId, executor._id);

    // 対象ユーザーの紐付けを取得
    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({
        message: "対象ユーザーが店舗に所属していません",
        code: "BELONGING_NOT_FOUND",
      });
    }

    // ownerの役割変更は不可
    if (targetBelonging.role === "owner") {
      throw new ConvexError({
        message: "ownerの役割は変更できません",
        code: "CANNOT_CHANGE_OWNER_ROLE",
      });
    }

    // 役割更新
    await ctx.db.patch(targetBelonging._id, { role: args.newRole });

    return targetBelonging._id;
  },
});

// 店舗IDで取得
export const getShopById = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const shop = await ctx.db.get(args.shopId);
    if (!shop || shop.isDeleted) {
      return null;
    }
    return shop;
  },
});

// authIdで所属店舗一覧取得
export const getShopsByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    // authIdからuserIdを取得
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return [];
    }

    // ユーザーが所属する店舗を取得（退職済みは除外）
    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("status"), "resigned")))
      .collect();

    // 各店舗情報を取得
    const shops = await Promise.all(
      belongings.map(async (belonging) => {
        const shop = await ctx.db.get(belonging.shopId);
        if (!shop || shop.isDeleted) {
          return null;
        }

        // 店舗の所属人数を取得（ユニークなuserIdの数をカウント）
        const belongingStaff = await ctx.db
          .query("shopUserBelongings")
          .withIndex("by_shop", (q) => q.eq("shopId", belonging.shopId))
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect();

        // ユニークなuserIdを抽出
        const uniqueUserIds = new Set(belongingStaff.map((staff) => staff.userId));
        const staffCount = uniqueUserIds.size;

        return {
          ...shop,
          role: belonging.role,
          staffCount,
        };
      }),
    );

    return shops.filter((shop) => shop !== null);
  },
});

// 店舗所属ユーザー一覧取得
export const getUsersInShop = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 呼び出し元ユーザーの権限を取得
    const currentUser = await getUserByAuthId(ctx, args.authId);

    let currentUserRole: ShopUserRoleType | null = null;
    if (currentUser) {
      const currentBelonging = await getShopBelonging(ctx, args.shopId, currentUser._id);
      currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;
    }

    // 店舗に所属するユーザーを取得
    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // 各ユーザー情報を取得
    const users = await Promise.all(
      belongings.map(async (belonging) => {
        const user = await ctx.db.get(belonging.userId);
        if (!user || user.isDeleted) {
          return null;
        }

        // general権限の場合、activeユーザーのみ表示
        if (currentUserRole === "general" && belonging.status !== "active") {
          return null;
        }

        return {
          _id: user._id,
          name: user.name,
          displayName: belonging.displayName,
          authId: user.authId,
          role: belonging.role,
          status: belonging.status,
          createdAt: belonging.createdAt,
        };
      }),
    );

    return users.filter((user) => user !== null);
  },
});

// ユーザーの店舗内役割取得
export const getUserRoleInShop = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // authIdからuserIdを取得
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return null;
    }

    // 紐付けを取得
    const belonging = await getShopBelonging(ctx, args.shopId, user._id);

    return belonging?.role ?? null;
  },
});

// ユーザーを店舗から退職処理(owner/managerのみ実行可能、自分自身は不可)
export const resignUserFromShop = mutation({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    authId: v.string(),
    resignationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // 実行者のauthIdからuserIdを取得
    const executor = await requireUserByAuthId(ctx, args.authId);

    // 自分自身の退職は不可
    if (executor._id === args.userId) {
      throw new ConvexError({
        message: "自分自身を退職処理することはできません",
        code: "CANNOT_RESIGN_SELF",
      });
    }

    // 権限チェック: owner/manager
    const executorBelonging = await requireShopPermission(ctx, args.shopId, executor._id);

    // 対象ユーザーの紐付けを取得
    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({
        message: "対象ユーザーが店舗に所属していません",
        code: "BELONGING_NOT_FOUND",
      });
    }

    // 既に退職済みの場合はエラー
    if (targetBelonging.status === "resigned") {
      throw new ConvexError({
        message: "このユーザーは既に退職済みです",
        code: "ALREADY_RESIGNED",
      });
    }

    // ownerの退職は不可
    if (targetBelonging.role === "owner") {
      throw new ConvexError({
        message: "オーナーを退職処理することはできません",
        code: "CANNOT_RESIGN_OWNER",
      });
    }

    // managerがmanagerを退職させることは不可
    if (executorBelonging.role === "manager" && targetBelonging.role === "manager") {
      throw new ConvexError({
        message: "マネージャーは他のマネージャーを退職処理できません",
        code: "CANNOT_RESIGN_MANAGER",
      });
    }

    // 退職処理
    await ctx.db.patch(targetBelonging._id, {
      status: "resigned",
      resignedAt: Date.now(),
      resignationReason: args.resignationReason,
    });

    return { success: true };
  },
});

// ユーザーが新規店舗を作成できるかチェック
// 条件: 店舗未所属 OR いずれかの店舗でownerである
export const canUserCreateShop = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    // authIdからuserIdを取得
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      // ユーザーが見つからない場合は作成可能（新規ユーザー想定）
      return true;
    }

    // ユーザーが所属する店舗を取得
    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // 店舗未所属の場合は作成可能
    if (belongings.length === 0) {
      return true;
    }

    // いずれかの店舗でownerであれば作成可能
    const isOwner = belongings.some((b) => b.role === "owner");
    return isOwner;
  },
});

// 店舗内ユーザーの管理情報取得（owner/managerのみ）
export const getShopUserInfo = query({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 実行者の権限チェック
    const executor = await getUserByAuthId(ctx, args.authId);

    if (!executor) {
      return null;
    }

    const executorBelonging = await getShopBelonging(ctx, args.shopId, executor._id);

    // owner/manager以外は閲覧不可
    if (!executorBelonging || (executorBelonging.role !== "owner" && executorBelonging.role !== "manager")) {
      return null;
    }

    // 対象ユーザーの情報を取得
    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);

    if (!targetBelonging) {
      return null;
    }

    return {
      memo: targetBelonging.memo ?? "",
      workStyleNote: targetBelonging.workStyleNote ?? "",
      maxWorkingHoursPerMonth: targetBelonging.maxWorkingHoursPerMonth ?? null,
      hourlyWage: targetBelonging.hourlyWage ?? null,
    };
  },
});

// 店舗内ユーザーの管理情報更新（owner/managerのみ）
export const updateShopUserInfo = mutation({
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
    // 実行者の権限チェック
    const executor = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック: owner/manager
    await requireShopPermission(ctx, args.shopId, executor._id);

    // 対象ユーザーの紐付けを取得
    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);
    if (!targetBelonging) {
      throw new ConvexError({
        message: "対象ユーザーが店舗に所属していません",
        code: "BELONGING_NOT_FOUND",
      });
    }

    // 更新フィールドを構築
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
      throw new ConvexError({
        message: "更新するフィールドがありません",
        code: "NO_FIELDS_TO_UPDATE",
      });
    }

    await ctx.db.patch(targetBelonging._id, fieldsToUpdate);

    return { success: true };
  },
});
