import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { buildShopDashboardUrl } from "../_lib/dashboardUrl";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT, STAFF_REGISTRATION_DIGEST_WINDOW_MS } from "../constants";

export const listPendingRequestShopIdsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // 最新依頼から24時間だけ通知する。直近24時間以内のpendingがある店舗だけが対象。
    const windowStart = Date.now() - STAFF_REGISTRATION_DIGEST_WINDOW_MS;
    const result = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending").gte("createdAt", windowStart))
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((request) => request.shopId),
    };
  },
});

export const getOwnerDigestTargetForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
      .first();
    if (!pendingRequest) return null;

    const recipients = await loadShopManagerRecipients(ctx, shopId, STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT);
    if (recipients.length === 0) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: buildShopDashboardUrl(shopId),
      recipients,
    };
  },
});
