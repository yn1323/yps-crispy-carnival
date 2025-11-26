import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { ShopUserRoleType } from "./constants";

// ユーザー作成
export const createUser = mutation({
  args: {
    name: v.string(),
    authId: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 入力値バリデーション
    if (!args.name.trim()) {
      throw new ConvexError({
        message: "名前は必須です",
        code: "EMPTY_NAME",
      });
    }

    // authIdがある場合は本登録、なければ仮登録
    const status = args.status ?? (args.authId ? "active" : "pending");

    const userId = await ctx.db
      .insert("users", {
        name: args.name.trim(),
        authId: args.authId,
        status,
        createdAt: Date.now(),
        isDeleted: false,
      })
      .then((userId) => userId)
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `ユーザーの作成に失敗しました: ${e}`,
          code: "CREATE_FAILED",
        });
      });

    return {
      success: true,
      data: { userId, authId: args.authId, name: args.name.trim(), status },
    };
  },
});

// authIdでユーザー取得
export const getUserByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first()
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `ユーザー取得に失敗しました: ${e}`,
          code: "QUERY_FAILED",
        });
      });
  },
});

// ユーザー情報更新
export const updateUser = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // ユーザー存在チェック
    const existingUser = await ctx.db.get(id);
    if (!existingUser || existingUser.isDeleted) {
      throw new ConvexError({
        message: "指定されたユーザーが見つかりません",
        code: "USER_NOT_FOUND",
      });
    }

    // 入力値バリデーション
    if (!updates?.name?.trim()) {
      throw new ConvexError({
        message: "名前は空にできません",
        code: "EMPTY_NAME",
      });
    }

    // 更新するフィールドのみを含むオブジェクトを作成
    const fieldsToUpdate: Partial<{
      name: string;
    }> = {};
    if (updates.name) {
      fieldsToUpdate.name = updates.name.trim();
    }

    // 更新するフィールドがない場合
    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({
        message: "更新するフィールドがありません",
        code: "NO_FIELDS_TO_UPDATE",
      });
    }

    return await ctx.db
      .patch(id, fieldsToUpdate)
      .then(() => id)
      .catch((e: unknown) => {
        throw new ConvexError({
          message: `ユーザー情報の更新に失敗しました: ${e}`,
          code: "UPDATE_FAILED",
        });
      });
  },
});

// すべてのユーザー取得（管理用）
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .order("desc")
      .collect();
  },
});

// ユーザーIDで取得（権限ベースの情報制限付き）
export const getUserById = query({
  args: {
    userId: v.string(),
    authId: v.string(),
    shopId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const userId = args.userId as Id<"users">;
      const shopId = args.shopId as Id<"shops">;

      const user = await ctx.db.get(userId);
      if (!user || user.isDeleted) {
        return null;
      }

      // 呼び出し元ユーザーの情報を取得
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!currentUser) {
        return null;
      }

      // 自分自身の場合は全情報を返す
      if (currentUser._id === userId) {
        return user;
      }

      // 呼び出し元の店舗内役割を取得
      const currentBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", currentUser._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      const currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;

      // owner/managerは全情報を見れる
      if (currentUserRole === "owner" || currentUserRole === "manager") {
        return user;
      }

      // 対象ユーザーの店舗内役割を取得（制限ビュー用）
      const targetBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      // generalは他人の詳細を見れない（名前と役割のみ）
      return {
        _id: user._id,
        name: user.name,
        role: targetBelonging?.role ?? null,
        isLimitedView: true as const,
      };
    } catch {
      return null;
    }
  },
});

// 特定ユーザーが所属する店舗一覧取得(ロール情報付き、権限ベースの情報制限付き)
export const getUserShops = query({
  args: {
    userId: v.string(),
    authId: v.string(),
    shopId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const userId = args.userId as Id<"users">;
      const shopId = args.shopId as Id<"shops">;

      // ユーザー存在チェック
      const user = await ctx.db.get(userId);
      if (!user || user.isDeleted) {
        return [];
      }

      // 呼び出し元ユーザーの情報を取得
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!currentUser) {
        return [];
      }

      // 自分自身の場合は全情報を返す
      const isSelf = currentUser._id === userId;

      // 呼び出し元の店舗内役割を取得
      const currentBelonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", currentUser._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      const currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;

      // generalは他人の所属店舗を見れない
      if (!isSelf && currentUserRole !== "owner" && currentUserRole !== "manager") {
        return [];
      }

      // ユーザーが所属する店舗を取得
      const belongings = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // 各店舗情報を取得
      const shops = await Promise.all(
        belongings.map(async (belonging) => {
          const shop = await ctx.db.get(belonging.shopId);
          if (!shop || shop.isDeleted) {
            return null;
          }
          return {
            ...shop,
            role: belonging.role,
          };
        }),
      );

      return shops.filter((shop) => shop !== null);
    } catch {
      return [];
    }
  },
});
