/**
 * 店舗ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗情報の取得
 * - 店舗一覧の取得
 * - 権限ベースの情報フィルタリング
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { ShopUserRoleType } from "../constants";
import { getShopBelonging, getUserByAuthId } from "../helpers";
import { canViewResignedUsers, canViewShopUserInfo } from "./policies";

// 店舗IDで取得（単純なCRUD）
export const getById = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const shop = await ctx.db.get(args.shopId);
    if (!shop || shop.isDeleted) {
      return null;
    }
    return shop;
  },
});

// authIdで所属店舗一覧取得（ロール情報・人数付き）
export const listByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
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

        // 店舗の所属人数を取得
        const belongingStaff = await ctx.db
          .query("shopUserBelongings")
          .withIndex("by_shop", (q) => q.eq("shopId", belonging.shopId))
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect();

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
export const listUsers = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getUserByAuthId(ctx, args.authId);

    let currentUserRole: ShopUserRoleType | null = null;
    if (currentUser) {
      const currentBelonging = await getShopBelonging(ctx, args.shopId, currentUser._id);
      currentUserRole = (currentBelonging?.role as ShopUserRoleType) ?? null;
    }

    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const users = await Promise.all(
      belongings.map(async (belonging) => {
        const user = await ctx.db.get(belonging.userId);
        if (!user || user.isDeleted) {
          return null;
        }

        // 退職済みユーザーの表示権限チェック
        if (!canViewResignedUsers(currentUserRole) && belonging.status !== "active") {
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
export const getUserRole = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return null;
    }

    const belonging = await getShopBelonging(ctx, args.shopId, user._id);

    return belonging?.role ?? null;
  },
});

// ユーザーが新規店舗を作成できるかチェック
export const canCreate = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return true;
    }

    const belongings = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    if (belongings.length === 0) {
      return true;
    }

    const isOwner = belongings.some((b) => b.role === "owner");
    return isOwner;
  },
});

// 店舗内ユーザーの管理情報取得（owner/managerのみ）
export const getUserInfo = query({
  args: {
    shopId: v.id("shops"),
    userId: v.id("users"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const executor = await getUserByAuthId(ctx, args.authId);

    if (!executor) {
      return null;
    }

    const executorBelonging = await getShopBelonging(ctx, args.shopId, executor._id);

    // ポリシーで権限チェック
    if (!canViewShopUserInfo(executorBelonging?.role as ShopUserRoleType)) {
      return null;
    }

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
