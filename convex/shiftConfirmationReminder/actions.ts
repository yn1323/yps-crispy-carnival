"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { selectChannel } from "../_lib/notification";
import {
  buildShiftConfirmationReminderEmailHtml,
  buildShiftConfirmationReminderLineText,
  SHIFT_CONFIRMATION_REMINDER_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { SHIFT_CONFIRMATION_REMINDER_CONTEXT } from "../notificationOutbox/failureSuppress";

/**
 * シフト締め切り日の翌日17時に発火。募集がまだ確定していなければ、店舗のマネージャー全員に
 * 「シフトを調整して確定してください」と催促する。
 * - 連携済みかつ友達追加中 → LINE Push（email フォールバック付き）
 * - それ以外 → メール
 * 補助的な通知のため、失敗しても failureInbox には載せない（context で抑止）。
 */
export const sendManagerConfirmationReminder = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, {
      recruitmentId,
    });
    if (!data) return;

    const [quota, suppressDelivery] = await Promise.all([
      ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}),
      ctx.runQuery(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, {
        shopId: data.shopId,
      }),
    ]);

    // 店舗単位で一定なので受信者ループの外で組み立てる。
    const from = formatResendFrom(data.shopName, RESEND_FROM_EMAIL);
    const subject = formatResendSubject(data.shopName, SHIFT_CONFIRMATION_REMINDER_SUBJECT);

    for (const recipient of data.recipients) {
      const channel = selectChannel(
        { lineUserId: recipient.lineUserId, lineFollowing: recipient.lineFollowing },
        quota,
      );
      const dedupeBase = `shiftConfirmationReminder:${recruitmentId}:${recipient.userId}`;
      const emailDedupeKey = `email:${dedupeBase}`;
      const lineDedupeKey = `line:${dedupeBase}`;

      const emailPayloadValue = emailPayload({
        from,
        to: recipient.email,
        subject,
        html: buildShiftConfirmationReminderEmailHtml({
          managerName: recipient.name,
          periodLabel: data.periodLabel,
          deadlineLabel: data.deadlineLabel,
          dashboardUrl: data.dashboardUrl,
        }),
        context: SHIFT_CONFIRMATION_REMINDER_CONTEXT,
        suppressDelivery,
      });

      if (channel === "line" && recipient.lineUserId) {
        await enqueueLine(ctx, {
          shopId: data.shopId,
          recruitmentId,
          userId: recipient.userId,
          dedupeKey: lineDedupeKey,
          payload: linePayload({
            toUserId: recipient.lineUserId,
            text: buildShiftConfirmationReminderLineText({
              periodLabel: data.periodLabel,
              deadlineLabel: data.deadlineLabel,
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
        recruitmentId,
        userId: recipient.userId,
        dedupeKey: emailDedupeKey,
        payload: emailPayloadValue,
      });
    }
  },
});
