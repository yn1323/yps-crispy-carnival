// Convex用ヘルパー関数
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ShopUserRoleType } from "./constants";

// セキュアなトークン生成（crypto APIを使用）
export const generateToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// authIdからユーザーを取得
export const getUserByAuthId = async (ctx: QueryCtx | MutationCtx, authId: string) => {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", authId))
    .filter((q) => q.neq(q.field("isDeleted"), true))
    .first();

  return user;
};

// authIdからユーザーを取得（存在しない場合はエラー）
export const requireUserByAuthId = async (ctx: QueryCtx | MutationCtx, authId: string) => {
  const user = await getUserByAuthId(ctx, authId);

  if (!user) {
    throw new ConvexError({
      message: "ユーザーが見つかりません",
      code: "USER_NOT_FOUND",
    });
  }

  return user;
};

// 店舗への所属情報を取得
export const getShopBelonging = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, userId: Id<"users">) => {
  const belonging = await ctx.db
    .query("shopUserBelongings")
    .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
    .filter((q) => q.neq(q.field("isDeleted"), true))
    .first();

  return belonging;
};

// 店舗の権限チェック（owner/managerのみ許可）
export const requireShopPermission = async (
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  userId: Id<"users">,
  allowedRoles: ShopUserRoleType[] = ["owner", "manager"],
) => {
  const belonging = await getShopBelonging(ctx, shopId, userId);

  if (!belonging || !allowedRoles.includes(belonging.role as ShopUserRoleType)) {
    throw new ConvexError({
      message: "この操作を行う権限がありません",
      code: "PERMISSION_DENIED",
    });
  }

  return belonging;
};

// 店舗存在チェック（存在しない場合はエラー）
export const requireShop = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">) => {
  const shop = await ctx.db.get(shopId);

  if (!shop || shop.isDeleted) {
    throw new ConvexError({
      message: "店舗が見つかりません",
      code: "SHOP_NOT_FOUND",
    });
  }

  return shop;
};

// 時刻形式バリデーション（HH:mm形式）
export const isValidTimeFormat = (time: string) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(time);
};
