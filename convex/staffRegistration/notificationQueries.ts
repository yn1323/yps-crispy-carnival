import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT, STAFF_REGISTRATION_DIGEST_WINDOW_MS } from "../constants";
import { getShopManagerRecipients } from "../line/service";

export const listPendingRequestShopIdsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // 最新依頼から3日間だけ通知する。3日以内のpendingがある店舗 = 最新pendingが3日以内の店舗
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
    if (!shop || shop.isDeleted) return null;

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
      .first();
    if (!pendingRequest) return null;

    const recipients = await getShopManagerRecipients(ctx, shopId, STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT);
    if (recipients.length === 0) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: `${APP_URL}/dashboard`,
      recipients,
    };
  },
});
