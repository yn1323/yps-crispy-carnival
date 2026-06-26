import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT, NOTIFICATION_FAILURE_REMINDER_WINDOW_MS } from "../constants";
import { isManagerActionableNotificationFailure } from "./failureResend";

export const listShopIdsWithRecentOpenFailuresPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // 最新の失敗から3日間だけ通知する。3日以内に失敗した open レコードがある店舗が対象。
    const windowStart = Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS;
    const result = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_status_lastFailedAt", (q) => q.eq("status", "open").gte("lastFailedAt", windowStart))
      .paginate(paginationOpts);

    return {
      ...result,
      // 種別「通知」(other) しかない店舗にはリマインダーを送らない（Dashboard に出ないため対応しようがない）。
      page: result.page
        .filter((failure) => isManagerActionableNotificationFailure(failure.notificationContext))
        .map((failure) => failure.shopId),
    };
  },
});

export const getFailureReminderTargetForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return null;

    let hasActionableFailure = false;
    for await (const failure of ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", "open"))) {
      if (isManagerActionableNotificationFailure(failure.notificationContext)) {
        hasActionableFailure = true;
        break;
      }
    }
    if (!hasActionableFailure) return null;

    const recipients = await loadShopManagerRecipients(ctx, shopId, NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT);
    if (recipients.length === 0) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: `${APP_URL}/dashboard`,
      recipients,
    };
  },
});
