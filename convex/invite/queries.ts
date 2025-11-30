/**
 * 招待ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 招待情報の取得
 * - 招待一覧の取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getStaffByInviteToken, requireShopOwnerOrManager } from "../helpers";

// トークンで招待情報を取得（公開API - 最小限の情報のみ返却）
export const getByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedToken = args.token.trim();

    if (!trimmedToken) {
      return null;
    }

    const staff = await getStaffByInviteToken(ctx, trimmedToken);

    if (!staff) {
      return null;
    }

    // 店舗情報を取得
    const shop = await ctx.db.get(staff.shopId);

    if (!shop || shop.isDeleted) {
      return null;
    }

    // 公開情報のみ返却
    return {
      staffId: staff._id,
      displayName: staff.displayName,
      role: staff.role,
      status: staff.status,
      isDeleted: staff.isDeleted,
      expiresAt: staff.inviteExpiresAt,
      isExpired: staff.inviteExpiresAt ? staff.inviteExpiresAt < Date.now() : false,
      shop: {
        shopId: shop._id,
        shopName: shop.shopName,
      },
    };
  },
});

// 店舗の招待一覧を取得（オーナー/マネージャーのみ）
export const listByShopId = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireShopOwnerOrManager(ctx, args.shopId, args.authId);

    // pending状態の招待を取得
    const invitations = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.and(q.eq(q.field("status"), "pending"), q.neq(q.field("isDeleted"), true)))
      .collect();

    // 招待者情報を付加
    const result = await Promise.all(
      invitations.map(async (inv) => {
        let inviterName = "不明";

        if (inv.invitedBy) {
          const inviter = await ctx.db
            .query("users")
            .withIndex("by_auth_id", (q) => q.eq("authId", inv.invitedBy))
            .first();

          if (inviter) {
            inviterName = inviter.name;
          }
        }

        return {
          staffId: inv._id,
          displayName: inv.displayName,
          role: inv.role,
          inviteToken: inv.inviteToken,
          expiresAt: inv.inviteExpiresAt,
          isExpired: inv.inviteExpiresAt ? inv.inviteExpiresAt < Date.now() : false,
          invitedBy: inviterName,
          createdAt: inv.createdAt,
        };
      }),
    );

    // 作成日時の降順でソート
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});
