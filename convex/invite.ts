import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { INVITE_EXPIRY_MS, SHOP_USER_ROLE, type ShopUserRoleType } from "./constants";
import {
  generateToken,
  getShopBelonging,
  getUserByAuthId,
  requireShop,
  requireShopPermission,
  requireUserByAuthId,
} from "./helpers";

// 招待作成
export const createInvitation = mutation({
  args: {
    shopId: v.id("shops"),
    displayName: v.string(),
    role: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 表示名バリデーション
    const displayName = args.displayName.trim();
    if (displayName.length < 2 || displayName.length > 20) {
      throw new ConvexError({
        message: "表示名は2〜20文字で入力してください",
        code: "INVALID_DISPLAY_NAME",
      });
    }

    // 役割バリデーション
    if (!SHOP_USER_ROLE.includes(args.role as ShopUserRoleType)) {
      throw new ConvexError({
        message: `役割は${SHOP_USER_ROLE.join("、")}のいずれかを指定してください`,
        code: "INVALID_ROLE",
      });
    }

    // 実行者のユーザー取得
    const inviter = await requireUserByAuthId(ctx, args.authId);

    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // 実行者の権限チェック
    await requireShopPermission(ctx, args.shopId, inviter._id);

    // 仮ユーザー作成
    const userId = await ctx.db.insert("users", {
      name: displayName,
      authId: undefined,
      status: "pending",
      createdAt: Date.now(),
      isDeleted: false,
    });

    // トークン生成
    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    // shopUserBelongings作成
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
export const cancelInvitation = mutation({
  args: {
    belongingId: v.id("shopUserBelongings"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 招待レコード取得
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

    // 実行者のユーザー取得
    const user = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック
    await requireShopPermission(ctx, belonging.shopId, user._id);

    // shopUserBelongings論理削除
    await ctx.db.patch(args.belongingId, { isDeleted: true });

    // 紐づくusers論理削除
    await ctx.db.patch(belonging.userId, { isDeleted: true });

    return { success: true };
  },
});

// 招待再送（トークン再生成 + 期限リセット）
export const resendInvitation = mutation({
  args: {
    belongingId: v.id("shopUserBelongings"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 招待レコード取得
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

    // 実行者のユーザー取得
    const user = await requireUserByAuthId(ctx, args.authId);

    // 権限チェック
    await requireShopPermission(ctx, belonging.shopId, user._id);

    // 新しいトークン生成
    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    // 更新
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
export const acceptInvitation = mutation({
  args: {
    token: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // トークンで招待検索
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

    // ステータスチェック
    if (belonging.status !== "pending") {
      throw new ConvexError({
        message: "この招待は既に承認済みです",
        code: "ALREADY_ACCEPTED",
      });
    }

    // 有効期限チェック
    if (belonging.inviteExpiresAt && belonging.inviteExpiresAt < Date.now()) {
      throw new ConvexError({
        message: "招待の有効期限が切れています",
        code: "INVITATION_EXPIRED",
      });
    }

    // authIdで既存ユーザー検索
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

    // 店舗情報取得
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

// 店舗の招待一覧取得
export const getInvitationsByShopId = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // 実行者のユーザー取得
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return [];
    }

    // 権限チェック
    const userBelonging = await getShopBelonging(ctx, args.shopId, user._id);

    if (!userBelonging || (userBelonging.role !== "owner" && userBelonging.role !== "manager")) {
      return [];
    }

    // 招待一覧取得（pending状態のもの）
    const invitations = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.eq(q.field("status"), "pending")))
      .collect();

    // 招待者情報を付加
    const result = await Promise.all(
      invitations.map(async (invitation) => {
        const invitedBy = invitation.invitedBy ? await ctx.db.get(invitation.invitedBy) : null;

        return {
          _id: invitation._id,
          displayName: invitation.displayName,
          role: invitation.role,
          status: invitation.status,
          inviteToken: invitation.inviteToken,
          inviteExpiresAt: invitation.inviteExpiresAt,
          invitedBy: invitedBy
            ? {
                _id: invitedBy._id,
                name: invitedBy.name,
              }
            : null,
          createdAt: invitation.createdAt,
          isExpired: invitation.inviteExpiresAt ? invitation.inviteExpiresAt < Date.now() : false,
        };
      }),
    );

    return result;
  },
});

// トークンで招待情報取得（公開API）
export const getInvitationByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // トークンで招待検索
    const belonging = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .first();

    if (!belonging) {
      return null;
    }

    // 店舗情報取得
    const shop = await ctx.db.get(belonging.shopId);

    // 招待者情報取得
    const invitedBy = belonging.invitedBy ? await ctx.db.get(belonging.invitedBy) : null;

    return {
      shopName: shop?.shopName ?? "",
      displayName: belonging.displayName,
      role: belonging.role,
      invitedByName: invitedBy?.name ?? "",
      isExpired: belonging.inviteExpiresAt ? belonging.inviteExpiresAt < Date.now() : false,
      isCancelled: belonging.isDeleted,
      isAccepted: belonging.status === "active",
    };
  },
});
