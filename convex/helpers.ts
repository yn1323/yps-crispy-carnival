// Convex用ヘルパー関数
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// セキュアなトークン生成（crypto APIを使用）
export const generateToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// authIdからユーザー（管理者）を取得
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

// 店舗のオーナー（作成者）かどうかチェック
export const isShopOwner = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, authId: string) => {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return false;
  return shop.createdBy === authId;
};

// 店舗のオーナーであることを要求
export const requireShopOwner = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, authId: string) => {
  const isOwner = await isShopOwner(ctx, shopId, authId);

  if (!isOwner) {
    throw new ConvexError({
      message: "この操作を行う権限がありません",
      code: "PERMISSION_DENIED",
    });
  }

  return true;
};

// スタッフを取得（店舗ID + スタッフID）
export const getStaff = async (ctx: QueryCtx | MutationCtx, staffId: Id<"staffs">) => {
  const staff = await ctx.db.get(staffId);
  if (!staff || staff.isDeleted) return null;
  return staff;
};

// スタッフを取得（店舗ID + メールアドレス）
export const getStaffByEmail = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, email: string) => {
  const staff = await ctx.db
    .query("staffs")
    .withIndex("by_shop_and_email", (q) => q.eq("shopId", shopId).eq("email", email))
    .filter((q) => q.neq(q.field("isDeleted"), true))
    .first();

  return staff;
};

// マジックリンクトークンでスタッフを取得
export const getStaffByMagicLinkToken = async (ctx: QueryCtx | MutationCtx, token: string) => {
  const staff = await ctx.db
    .query("staffs")
    .withIndex("by_magic_link_token", (q) => q.eq("magicLinkToken", token))
    .filter((q) => q.neq(q.field("isDeleted"), true))
    .first();

  return staff;
};

// 招待トークンでスタッフを取得
export const getStaffByInviteToken = async (ctx: QueryCtx | MutationCtx, token: string) => {
  const staff = await ctx.db
    .query("staffs")
    .withIndex("by_invite_token", (q) => q.eq("inviteToken", token))
    .filter((q) => q.neq(q.field("isDeleted"), true))
    .first();

  return staff;
};

// 店舗のオーナーまたはマネージャーかどうかチェック
export const isShopOwnerOrManager = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, authId: string) => {
  // まずオーナーかどうかチェック
  const isOwner = await isShopOwner(ctx, shopId, authId);
  if (isOwner) return true;

  // ユーザーを取得
  const user = await getUserByAuthId(ctx, authId);
  if (!user) return false;

  // スタッフとしてマネージャーかどうかチェック
  const staff = await ctx.db
    .query("staffs")
    .withIndex("by_shop", (q) => q.eq("shopId", shopId))
    .filter((q) =>
      q.and(q.eq(q.field("userId"), user._id), q.neq(q.field("isDeleted"), true), q.eq(q.field("role"), "manager")),
    )
    .first();

  return !!staff;
};

// 店舗のオーナーまたはマネージャーであることを要求
export const requireShopOwnerOrManager = async (ctx: QueryCtx | MutationCtx, shopId: Id<"shops">, authId: string) => {
  const isOwnerOrManager = await isShopOwnerOrManager(ctx, shopId, authId);

  if (!isOwnerOrManager) {
    throw new ConvexError({
      message: "この操作を行う権限がありません",
      code: "PERMISSION_DENIED",
    });
  }

  return true;
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
