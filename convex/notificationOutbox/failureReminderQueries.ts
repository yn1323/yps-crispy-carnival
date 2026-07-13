import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { filter } from "convex-helpers/server/filter";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT, NOTIFICATION_FAILURE_REMINDER_WINDOW_MS } from "../constants";
import { isManagerVisibleNotificationFailure } from "./failureEligibility";
import { ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS } from "./failureResend";

const VISIBLE_FAILURE_PAGINATION_SCAN_LIMIT = 20;

export const listShopIdsWithRecentOpenFailuresPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // 最新の失敗から24時間だけ通知する。直近24時間以内に失敗した open レコードがある店舗だけが対象。
    const windowStart = Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS;
    // Dashboard に出ない失敗しかない店舗にはリマインダーを送らない（対応しようがない）。
    // 終了済み募集の判定は recruitment 参照が必要なので、非表示レコードでページが埋まらないように走査する。
    const buildBaseQuery = () =>
      ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_status_lastFailedAt", (q) => q.eq("status", "open").gte("lastFailedAt", windowStart))
        .filter((q) =>
          q.or(
            ...ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS.map((context) => q.eq(q.field("notificationContext"), context)),
          ),
        );

    let cursor = paginationOpts.cursor;
    let isDone = false;
    let continueCursor = "";
    const page: Id<"shops">[] = [];

    for (
      let scanCount = 0;
      scanCount < VISIBLE_FAILURE_PAGINATION_SCAN_LIMIT && page.length < paginationOpts.numItems;
      scanCount++
    ) {
      const result = await buildBaseQuery().paginate({
        cursor,
        numItems: paginationOpts.numItems - page.length,
      });
      for (const failure of result.page) {
        if (await isManagerVisibleNotificationFailure(ctx, failure)) {
          page.push(failure.shopId);
        }
      }
      isDone = result.isDone;
      continueCursor = result.continueCursor;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    return {
      isDone,
      continueCursor,
      page,
    };
  },
});

export const getFailureReminderTargetForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return null;

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
      dashboardUrl: `${APP_URL}/dashboard`,
      recipients,
    };
  },
});
