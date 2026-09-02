"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { selectChannel } from "../_lib/notification";
import {
  buildShopActivationReminderEmailHtml,
  buildShopActivationReminderLineFlexMessage,
  buildShopActivationReminderLineText,
  SHOP_ACTIVATION_REMINDER_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { SHOP_ACTIVATION_REMINDER_CONTEXT } from "../notificationOutbox/failureSuppress";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";
import { lineRecipientOutboxSnapshot } from "../notificationOutbox/types";
import { getReminderTargetRef } from "./refs";

/**
 * 初回店舗登録から7日後17:00 JSTに発火し、本番募集へ戻るきっかけをmanagerへ送る。
 * 補助的な通知のため、失敗しても failureInbox には載せない（context で抑止）。
 */
export const sendReminder = internalAction({
  args: { shopId: v.id("shops"), ...businessNotificationOriginArgs },
  handler: async (ctx, { shopId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(getReminderTargetRef, { shopId });
    if (!data) return;

    const [quota, suppressDelivery] = await Promise.all([
      ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}),
      ctx.runQuery(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, {
        shopId: data.shopId,
      }),
    ]);

    const from = formatResendFrom(data.shopName, RESEND_FROM_EMAIL);
    const subject = formatResendSubject(data.shopName, SHOP_ACTIVATION_REMINDER_SUBJECT);

    for (const recipient of data.recipients) {
      const lineRecipient = recipient.lineRecipient;
      const channel = selectChannel(
        { lineUserId: lineRecipient?.lineUserId, lineFollowing: lineRecipient?.following },
        quota,
      );
      const dedupeBase = `shopActivationReminder:${data.shopId}:${recipient.userId}`;
      const emailDedupeKey = `email:${dedupeBase}`;
      const lineDedupeKey = `line:${dedupeBase}`;

      const emailPayloadValue = emailPayload({
        from,
        to: recipient.email,
        subject,
        html: buildShopActivationReminderEmailHtml({
          managerName: recipient.name,
          dashboardUrl: data.dashboardUrl,
        }),
        context: SHOP_ACTIVATION_REMINDER_CONTEXT,
        suppressDelivery,
      });

      if (channel === "line" && lineRecipient) {
        await enqueueLine(ctx, {
          shopId: data.shopId,
          ...notificationOrigin,
          ...lineRecipientOutboxSnapshot(lineRecipient),
          purpose: "business",
          userId: recipient.userId,
          dedupeKey: lineDedupeKey,
          payload: linePayload({
            toUserId: lineRecipient.lineUserId,
            text: buildShopActivationReminderLineText({ dashboardUrl: data.dashboardUrl }),
            message: buildShopActivationReminderLineFlexMessage({
              shopName: data.shopName,
              dashboardUrl: data.dashboardUrl,
            }),
            suppressDelivery,
            fallbackEmail: { dedupeKey: emailDedupeKey, payload: emailPayloadValue },
          }),
        });
        continue;
      }

      await enqueueEmail(ctx, {
        shopId: data.shopId,
        ...notificationOrigin,
        purpose: "business",
        userId: recipient.userId,
        dedupeKey: emailDedupeKey,
        payload: emailPayloadValue,
      });
    }
  },
});
