"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { formatDateLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { pushTextMessage } from "../_lib/lineClient";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { getResendClient } from "../_lib/resend";
import {
  buildConfirmationEmailHtml,
  buildRecruitmentEmailHtml,
  buildRecruitmentLineText,
  buildReissueEmailHtml,
  buildReissueLineText,
  buildShiftConfirmationLineText,
} from "./templates";

const APP_URL = process.env.APP_URL ?? "https://shiftori.app";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@shiftori.app";

/**
 * シフト確定通知の配信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 → メール（未連携なら CTA を末尾に挿入）
 */
export const sendShiftConfirmationEmails = internalAction({
  args: { recruitmentId: v.id("recruitments"), isResend: v.boolean() },
  handler: async (ctx, { recruitmentId, isResend }) => {
    const data = await ctx.runQuery(internal.email.queries.getConfirmationEmailData, { recruitmentId });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const resend = getResendClient();

    for (const staffData of data.staffEntries) {
      const channel = selectChannel(
        { lineUserId: staffData.lineUserId, lineFollowing: staffData.lineFollowing },
        quota,
      );

      const { token: viewToken } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
        staffId: staffData.staffId,
        shopId: data.shopId,
        recruitmentId,
      });
      const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;

      if (channel === "line" && staffData.lineUserId) {
        const text = buildShiftConfirmationLineText({
          staffName: staffData.name,
          shopName: data.shopName,
          periodLabel: data.periodLabel,
          shifts: staffData.shifts,
          magicLinkUrl,
          isResend,
        });
        try {
          await pushTextMessage(staffData.lineUserId, text);
        } catch (e) {
          console.error("LINE push failed; falling back to email", e);
          await sendConfirmationEmail({
            ctx,
            staffData,
            data,
            recruitmentId,
            magicLinkUrl,
            isResend,
            resend,
          });
        }
        continue;
      }

      await sendConfirmationEmail({ ctx, staffData, data, recruitmentId, magicLinkUrl, isResend, resend });
    }
  },
});

async function sendConfirmationEmail(opts: {
  ctx: ActionCtx;
  staffData: {
    staffId: Id<"staffs">;
    name: string;
    email: string;
    lineUserId?: string;
    lineFollowing?: boolean;
    shifts: { date: string; startTime: string | null; endTime: string | null }[];
  };
  data: { shopId: Id<"shops">; shopName: string; periodLabel: string };
  recruitmentId: Id<"recruitments">;
  magicLinkUrl: string;
  isResend: boolean;
  resend: ReturnType<typeof getResendClient>;
}): Promise<void> {
  const { ctx, staffData, data, recruitmentId, magicLinkUrl, isResend, resend } = opts;
  if (!staffData.email) return;

  const reissueUrl = `${APP_URL}/shifts/reissue?recruitmentId=${recruitmentId}`;
  const lineCtaHtml = await buildLineCtaForStaff(ctx, {
    staffId: staffData.staffId,
    shopId: data.shopId,
    lineUserId: staffData.lineUserId,
    lineFollowing: staffData.lineFollowing,
    appUrl: APP_URL,
  });

  await resend.emails.send({
    from: `${data.shopName} <${RESEND_FROM}>`,
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
      lineCtaHtml,
    }),
  });
}

/**
 * 再発行メールの配信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 / LINE失敗時 → メール
 */
export const sendReissueEmail = internalAction({
  args: {
    staffId: v.id("staffs"),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { staffId, recruitmentId }) => {
    const base = { staffId, recruitmentId };
    const log = (event: string, extra: Record<string, unknown> = {}) =>
      console.log(`[sendReissueEmail] ${event}`, { ...base, ...extra });
    const logWarn = (event: string, extra: Record<string, unknown> = {}) =>
      console.warn(`[sendReissueEmail] ${event}`, { ...base, ...extra });
    const logError = (event: string, e: unknown, extra: Record<string, unknown> = {}) =>
      console.error(`[sendReissueEmail] ${event}`, { ...base, ...extra, error: errorMessage(e) });

    const data = await ctx.runQuery(internal.email.queries.getReissueEmailData, { staffId, recruitmentId });
    if (!data) {
      logWarn("data_not_found");
      return;
    }

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const channel = selectChannel({ lineUserId: data.lineUserId, lineFollowing: data.lineFollowing }, quota);
    log("channel_selected", {
      channel,
      hasLineUserId: Boolean(data.lineUserId),
      lineFollowing: Boolean(data.lineFollowing),
      hasEmail: Boolean(data.staffEmail),
      quotaStatus: quota?.status ?? null,
    });

    const { token } = await ctx.runMutation(internal.email.mutations.createMagicLink, {
      staffId,
      shopId: data.shopId,
      recruitmentId,
    });
    const magicLinkUrl = `${APP_URL}/shifts/view?token=${token}`;

    if (channel === "line" && data.lineUserId) {
      try {
        await pushTextMessage(
          data.lineUserId,
          buildReissueLineText({
            staffName: data.staffName,
            shopName: data.shopName,
            periodLabel: data.periodLabel,
            magicLinkUrl,
          }),
        );
        log("line_sent");
        return;
      } catch (e) {
        logError("line_push_failed; falling back to email", e);
      }
    }

    if (!data.staffEmail) {
      log("no_email_no_line_skip");
      return;
    }

    try {
      const resend = getResendClient();
      await resend.emails.send({
        from: `${data.shopName} <${RESEND_FROM}>`,
        to: data.staffEmail,
        subject: `【${data.shopName}】${data.periodLabel} シフト閲覧リンク`,
        html: buildReissueEmailHtml({
          staffName: data.staffName,
          periodLabel: data.periodLabel,
          magicLinkUrl,
        }),
      });
      log("email_sent");
    } catch (e) {
      // Resend API のエラー（API key 無効 / domain 未認証 / 4xx / 5xx）が action 全体を
      // 落とすとフロントには成功扱いで返ってしまうため、ここで握ってログだけ残す。
      logError("email_send_failed", e);
    }
  },
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 募集開始通知の配信（LINE 振り分け対応）
 */
export const sendRecruitmentNotificationEmails = internalAction({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const data = await ctx.runQuery(internal.email.queries.getRecruitmentEmailData, { recruitmentId });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const resend = getResendClient();
    const expiresAt = getDeadlineCutoff(data.deadline);

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
            buildRecruitmentLineText({
              staffName: staff.name,
              shopName: data.shopName,
              periodLabel: data.periodLabel,
              deadline: formatDateLabel(data.deadline),
              magicLinkUrl,
            }),
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
        from: `${data.shopName} <${RESEND_FROM}>`,
        to: staff.email,
        subject: `【${data.shopName}】${data.periodLabel} シフト希望の提出をお願いします`,
        html: buildRecruitmentEmailHtml({
          staffName: staff.name,
          periodLabel: data.periodLabel,
          deadline: formatDateLabel(data.deadline),
          magicLinkUrl,
          lineCtaHtml,
        }),
      });
    }
  },
});
