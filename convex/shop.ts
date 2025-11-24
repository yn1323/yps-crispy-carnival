import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT } from "./constants";

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

    // バリデーション: 時間形式チェック（簡易版: HH:mm形式）
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(args.openTime)) {
      throw new ConvexError({
        message: "開店時間の形式が不正です（HH:mm形式で入力してください）",
        code: "INVALID_TIME_FORMAT",
      });
    }
    if (!timeRegex.test(args.closeTime)) {
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", trimmedAuthId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (!user) {
      throw new ConvexError({
        message: "ユーザーが見つかりません",
        code: "USER_NOT_FOUND",
      });
    }

    // 店舗作成
    const shopId = await ctx.db
      .insert("shops", {
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
      })
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `店舗の作成に失敗しました: ${e}`,
          code: "CREATE_FAILED",
        });
      });

    // 作成者をownerとして自動紐付け
    await ctx.db
      .insert("shopUserBelongings", {
        shopId,
        userId: user._id,
        displayName: user.name,
        role: "owner",
        status: "active",
        createdAt: Date.now(),
        isDeleted: false,
      })
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `オーナー紐付けに失敗しました: ${e}`,
          code: "BELONGING_FAILED",
        });
      });

    // 作成者をmanagerとしても紐付け
    await ctx.db
      .insert("shopUserBelongings", {
        shopId,
        userId: user._id,
        displayName: user.name,
        role: "manager",
        status: "active",
        createdAt: Date.now(),
        isDeleted: false,
      })
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `マネージャー紐付けに失敗しました: ${e}`,
          code: "BELONGING_FAILED",
        });
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
    shopId: v.string(),
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
    try {
      const shopId = args.shopId as Id<"shops">;

      // 店舗存在チェック
      const shop = await ctx.db.get(shopId);
      if (!shop || shop.isDeleted) {
        throw new ConvexError({
          message: "店舗が見つかりません",
          code: "SHOP_NOT_FOUND",
        });
      }

      // authIdからuserIdを取得
      const user = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!user) {
        throw new ConvexError({
          message: "ユーザーが見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", user._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || (belonging.role !== "owner" && belonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません",
          code: "PERMISSION_DENIED",
        });
      }

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

      await ctx.db.patch(shopId, fieldsToUpdate).catch((e: unknown) => {
        throw new ConvexError({
          message: `店舗情報の更新に失敗しました: ${e}`,
          code: "UPDATE_FAILED",
        });
      });

      return shopId;
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// 店舗削除(ownerのみ)
export const deleteShop = mutation({
  args: {
    shopId: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;

      // 店舗存在チェック
      const shop = await ctx.db.get(shopId);
      if (!shop || shop.isDeleted) {
        throw new ConvexError({
          message: "店舗が見つかりません",
          code: "SHOP_NOT_FOUND",
        });
      }

      // authIdからuserIdを取得
      const user = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!user) {
        throw new ConvexError({
          message: "ユーザーが見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: ownerのみ
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", user._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || belonging.role !== "owner") {
        throw new ConvexError({
          message: "この操作を行う権限がありません（ownerのみ削除可能）",
          code: "PERMISSION_DENIED",
        });
      }

      // 論理削除
      await ctx.db.patch(shopId, { isDeleted: true }).catch((e: unknown) => {
        throw new ConvexError({
          message: `店舗の削除に失敗しました: ${e}`,
          code: "DELETE_FAILED",
        });
      });

      return { success: true };
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// ユーザーを店舗に追加(owner/managerのみ)
export const addUserToShop = mutation({
  args: {
    shopId: v.string(),
    userId: v.string(),
    role: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;
      const userId = args.userId as Id<"users">;

      // roleバリデーション（ownerは指定不可）
      if (args.role === "owner") {
        throw new ConvexError({
          message: "ownerロールは指定できません（ownerは店舗作成者のみ）",
          code: "INVALID_ROLE",
        });
      }

      if (args.role !== "manager" && args.role !== "staff") {
        throw new ConvexError({
          message: "ロールはmanagerまたはstaffのみ指定可能です",
          code: "INVALID_ROLE",
        });
      }

      // 店舗・ユーザー存在チェック
      const shop = await ctx.db.get(shopId);
      if (!shop || shop.isDeleted) {
        throw new ConvexError({
          message: "店舗が見つかりません",
          code: "SHOP_NOT_FOUND",
        });
      }

      const targetUser = await ctx.db.get(userId);
      if (!targetUser || targetUser.isDeleted) {
        throw new ConvexError({
          message: "追加するユーザーが見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 実行者のauthIdからuserIdを取得
      const executor = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!executor) {
        throw new ConvexError({
          message: "実行者が見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", executor._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || (belonging.role !== "owner" && belonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません",
          code: "PERMISSION_DENIED",
        });
      }

      // 既に所属していないかチェック
      const existingBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (existingBelonging) {
        throw new ConvexError({
          message: "このユーザーは既に店舗に所属しています",
          code: "ALREADY_BELONGS",
        });
      }

      // 紐付け追加
      const belongingId = await ctx.db
        .insert("shopUserBelongings", {
          shopId: shopId,
          userId: userId,
          displayName: targetUser.name,
          role: args.role,
          status: "active",
          createdAt: Date.now(),
          isDeleted: false,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `ユーザーの追加に失敗しました: ${e}`,
            code: "INSERT_FAILED",
          });
        });

      return belongingId;
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// ユーザーの役割変更(owner/managerが実行可能)
export const updateUserRole = mutation({
  args: {
    shopId: v.string(),
    userId: v.string(),
    newRole: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;
      const userId = args.userId as Id<"users">;

      // newRoleバリデーション
      if (args.newRole !== "manager" && args.newRole !== "staff") {
        throw new ConvexError({
          message: "ロールはmanagerまたはstaffのみ指定可能です",
          code: "INVALID_ROLE",
        });
      }

      // 実行者のauthIdからuserIdを取得
      const executor = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!executor) {
        throw new ConvexError({
          message: "実行者が見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const executorBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", executor._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!executorBelonging || (executorBelonging.role !== "owner" && executorBelonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません（owner/managerのみ実行可能）",
          code: "PERMISSION_DENIED",
        });
      }

      // 対象ユーザーの紐付けを取得
      const targetBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

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
      await ctx.db.patch(targetBelonging._id, { role: args.newRole }).catch((e: unknown) => {
        throw new ConvexError({
          message: `役割の変更に失敗しました: ${e}`,
          code: "UPDATE_FAILED",
        });
      });

      return targetBelonging._id;
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// 店舗IDで取得
export const getShopById = query({
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    try {
      const shop = await ctx.db.get(args.shopId as Id<"shops">);
      if (!shop || shop.isDeleted) {
        return null;
      }
      return shop;
    } catch {
      return null;
    }
  },
});

// authIdで所属店舗一覧取得
export const getShopsByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    // authIdからuserIdを取得
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (!user) {
      return [];
    }

    // ユーザーが所属する店舗を取得
    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("isDeleted"), true))
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
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;

      // 店舗に所属するユーザーを取得
      const belongings = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop", (q) => q.eq("shopId", shopId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // 各ユーザー情報を取得
      const users = await Promise.all(
        belongings.map(async (belonging) => {
          const user = await ctx.db.get(belonging.userId);
          if (!user || user.isDeleted) {
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
    } catch {
      return [];
    }
  },
});

// ユーザーの店舗内役割取得
export const getUserRoleInShop = query({
  args: {
    shopId: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;

      // authIdからuserIdを取得
      const user = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!user) {
        return null;
      }

      // 紐付けを取得
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", user._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      return belonging?.role ?? null;
    } catch {
      return null;
    }
  },
});
