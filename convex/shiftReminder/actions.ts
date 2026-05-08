"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { formatDateTimeLabel } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { pushTextMessage } from "../_lib/lineClient";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { getResendClient } from "../_lib/resend";
import { buildReminderEmailHtml, buildReminderLineText } from "../email/templates";

const APP_URL = process.env.APP_URL ?? "https://shiftori.app";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@shiftori.app";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * 未提出スタッフ全員に催促を送信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 → メール（未連携なら CTA を末尾に挿入）
 */
export const sendReminderEmails = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.shiftReminder.queries.getReminderEmailData, { recruitmentId });
    if (!data || data.staffEntries.length === 0) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const resend = getResendClient({ suppressDelivery });
    const expiresAt = Date.now() + TWENTY_FOUR_HOURS_MS;
    const linkExpiresAtLabel = formatDateTimeLabel(expiresAt);

    for (const staff of data.staffEntries) {
      const channel = selectChannel({ lineUserId: staff.lineUserId, lineFollowing: staff.lineFollowing }, quota);

      const { token } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
        staffId: staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        expiresAt,
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      if (channel === "line" && staff.lineUserId) {
        try {
          await pushTextMessage(
            staff.lineUserId,
            buildReminderLineText({
              staffName: staff.name,
              shopName: data.shopName,
              periodLabel: data.periodLabel,
              linkExpiresAtLabel,
              magicLinkUrl,
            }),
            { suppressDelivery },
          );
          continue;
        } catch (e) {
          console.error("LINE push failed; falling back to email", e);
        }
      }

      if (!staff.email) continue;

      const lineCtaHtml = await buildLineCtaForStaff(ctx, {
        staffId: staff.staffId,
        shopId: data.shopId,
        lineUserId: staff.lineUserId,
        lineFollowing: staff.lineFollowing,
        appUrl: APP_URL,
      });

      await resend.emails.send({
        from: formatResendFrom(data.shopName, RESEND_FROM),
        to: staff.email,
        subject: formatResendSubject(
          data.shopName,
          `${data.periodLabel} シフト希望の提出をお待ちしています（${linkExpiresAtLabel}まで）`,
        ),
        html: buildReminderEmailHtml({
          staffName: staff.name,
          periodLabel: data.periodLabel,
          linkExpiresAtLabel,
          magicLinkUrl,
          lineCtaHtml,
        }),
      });
    }
  },
});
