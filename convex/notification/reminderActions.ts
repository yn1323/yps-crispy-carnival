"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatDeadlineLabel, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { recordNotificationPreparationFailure } from "./failureRecording";
import { buildReminderEmailHtml, buildReminderLineText } from "./templates";

/**
 * 未提出スタッフ全員に催促を送信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 → メール（未連携なら CTA を末尾に挿入）
 */
export const sendReminderEmails = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });
    if (!data || data.staffEntries.length === 0) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const expiresAt = getSubmitLinkCutoff(data.periodStart);
    const deadlineLabel = formatDeadlineLabel(data.deadline);
    let sentCount = 0;

    for (const staff of data.staffEntries) {
      const channel = selectChannel({ lineUserId: staff.lineUserId, lineFollowing: staff.lineFollowing }, quota);
      const selectedChannel = channel === "line" && staff.lineUserId ? "line" : "email";
      const emailDedupeKey = `email:reminder:${recruitmentId}:${staff.staffId}`;
      const lineDedupeKey = `line:reminder:${recruitmentId}:${staff.staffId}`;
      const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
      if (selectedChannel === "email" && !staff.email) continue;

      try {
        const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
          staffId: staff.staffId,
          shopId: data.shopId,
          recruitmentId,
          expiresAt,
        });
        const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

        if (selectedChannel === "line" && staff.lineUserId) {
          const fallbackEmail = staff.email
            ? {
                dedupeKey: emailDedupeKey,
                payload: emailPayload({
                  from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
                  to: staff.email,
                  subject: formatResendSubject(
                    data.shopName,
                    `${data.periodLabel} シフト希望の提出期限が近づいています`,
                  ),
                  html: buildReminderEmailHtml({
                    staffName: staff.name,
                    periodLabel: data.periodLabel,
                    linkExpiresAtLabel: deadlineLabel,
                    magicLinkUrl,
                    lineCtaHtml: await buildLineCtaForStaff(ctx, {
                      staffId: staff.staffId,
                      shopId: data.shopId,
                      lineUserId: staff.lineUserId,
                      lineFollowing: staff.lineFollowing,
                      appUrl: APP_URL,
                    }),
                  }),
                  context: "notification.sendReminderEmails",
                  suppressDelivery,
                }),
              }
            : undefined;
          const result = await enqueueLine(ctx, {
            shopId: data.shopId,
            recruitmentId,
            staffId: staff.staffId,
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: staff.lineUserId,
              text: buildReminderLineText({
                staffName: staff.name,
                shopName: data.shopName,
                periodLabel: data.periodLabel,
                linkExpiresAtLabel: deadlineLabel,
                magicLinkUrl,
              }),
              suppressDelivery,
              ...(fallbackEmail ? { fallbackEmail } : {}),
            }),
          });
          if (result) sentCount += 1;
          continue;
        }

        const lineCtaHtml = await buildLineCtaForStaff(ctx, {
          staffId: staff.staffId,
          shopId: data.shopId,
          lineUserId: staff.lineUserId,
          lineFollowing: staff.lineFollowing,
          appUrl: APP_URL,
        });

        const result = await enqueueEmail(ctx, {
          shopId: data.shopId,
          recruitmentId,
          staffId: staff.staffId,
          dedupeKey: emailDedupeKey,
          payload: emailPayload({
            from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
            to: staff.email,
            subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出期限が近づいています`),
            html: buildReminderEmailHtml({
              staffName: staff.name,
              periodLabel: data.periodLabel,
              linkExpiresAtLabel: deadlineLabel,
              magicLinkUrl,
              lineCtaHtml,
            }),
            context: "notification.sendReminderEmails",
            suppressDelivery,
          }),
        });
        if (result) sentCount += 1;
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId,
            staffId: staff.staffId,
            channel: selectedChannel,
            dedupeKey,
            notificationContext: "notification.sendReminderEmails",
          },
          e,
          "Reminder notification preparation failed",
        );
      }
    }

    if (sentCount > 0) {
      await ctx.runMutation(internal.notification.mutations.markReminderSent, {
        recruitmentId,
        sentAt: Date.now(),
      });
    }
  },
});

/**
 * 不達再通知: 1スタッフへ、対象の催促通知だけを通常の LINE / メール振り分けで送る。
 */
export const sendReminderEmailForStaff = internalAction({
  args: {
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    notificationRunId: v.optional(v.number()),
  },
  handler: async (ctx, { recruitmentId, staffId, notificationRunId }) => {
    const data = await ctx.runQuery(internal.notification.reminderQueries.getReminderEmailDataForStaff, {
      recruitmentId,
      staffId,
    });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const expiresAt = getSubmitLinkCutoff(data.periodStart);
    const deadlineLabel = formatDeadlineLabel(data.deadline);
    const channel = selectChannel(
      { lineUserId: data.staff.lineUserId, lineFollowing: data.staff.lineFollowing },
      quota,
    );
    const selectedChannel = channel === "line" && data.staff.lineUserId ? "line" : "email";
    const runId = notificationRunId ?? Date.now();
    const emailDedupeKey = `email:failureRetryReminder:${recruitmentId}:${staffId}:${runId}`;
    const lineDedupeKey = `line:failureRetryReminder:${recruitmentId}:${staffId}:${runId}`;
    const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
    if (selectedChannel === "email" && !data.staff.email) return;

    try {
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        expiresAt,
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      if (selectedChannel === "line" && data.staff.lineUserId) {
        const fallbackEmail = data.staff.email
          ? {
              dedupeKey: emailDedupeKey,
              payload: emailPayload({
                from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
                to: data.staff.email,
                subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出期限が近づいています`),
                html: buildReminderEmailHtml({
                  staffName: data.staff.name,
                  periodLabel: data.periodLabel,
                  linkExpiresAtLabel: deadlineLabel,
                  magicLinkUrl,
                  lineCtaHtml: await buildLineCtaForStaff(ctx, {
                    staffId: data.staff.staffId,
                    shopId: data.shopId,
                    lineUserId: data.staff.lineUserId,
                    lineFollowing: data.staff.lineFollowing,
                    appUrl: APP_URL,
                  }),
                }),
                context: "notification.sendReminderEmails",
                suppressDelivery,
              }),
            }
          : undefined;
        await enqueueLine(ctx, {
          shopId: data.shopId,
          recruitmentId,
          staffId: data.staff.staffId,
          dedupeKey: lineDedupeKey,
          payload: linePayload({
            toUserId: data.staff.lineUserId,
            text: buildReminderLineText({
              staffName: data.staff.name,
              shopName: data.shopName,
              periodLabel: data.periodLabel,
              linkExpiresAtLabel: deadlineLabel,
              magicLinkUrl,
            }),
            suppressDelivery,
            ...(fallbackEmail ? { fallbackEmail } : {}),
          }),
        });
        return;
      }

      const lineCtaHtml = await buildLineCtaForStaff(ctx, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        lineUserId: data.staff.lineUserId,
        lineFollowing: data.staff.lineFollowing,
        appUrl: APP_URL,
      });
      await enqueueEmail(ctx, {
        shopId: data.shopId,
        recruitmentId,
        staffId: data.staff.staffId,
        dedupeKey: emailDedupeKey,
        payload: emailPayload({
          from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
          to: data.staff.email,
          subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出期限が近づいています`),
          html: buildReminderEmailHtml({
            staffName: data.staff.name,
            periodLabel: data.periodLabel,
            linkExpiresAtLabel: deadlineLabel,
            magicLinkUrl,
            lineCtaHtml,
          }),
          context: "notification.sendReminderEmails",
          suppressDelivery,
        }),
      });
    } catch (e) {
      await recordNotificationPreparationFailure(
        ctx,
        {
          shopId: data.shopId,
          recruitmentId,
          staffId: data.staff.staffId,
          channel: selectedChannel,
          dedupeKey,
          notificationContext: "notification.sendReminderEmails",
        },
        e,
        "Failure retry reminder notification preparation failed",
      );
    }
  },
});
