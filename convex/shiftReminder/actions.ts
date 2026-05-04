"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { formatDateTimeLabel } from "../_lib/dateFormat";
import { getResendClient } from "../_lib/resend";
import { buildReminderEmailHtml } from "../email/templates";

const APP_URL = process.env.APP_URL ?? "https://shiftori.app";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@shiftori.app";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * 未提出スタッフ全員に催促メールを送信
 * sendReminderEmails mutation から ctx.scheduler 経由で呼ばれる
 */
export const sendReminderEmails = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.shiftReminder.queries.getReminderEmailData, { recruitmentId });
    if (!data || data.staffEntries.length === 0) return;

    const resend = getResendClient();
    const expiresAt = Date.now() + TWENTY_FOUR_HOURS_MS;
    const linkExpiresAtLabel = formatDateTimeLabel(expiresAt);

    // Magic Link 発行は Convex mutation のため直列、Resend 送信のみ並列化
    const tokens = await Promise.all(
      data.staffEntries.map((staff) =>
        ctx.runMutation(internal.email.mutations.createMagicLink, {
          staffId: staff.staffId,
          shopId: data.shopId,
          recruitmentId,
          expiresAt,
        }),
      ),
    );

    await Promise.all(
      data.staffEntries.map((staff, i) =>
        resend.emails.send({
          from: `${data.shopName} <${RESEND_FROM}>`,
          to: staff.email,
          subject: `【${data.shopName}】${data.periodLabel} シフト希望の提出をお待ちしています（${linkExpiresAtLabel}まで）`,
          html: buildReminderEmailHtml({
            staffName: staff.name,
            periodLabel: data.periodLabel,
            linkExpiresAtLabel,
            magicLinkUrl: `${APP_URL}/shifts/submit?token=${tokens[i].token}`,
          }),
        }),
      ),
    );
  },
});
