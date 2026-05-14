import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { managerQuery } from "../_lib/functions";
import { findStaffLineAccountByLineUserId, getStaffLineAccount } from "./service";

/**
 * 店舗のスタッフごとのLINE連携状況を返す（シフト担当者UI用）
 */
export const getLinkStatusByShop = managerQuery({
  args: {},
  handler: async (ctx) => {
    const shop = ctx.shop;
    if (!shop) return null;
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .collect();
    return await Promise.all(
      staffs.map(async (s) => {
        const account = await getStaffLineAccount(ctx, s._id);
        return {
          staffId: s._id,
          name: s.name,
          email: s.email,
          isLinked: Boolean(account?.lineUserId),
          isFollowing: Boolean(account?.following),
        };
      }),
    );
  },
});

/**
 * 現在の Quota 状態（normal / exceeded）。
 * 未取得（cron 未実行）の場合は null
 */
export const getQuotaStatus = managerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.shop) return null;
    const status = await ctx.db.query("lineQuotaStatus").order("desc").first();
    if (!status) return null;
    return {
      status: status.status,
      remaining: status.remaining,
      totalQuota: status.totalQuota,
      consumed: status.consumed,
      checkedAt: status.checkedAt,
      plan: status.plan,
    };
  },
});

/**
 * lineUserId からスタッフを引く（Webhook で使う）
 */
export const findStaffByLineUserId = internalQuery({
  args: { lineUserId: v.string() },
  handler: async (ctx, { lineUserId }) => {
    const account = await findStaffLineAccountByLineUserId(ctx, lineUserId);
    const staff = account ? await ctx.db.get(account.staffId) : null;
    if (!staff || staff.isDeleted) return null;
    return { _id: staff._id, shopId: staff.shopId, name: staff.name };
  },
});

/**
 * 内部用: 通知振り分け時に Quota 状態を取得（cron 未実行時は null）
 */
export const getQuotaStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.db.query("lineQuotaStatus").order("desc").first();
    if (!status) return null;
    return { status: status.status };
  },
});

/**
 * 連携依頼メール送信用のデータ取得（actions から呼ぶ）
 */
export const getInviteEmailData = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted || !staff.email) return null;
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) return null;
    return {
      staffId: staff._id,
      shopId: staff.shopId,
      staffName: staff.name,
      staffEmail: staff.email,
      shopName: shop.name,
    };
  },
});
