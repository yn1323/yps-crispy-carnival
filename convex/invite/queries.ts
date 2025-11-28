/**
 * 招待ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 招待情報の取得
 * - 権限ベースの情報フィルタリング
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { ShopUserRoleType } from "../constants";
import { getShopBelonging, getUserByAuthId } from "../helpers";
import { canViewInvitations } from "./policies";

// 店舗の招待一覧取得
export const listByShopId = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return [];
    }

    const userBelonging = await getShopBelonging(ctx, args.shopId, user._id);

    // ポリシーで権限チェック
    if (!canViewInvitations(userBelonging?.role as ShopUserRoleType)) {
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
export const getByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const belonging = await ctx.db
      .query("shopUserBelongings")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .first();

    if (!belonging) {
      return null;
    }

    const shop = await ctx.db.get(belonging.shopId);
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
