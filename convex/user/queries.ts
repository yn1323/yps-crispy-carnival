/**
 * ユーザードメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - ユーザー情報の取得
 * - 権限ベースの情報フィルタリング
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { ShopUserRoleType } from "../constants";
import { getShopBelonging, getUserByAuthId as getUserByAuthIdHelper } from "../helpers";
import { canViewFullUserInfo, canViewUserShops } from "./policies";

// authIdでユーザー取得
export const getByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    return await getUserByAuthIdHelper(ctx, args.authId);
  },
});

// すべてのユーザー取得（管理用）
export const listAll = query({
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
export const getById = query({
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

    // ポリシーで権限チェック
    if (canViewFullUserInfo(currentUserRole)) {
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

// 特定ユーザーが所属する店舗一覧取得（ロール情報付き、権限ベースの情報制限付き）
export const getShops = query({
  args: {
    userId: v.id("users"),
    authId: v.string(),
    shopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return [];
    }

    const currentUser = await getUserByAuthIdHelper(ctx, args.authId);

    if (!currentUser) {
      return [];
    }

    // 自分自身の場合は全情報を返す
    const isSelf = currentUser._id === args.userId;

    // 呼び出し元の店舗内役割を取得
    const currentBelonging = await getShopBelonging(ctx, args.shopId, currentUser._id);
    const currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;

    // ポリシーで権限チェック
    if (!isSelf && !canViewUserShops(currentUserRole)) {
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
