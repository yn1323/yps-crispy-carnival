/**
 * 招待ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 招待のCRUD操作
 * - 招待承認処理
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { INVITE_EXPIRY_MS, SHOP_USER_ROLE, type ShopUserRoleType } from "../constants";
import { generateToken, getShopBelonging, getUserByAuthId, requireShop, requireUserByAuthId } from "../helpers";
import { canManageInvitation } from "./policies";

// 招待作成
export const create = mutation({
  args: {
    shopId: v.id("shops"),
    displayName: v.string(),
    role: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const displayName = args.displayName.trim();
    if (displayName.length < 2 || displayName.length > 20) {
      throw new ConvexError({
        message: "表示名は2〜20文字で入力してください",
        code: "INVALID_DISPLAY_NAME",
      });
    }

    if (!SHOP_USER_ROLE.includes(args.role as ShopUserRoleType)) {
      throw new ConvexError({
        message: `役割は${SHOP_USER_ROLE.join("、")}のいずれかを指定してください`,
        code: "INVALID_ROLE",
      });
    }

    const inviter = await requireUserByAuthId(ctx, args.authId);
    await requireShop(ctx, args.shopId);

    const inviterBelonging = await getShopBelonging(ctx, args.shopId, inviter._id);

    // ポリシーで権限チェック
    if (!canManageInvitation(inviterBelonging?.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    // 仮ユーザー作成
    const userId = await ctx.db.insert("users", {
      name: displayName,
      authId: undefined,
      status: "pending",
      createdAt: Date.now(),
      isDeleted: false,
    });

    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    await ctx.db.insert("shopUserBelongings", {
      shopId: args.shopId,
      userId,
      displayName,
      role: args.role,
      status: "pending",
      inviteToken: token,
      inviteExpiresAt: expiresAt,
      invitedBy: inviter._id,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return {
      success: true,
      data: {
        token,
        expiresAt,
      },
    };
  },
});

// 招待キャンセル
export const cancel = mutation({
  args: {
    belongingId: v.id("shopUserBelongings"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const belonging = await ctx.db.get(args.belongingId);
    if (!belonging || belonging.isDeleted) {
      throw new ConvexError({
        message: "招待が見つかりません",
        code: "INVITATION_NOT_FOUND",
      });
    }

    if (belonging.status !== "pending") {
      throw new ConvexError({
        message: "この招待はキャンセルできません",
        code: "CANNOT_CANCEL",
      });
    }

    const user = await requireUserByAuthId(ctx, args.authId);
    const userBelonging = await getShopBelonging(ctx, belonging.shopId, user._id);

    // ポリシーで権限チェック
    if (!canManageInvitation(userBelonging?.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    await ctx.db.patch(args.belongingId, { isDeleted: true });
    await ctx.db.patch(belonging.userId, { isDeleted: true });

    return { success: true };
  },
});

// 招待再送（トークン再生成 + 期限リセット）
export const resend = mutation({
  args: {
    belongingId: v.id("shopUserBelongings"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const belonging = await ctx.db.get(args.belongingId);
    if (!belonging || belonging.isDeleted) {
      throw new ConvexError({
        message: "招待が見つかりません",
        code: "INVITATION_NOT_FOUND",
      });
    }

    if (belonging.status !== "pending") {
      throw new ConvexError({
        message: "この招待は再送できません",
        code: "CANNOT_RESEND",
      });
    }

    const user = await requireUserByAuthId(ctx, args.authId);
    const userBelonging = await getShopBelonging(ctx, belonging.shopId, user._id);

    // ポリシーで権限チェック
    if (!canManageInvitation(userBelonging?.role as ShopUserRoleType)) {
      throw new ConvexError({ message: "この操作を行う権限がありません", code: "PERMISSION_DENIED" });
    }

    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    await ctx.db.patch(args.belongingId, {
      inviteToken: token,
      inviteExpiresAt: expiresAt,
    });

    return {
      success: true,
      data: {
        token,
        expiresAt,
      },
    };
  },
});

// 招待承認
export const accept = mutation({
  args: {
    token: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const belonging = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (!belonging) {
      throw new ConvexError({
        message: "招待が見つかりません",
        code: "INVALID_TOKEN",
      });
    }

    if (belonging.status !== "pending") {
      throw new ConvexError({
        message: "この招待は既に承認済みです",
        code: "ALREADY_ACCEPTED",
      });
    }

    if (belonging.inviteExpiresAt && belonging.inviteExpiresAt < Date.now()) {
      throw new ConvexError({
        message: "招待の有効期限が切れています",
        code: "INVITATION_EXPIRED",
      });
    }

    const existingUser = await getUserByAuthId(ctx, args.authId);

    if (existingUser) {
      // 既存ユーザーの場合: 仮登録usersを論理削除、userIdを付け替え
      await ctx.db.patch(belonging.userId, { isDeleted: true });

      await ctx.db.patch(belonging._id, {
        userId: existingUser._id,
        status: "active",
        inviteToken: undefined,
        inviteExpiresAt: undefined,
      });
    } else {
      // 新規ユーザーの場合: usersにauthId紐づけ
      await ctx.db.patch(belonging.userId, {
        authId: args.authId,
        status: "active",
      });

      await ctx.db.patch(belonging._id, {
        status: "active",
        inviteToken: undefined,
        inviteExpiresAt: undefined,
      });
    }

    const shop = await ctx.db.get(belonging.shopId);

    return {
      success: true,
      data: {
        shopId: belonging.shopId,
        shopName: shop?.shopName ?? "",
      },
    };
  },
});
