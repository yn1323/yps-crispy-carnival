import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { ShopUserRoleType } from "./constants";
import { getShopBelonging, getUserByAuthId as getUserByAuthIdHelper } from "./helpers";

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

    const userId = await ctx.db.insert("users", {
      name: args.name.trim(),
      authId: args.authId,
      status,
      createdAt: Date.now(),
      isDeleted: false,
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
    return await getUserByAuthIdHelper(ctx, args.authId);
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

    await ctx.db.patch(id, fieldsToUpdate);
    return id;
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
    userId: v.id("users"),
    authId: v.string(),
    shopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return null;
    }

    // 呼び出し元ユーザーの情報を取得
    const currentUser = await getUserByAuthIdHelper(ctx, args.authId);

    if (!currentUser) {
      return null;
    }

    // 自分自身の場合は全情報を返す
    if (currentUser._id === args.userId) {
      return user;
    }

    // 呼び出し元の店舗内役割を取得
    const currentBelonging = await getShopBelonging(ctx, args.shopId, currentUser._id);
    const currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;

    // owner/managerは全情報を見れる
    if (currentUserRole === "owner" || currentUserRole === "manager") {
      return user;
    }

    // 対象ユーザーの店舗内役割を取得（制限ビュー用）
    const targetBelonging = await getShopBelonging(ctx, args.shopId, args.userId);

    // generalは他人の詳細を見れない（名前と役割のみ）
    return {
      _id: user._id,
      name: user.name,
      role: targetBelonging?.role ?? null,
      isLimitedView: true as const,
    };
  },
});

// 特定ユーザーが所属する店舗一覧取得(ロール情報付き、権限ベースの情報制限付き)
export const getUserShops = query({
  args: {
    userId: v.id("users"),
    authId: v.string(),
    shopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    // ユーザー存在チェック
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return [];
    }

    // 呼び出し元ユーザーの情報を取得
    const currentUser = await getUserByAuthIdHelper(ctx, args.authId);

    if (!currentUser) {
      return [];
    }

    // 自分自身の場合は全情報を返す
    const isSelf = currentUser._id === args.userId;

    // 呼び出し元の店舗内役割を取得
    const currentBelonging = await getShopBelonging(ctx, args.shopId, currentUser._id);
    const currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;

    // generalは他人の所属店舗を見れない
    if (!isSelf && currentUserRole !== "owner" && currentUserRole !== "manager") {
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
