"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { selectChannel } from "../_lib/notification";
import { NOTIFICATION_FAILURE_REMINDER_PENDING_PAGE_SIZE } from "../constants";
import {
  buildNotificationFailureReminderEmailHtml,
  buildNotificationFailureReminderLineFlexMessage,
  buildNotificationFailureReminderLineText,
  NOTIFICATION_FAILURE_REMINDER_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "./enqueue";
import { NOTIFICATION_FAILURE_REMINDER_CONTEXT } from "./failureSuppress";

type ShopIdsPage = {
  page: Id<"shops">[];
  continueCursor: string;
  isDone: boolean;
};

export const sendFailureReminderDigest = internalAction({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, { shopId }) => {
    // E2Eや運用確認では対象店舗だけを実行し、同じdeploymentの他店舗へ影響させない。
    if (shopId) {
      await sendFailureReminderForShop(ctx, shopId);
      return;
    }

    const notifiedShopIds = new Set<string>();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const result: ShopIdsPage = await ctx.runQuery(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        {
          paginationOpts: {
            numItems: NOTIFICATION_FAILURE_REMINDER_PENDING_PAGE_SIZE,
            cursor,
          },
        },
      );

      for (const shopId of result.page) {
        if (notifiedShopIds.has(shopId)) continue;
        notifiedShopIds.add(shopId);
        await sendFailureReminderForShop(ctx, shopId);
      }

      cursor = result.continueCursor;
      isDone = result.isDone;
    }
  },
});

async function sendFailureReminderForShop(ctx: ActionCtx, shopId: Id<"shops">) {
  const data = await ctx.runQuery(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
    shopId,
  });
  if (!data) return;

  const [quota, suppressDelivery, notificationOrigin] = await Promise.all([
    ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}),
    ctx.runQuery(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, {
      shopId: data.shopId,
    }),
    ctx.runQuery(internal.notificationOutbox.origin.captureCurrentBusinessNotificationOrigin, {
      shopId: data.shopId,
    }),
  ]);

  for (const recipient of data.recipients) {
    const channel = selectChannel({ lineUserId: recipient.lineUserId, lineFollowing: recipient.lineFollowing }, quota);

    if (channel === "line" && recipient.lineUserId) {
      await enqueueLine(ctx, {
        shopId: data.shopId,
        ...notificationOrigin,
        userId: recipient.userId,
        dedupeKey: `line:notificationFailureReminder:${data.shopId}:${recipient.userId}`,
        payload: linePayload({
          toUserId: recipient.lineUserId,
          text: buildNotificationFailureReminderLineText({ dashboardUrl: data.dashboardUrl }),
          message: buildNotificationFailureReminderLineFlexMessage({
            shopName: data.shopName,
            dashboardUrl: data.dashboardUrl,
          }),
          suppressDelivery,
          fallbackEmail: {
            dedupeKey: `email:notificationFailureReminder:${data.shopId}:${recipient.userId}`,
            payload: emailPayload({
              from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
              to: recipient.email,
              subject: formatResendSubject(data.shopName, NOTIFICATION_FAILURE_REMINDER_SUBJECT),
              html: buildNotificationFailureReminderEmailHtml({
                managerName: recipient.name,
                dashboardUrl: data.dashboardUrl,
              }),
              context: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
              suppressDelivery,
            }),
          },
        }),
      });
      continue;
    }

    await enqueueEmail(ctx, {
      shopId: data.shopId,
      ...notificationOrigin,
      userId: recipient.userId,
      dedupeKey: `email:notificationFailureReminder:${data.shopId}:${recipient.userId}`,
      payload: emailPayload({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: recipient.email,
        subject: formatResendSubject(data.shopName, NOTIFICATION_FAILURE_REMINDER_SUBJECT),
        html: buildNotificationFailureReminderEmailHtml({
          managerName: recipient.name,
          dashboardUrl: data.dashboardUrl,
        }),
        context: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
        suppressDelivery,
      }),
    });
  }
}
