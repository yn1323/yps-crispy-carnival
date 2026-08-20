import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { filter } from "convex-helpers/server/filter";
import { paginator } from "convex-helpers/server/pagination";
import { buildShopDashboardUrl } from "../_lib/dashboardUrl";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT, NOTIFICATION_FAILURE_REMINDER_WINDOW_MS } from "../constants";
import schema from "../schema";
import { isManagerVisibleNotificationFailure } from "./failureEligibility";

const VISIBLE_FAILURE_PAGINATION_SCAN_MULTIPLIER = 20;

export const listShopIdsWithRecentOpenFailuresPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // 最新の失敗から24時間だけ通知する。直近24時間以内に失敗した open レコードがある店舗だけが対象。
    const windowStart = Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS;
    // Dashboard に出ない失敗しかない店舗にはリマインダーを送らない（対応しようがない）。
    // filterWith をページング前に適用し、1回の paginate で非表示レコードを越えて対象件数を満たす。
    const scanLimit = Math.max(1, paginationOpts.numItems) * VISIBLE_FAILURE_PAGINATION_SCAN_MULTIPLIER;
    const maximumRowsRead = Math.max(1, Math.min(paginationOpts.maximumRowsRead ?? scanLimit, scanLimit));
    const failures = await paginator(ctx.db, schema)
      .query("notificationFailureInbox")
      .withIndex("by_status_lastFailedAt", (q) => q.eq("status", "open").gte("lastFailedAt", windowStart))
      .filterWith(async (failure) => await isManagerVisibleNotificationFailure(ctx, failure))
      .paginate({
        ...paginationOpts,
        maximumRowsRead,
      });

    return {
      ...failures,
      page: failures.page.map((failure) => failure.shopId),
    };
  },
});

export const getFailureReminderTargetForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return null;
    if (!shop.organizationId) return null;
    const organization = await ctx.db.get(shop.organizationId);
    if (!organization || organization.isDeleted) return null;

    const openFailure = await filter(
      ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", "open")),
      async (failure) => await isManagerVisibleNotificationFailure(ctx, failure),
    ).first();
    if (!openFailure) return null;

    const recipients = await loadShopManagerRecipients(ctx, shopId, NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT);
    if (recipients.length === 0) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: buildShopDashboardUrl({ organizationId: organization._id, shopId }),
      recipients,
    };
  },
});
