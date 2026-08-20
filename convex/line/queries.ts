import { v } from "convex/values";
import { isShopParentActive } from "../_lib/activeShop";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { managerQuery } from "../_lib/functions";
import {
  findStaffLineAccountByLineUserId,
  getOrganizationPersonLineState,
  resolveCanonicalStaffScope,
  resolveStaffLineRecipient,
} from "./service";

/**
 * 店舗のスタッフごとのLINE連携状況を返す（シフト担当者UI用）
 */
export const getLinkStatusByShop = managerQuery({
  args: {},
  returns: v.union(
    v.array(
      v.object({
        staffId: v.id("staffs"),
        name: v.string(),
        email: v.string(),
        isLinked: v.boolean(),
        isFollowing: v.boolean(),
      }),
    ),
    v.null(),
  ),
  handler: async (ctx) => {
    const shop = ctx.shop;
    if (!shop) return null;
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .collect();
    return await Promise.all(
      staffs.map(async (s) => {
        const account = await resolveStaffLineRecipient(ctx, { staffId: s._id, shopId: shop._id });
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
  returns: v.union(
    v.object({
      status: v.union(v.literal("normal"), v.literal("exceeded")),
      remaining: v.number(),
      totalQuota: v.number(),
      consumed: v.number(),
      checkedAt: v.number(),
      plan: v.union(v.literal("communication"), v.literal("light"), v.literal("standard")),
    }),
    v.null(),
  ),
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
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;
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
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;
    const canonicalScope = await resolveCanonicalStaffScope(ctx, { staffId: staff._id, shopId: shop._id });
    const lineState = canonicalScope
      ? await getOrganizationPersonLineState(ctx, {
          organizationId: canonicalScope.organization._id,
          organizationPersonId: canonicalScope.person._id,
        })
      : null;
    if (canonicalScope && !lineState) return null;
    return {
      staffId: staff._id,
      shopId: staff.shopId,
      staffName: staff.name,
      staffEmail: staff.email,
      shopName: shop.name,
      ...(canonicalScope && lineState
        ? {
            organizationPersonId: canonicalScope.person._id,
            lineLinkGeneration: lineState.generation,
            isLineLinked: lineState.status !== "unlinked",
          }
        : {}),
    };
  },
});
