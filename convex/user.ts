import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ユーザー作成
export const createUser = mutation({
  args: {
    name: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 入力値バリデーション
    if (!args.name.trim()) {
      throw new ConvexError({
        message: "名前は必須です",
        code: "EMPTY_NAME",
      });
    }

    if (!args.authId.trim()) {
      throw new ConvexError({
        message: "認証IDは必須です",
        code: "EMPTY_AUTH_ID",
      });
    }

    const userId = await ctx.db
      .insert("users", {
        name: args.name.trim(),
        authId: args.authId,
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
      data: { userId, authId: args.authId, name: args.name.trim() },
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

// ユーザーIDで取得
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return null;
    }
    return user;
  },
});

// 特定ユーザーが所属する店舗一覧取得（ロール情報付き）
export const getUserShops = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // ユーザー存在チェック
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return [];
    }

    // ユーザーが所属する店舗を取得
    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
  },
});
