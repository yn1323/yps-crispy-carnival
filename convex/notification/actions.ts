"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatDateLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
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

/**
 * シフト確定通知の配信
 * - 連携済みかつ友達追加中 → LINE Push
 * - それ以外 → メール（未連携なら CTA を末尾に挿入）
 */
export const sendShiftConfirmationEmails = internalAction({
  args: { recruitmentId: v.id("recruitments"), isResend: v.boolean() },
  handler: async (ctx, { recruitmentId, isResend }) => {
    const data = await ctx.runQuery(internal.notification.queries.getConfirmationEmailData, { recruitmentId });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const resend = getResendClient({ suppressDelivery });

    for (const staffData of data.staffEntries) {
      const channel = selectChannel(
        { lineUserId: staffData.lineUserId, lineFollowing: staffData.lineFollowing },
        quota,
      );

      const { token: viewToken } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
        staffId: staffData.staffId,
        shopId: data.shopId,
        recruitmentId,
        accessKind: "view",
      });
      const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;

      if (channel === "line" && staffData.lineUserId) {
        // LINE失敗時のメールフォールバックでも同じ閲覧リンクを使う。
        // 先にトークンを切ることで、送信経路だけが変わってもスタッフの遷移先は揃う。
        const text = buildShiftConfirmationLineText({
          staffName: staffData.name,
          shopName: data.shopName,
          periodLabel: data.periodLabel,
          shifts: staffData.shifts,
          magicLinkUrl,
          isResend,
        });
        try {
          await pushTextMessage(staffData.lineUserId, text, { suppressDelivery });
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
    shifts: { date: string; timeLabel?: string | null; startTime?: string | null; endTime?: string | null }[];
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
    from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
    to: staffData.email,
    subject: isResend
      ? formatResendSubject(data.shopName, `${data.periodLabel} シフト変更のお知らせ`)
      : formatResendSubject(data.shopName, `${data.periodLabel} シフト確定のお知らせ`),
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
    const log = (level: "log" | "warn" | "error", event: string, extra: Record<string, unknown> = {}) =>
      console[level](`[sendReissueEmail] ${event}`, { staffId, recruitmentId, ...extra });

    const data = await ctx.runQuery(internal.notification.queries.getReissueEmailData, { staffId, recruitmentId });
    if (!data) return log("warn", "data_not_found");

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const channel = selectChannel({ lineUserId: data.lineUserId, lineFollowing: data.lineFollowing }, quota);
    log("log", "channel_selected", {
      channel,
      hasLineUserId: Boolean(data.lineUserId),
      lineFollowing: Boolean(data.lineFollowing),
      hasEmail: Boolean(data.staffEmail),
      quotaStatus: quota?.status,
    });

    const { token } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
      staffId,
      shopId: data.shopId,
      recruitmentId,
      accessKind: "view",
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
          { suppressDelivery },
        );
        return log("log", "line_sent");
      } catch (e) {
        log("error", "line_push_failed; falling back to email", { error: errorMessage(e) });
      }
    }

    if (!data.staffEmail) return log("log", "no_email_no_line_skip");

    try {
      const resend = getResendClient({ suppressDelivery });
      await resend.emails.send({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: data.staffEmail,
        subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト閲覧リンク`),
        html: buildReissueEmailHtml({
          staffName: data.staffName,
          periodLabel: data.periodLabel,
          magicLinkUrl,
        }),
      });
      log("log", "email_sent");
    } catch (e) {
      // Resend API のエラー（API key 無効 / domain 未認証 / 4xx / 5xx）が action 全体を
      // 落とすとフロントには成功扱いで返ってしまうため、ここで握ってログだけ残す。
      log("error", "email_send_failed", { error: errorMessage(e) });
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
    const data = await ctx.runQuery(internal.notification.queries.getRecruitmentEmailData, { recruitmentId });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const resend = getResendClient({ suppressDelivery });
    const expiresAt = getDeadlineCutoff(data.deadline);

    for (const staff of data.staffEntries) {
      const channel = selectChannel({ lineUserId: staff.lineUserId, lineFollowing: staff.lineFollowing }, quota);

      const { token } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
        staffId: staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt,
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      if (channel === "line" && staff.lineUserId) {
        // Quota は日次同期なので実送信で失敗する可能性がある。送れない場合は同じ token のメールへ逃がす。
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
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: staff.email,
        subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト希望の提出をお願いします`),
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

/**
 * スタッフ追加時: 追加された1スタッフへ、現在募集中の希望提出リンクをメールで送る。
 */
export const sendOpenRecruitmentNotificationEmailsForStaff = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
      staffId,
    });
    if (!data || data.recruitments.length === 0 || !data.staff.email) return;
    // スタッフ追加時の追送は個別失敗を握る。登録 mutation を成功扱いにした後の補助通知なので、
    // 1件のメール不達で他の募集中リンク送信まで止めない。
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );

    for (const recruitment of data.recruitments) {
      const { token } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        accessKind: "submit",
        expiresAt: getDeadlineCutoff(recruitment.deadline),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;
      const lineCtaHtml = await buildLineCtaForStaff(ctx, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        lineUserId: data.staff.lineUserId,
        lineFollowing: data.staff.lineFollowing,
        appUrl: APP_URL,
      });

      try {
        const resend = getResendClient({ suppressDelivery });
        await resend.emails.send({
          from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
          to: data.staff.email,
          subject: formatResendSubject(data.shopName, `${recruitment.periodLabel} シフト希望の提出をお願いします`),
          html: buildRecruitmentEmailHtml({
            staffName: data.staff.name,
            periodLabel: recruitment.periodLabel,
            deadline: formatDateLabel(recruitment.deadline),
            magicLinkUrl,
            lineCtaHtml,
          }),
        });
      } catch (e) {
        console.error("Recruitment notification email failed for added staff", e);
      }
    }
  },
});

/**
 * LINE連携・follow時: 1スタッフへ、現在募集中の希望提出リンクをLINEで送る。
 */
export const sendOpenRecruitmentNotificationLinesForStaff = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
      staffId,
    });
    if (!data || data.recruitments.length === 0 || !data.staff.lineUserId) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const channel = selectChannel(
      { lineUserId: data.staff.lineUserId, lineFollowing: data.staff.lineFollowing },
      quota,
    );
    // follow直後でも quota exceeded が分かっている場合は送らない。
    // メール経路はスタッフ追加時・募集作成時に別途担保される。
    if (channel !== "line") return;

    for (const recruitment of data.recruitments) {
      const { token } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        accessKind: "submit",
        expiresAt: getDeadlineCutoff(recruitment.deadline),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      try {
        await pushTextMessage(
          data.staff.lineUserId,
          buildRecruitmentLineText({
            staffName: data.staff.name,
            shopName: data.shopName,
            periodLabel: recruitment.periodLabel,
            deadline: formatDateLabel(recruitment.deadline),
            magicLinkUrl,
          }),
          { suppressDelivery },
        );
      } catch (e) {
        console.error("LINE push failed for open recruitment notification", e);
      }
    }
  },
});
