"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatDeadlineLabel, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";
import { lineRecipientOutboxSnapshot, type NotificationLineRecipient } from "../notificationOutbox/types";
import { recordNotificationPreparationFailure } from "./failureRecording";
import { buildReminderEmailHtml, buildReminderLineFlexMessage, buildReminderLineText } from "./templates";

const SHIFT_REMINDER_NOTIFICATION_KIND = "shift.reminder";
const SHIFT_REMINDER_LINE_TITLE = "シフト提出のお願い";

function selectLineRecipient(
  recipient: NotificationLineRecipient | null,
  quota: { status: "normal" | "exceeded" } | null,
) {
  if (!recipient) return null;
  return selectChannel({ lineUserId: recipient.lineUserId, lineFollowing: recipient.following }, quota) === "line"
    ? recipient
    : null;
}

/**
 * 未提出スタッフ全員に催促を送信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 → メール（未連携なら CTA を末尾に挿入）
 */
export const sendReminderEmails = internalAction({
  args: { recruitmentId: v.id("recruitments"), ...businessNotificationOriginArgs },
  handler: async (ctx, { recruitmentId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });
    if (!data || data.staffEntries.length === 0) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const expiresAt = getSubmitLinkCutoff(data.periodStart);
    const deadlineLabel = formatDeadlineLabel(data.deadline);
    const subject = formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出締切が近づいています`);
    let sentCount = 0;

    for (const staff of data.staffEntries) {
      const lineRecipient = selectLineRecipient(staff.lineRecipient, quota);
      const selectedChannel = lineRecipient ? "line" : "email";
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

        if (lineRecipient) {
          const lineParams = {
            staffName: staff.name,
            shopName: data.shopName,
            periodLabel: data.periodLabel,
            linkExpiresAtLabel: deadlineLabel,
            magicLinkUrl,
          };
          const fallbackEmail = staff.email
            ? {
                dedupeKey: emailDedupeKey,
                history: {
                  notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
                  displayTitle: subject,
                },
                payload: emailPayload({
                  from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
                  to: staff.email,
                  subject,
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
            ...notificationOrigin,
            ...lineRecipientOutboxSnapshot(lineRecipient),
            purpose: "business",
            recruitmentId,
            staffId: staff.staffId,
            history: {
              notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
              displayTitle: SHIFT_REMINDER_LINE_TITLE,
            },
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: lineRecipient.lineUserId,
              text: buildReminderLineText(lineParams),
              message: buildReminderLineFlexMessage(lineParams),
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
          ...notificationOrigin,
          purpose: "business",
          recruitmentId,
          staffId: staff.staffId,
          history: {
            notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
            displayTitle: subject,
          },
          dedupeKey: emailDedupeKey,
          payload: emailPayload({
            from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
            to: staff.email,
            subject,
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
    ...businessNotificationOriginArgs,
  },
  handler: async (ctx, { recruitmentId, staffId, notificationRunId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
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
    const subject = formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出締切が近づいています`);
    const lineRecipient = selectLineRecipient(data.staff.lineRecipient, quota);
    const selectedChannel = lineRecipient ? "line" : "email";
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

      if (lineRecipient) {
        const lineParams = {
          staffName: data.staff.name,
          shopName: data.shopName,
          periodLabel: data.periodLabel,
          linkExpiresAtLabel: deadlineLabel,
          magicLinkUrl,
        };
        const fallbackEmail = data.staff.email
          ? {
              dedupeKey: emailDedupeKey,
              history: {
                notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
                displayTitle: subject,
              },
              payload: emailPayload({
                from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
                to: data.staff.email,
                subject,
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
          ...notificationOrigin,
          ...lineRecipientOutboxSnapshot(lineRecipient),
          purpose: "business",
          recruitmentId,
          staffId: data.staff.staffId,
          history: {
            notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
            displayTitle: SHIFT_REMINDER_LINE_TITLE,
          },
          dedupeKey: lineDedupeKey,
          payload: linePayload({
            toUserId: lineRecipient.lineUserId,
            text: buildReminderLineText(lineParams),
            message: buildReminderLineFlexMessage(lineParams),
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
        ...notificationOrigin,
        purpose: "business",
        recruitmentId,
        staffId: data.staff.staffId,
        history: {
          notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
          displayTitle: subject,
        },
        dedupeKey: emailDedupeKey,
        payload: emailPayload({
          from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
          to: data.staff.email,
          subject,
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
