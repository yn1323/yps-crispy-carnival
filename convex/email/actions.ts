"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { formatDateLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { getResendClient } from "../_lib/resend";
import { buildConfirmationEmailHtml, buildRecruitmentEmailHtml, buildReissueEmailHtml } from "./templates";

const APP_URL = process.env.APP_URL ?? "https://yps.app";

/**
 * シフト確定メールを全スタッフに送信
 * confirmRecruitment mutation から ctx.scheduler 経由で呼ばれる
 */
export const sendShiftConfirmationEmails = internalAction({
  args: { recruitmentId: v.id("recruitments"), isResend: v.boolean() },
  handler: async (ctx, { recruitmentId, isResend }) => {
    const data = await ctx.runQuery(internal.email.queries.getConfirmationEmailData, { recruitmentId });
    if (!data) return;

    const resend = getResendClient();

    for (const staffData of data.staffEntries) {
      const { token } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
        staffId: staffData.staffId,
        shopId: data.shopId,
        recruitmentId,
      });

      const magicLinkUrl = `${APP_URL}/shifts/view?token=${token}`;
      const reissueUrl = `${APP_URL}/shifts/reissue?recruitmentId=${recruitmentId}`;

      await resend.emails.send({
        from: `${data.shopName} <noreply@shiftori.app>`,
        to: staffData.email,
        subject: isResend
          ? `【シフト変更】【${data.shopName}】${data.periodLabel} シフト変更のお知らせ`
          : `【${data.shopName}】${data.periodLabel} シフト確定のお知らせ`,
        html: buildConfirmationEmailHtml({
          staffName: staffData.name,
          periodLabel: data.periodLabel,
          shifts: staffData.shifts,
          magicLinkUrl,
          reissueUrl,
          isResend,
        }),
      });
    }
  },
});

/**
 * 再発行メールを送信
 * requestReissue mutation から ctx.scheduler 経由で呼ばれる
 */
export const sendReissueEmail = internalAction({
  args: {
    staffId: v.id("staffs"),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { staffId, recruitmentId }) => {
    const data = await ctx.runQuery(internal.email.queries.getReissueEmailData, { staffId, recruitmentId });
    if (!data) return;

    const { token } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
      staffId,
      shopId: data.shopId,
      recruitmentId,
    });

    const resend = getResendClient();
    const appUrl = process.env.APP_URL ?? "https://yps.app";
    const magicLinkUrl = `${appUrl}/shifts/view?token=${token}`;

    await resend.emails.send({
      from: `${data.shopName} <noreply@shiftori.app>`,
      to: data.staffEmail,
      subject: `【${data.shopName}】${data.periodLabel} シフト閲覧リンク`,
      html: buildReissueEmailHtml({
        staffName: data.staffName,
        periodLabel: data.periodLabel,
        magicLinkUrl,
      }),
    });
  },
});

/**
 * 募集開始メールを全スタッフに送信
 * createRecruitment mutation から ctx.scheduler 経由で呼ばれる
 */
export const sendRecruitmentNotificationEmails = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.email.queries.getRecruitmentEmailData, { recruitmentId });
    if (!data) return;

    const resend = getResendClient();

    const expiresAt = getDeadlineCutoff(data.deadline);

    for (const staff of data.staffEntries) {
      const { token } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
        staffId: staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        expiresAt,
      });

      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      await resend.emails.send({
        from: `${data.shopName} <noreply@shiftori.app>`,
        to: staff.email,
        subject: `【${data.shopName}】${data.periodLabel} シフト希望の提出をお願いします`,
        html: buildRecruitmentEmailHtml({
          staffName: staff.name,
          periodLabel: data.periodLabel,
          deadline: formatDateLabel(data.deadline),
          magicLinkUrl,
        }),
      });
    }
  },
});
