"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatDeadlineLabel, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import type { NotificationEmailPayload } from "../notificationOutbox/types";
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
        const text = buildShiftConfirmationLineText({
          staffName: staffData.name,
          shopName: data.shopName,
          periodLabel: data.periodLabel,
          shifts: staffData.shifts,
          magicLinkUrl,
          isResend,
        });
        const fallbackEmail = await buildConfirmationEmail({
          ctx,
          staffData,
          data,
          recruitmentId,
          magicLinkUrl,
          isResend,
          suppressDelivery,
        });
        await enqueueLine(ctx, {
          shopId: data.shopId,
          staffId: staffData.staffId,
          dedupeKey: `line:confirmation:${recruitmentId}:${staffData.staffId}:${isResend ? "resend" : "confirm"}`,
          payload: linePayload({
            toUserId: staffData.lineUserId,
            text,
            suppressDelivery,
            ...(fallbackEmail ? { fallbackEmail } : {}),
          }),
        });
        continue;
      }

      await enqueueConfirmationEmail({
        ctx,
        staffData,
        data,
        recruitmentId,
        magicLinkUrl,
        isResend,
        suppressDelivery,
      });
    }
  },
});

async function buildConfirmationEmail(opts: {
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
  suppressDelivery: boolean;
  dedupeKey?: string;
}): Promise<{ dedupeKey: string; payload: NotificationEmailPayload } | null> {
  const { ctx, staffData, data, recruitmentId, magicLinkUrl, isResend, suppressDelivery, dedupeKey } = opts;
  if (!staffData.email) return null;

  const reissueUrl = `${APP_URL}/shifts/reissue?recruitmentId=${recruitmentId}`;
  const lineCtaHtml = await buildLineCtaForStaff(ctx, {
    staffId: staffData.staffId,
    shopId: data.shopId,
    lineUserId: staffData.lineUserId,
    lineFollowing: staffData.lineFollowing,
    appUrl: APP_URL,
  });

  return {
    dedupeKey:
      dedupeKey ?? `email:confirmation:${recruitmentId}:${staffData.staffId}:${isResend ? "resend" : "confirm"}`,
    payload: emailPayload({
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
      context: "notification.sendConfirmationEmail",
      suppressDelivery,
    }),
  };
}

async function enqueueConfirmationEmail(opts: Parameters<typeof buildConfirmationEmail>[0]): Promise<void> {
  const email = await buildConfirmationEmail(opts);
  if (!email) return;
  await enqueueEmail(opts.ctx, {
    shopId: opts.data.shopId,
    staffId: opts.staffData.staffId,
    dedupeKey: email.dedupeKey,
    payload: email.payload,
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
      const fallbackEmail = data.staffEmail
        ? {
            dedupeKey: `email:reissue:${recruitmentId}:${staffId}`,
            payload: emailPayload({
              from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
              to: data.staffEmail,
              subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト閲覧リンク`),
              html: buildReissueEmailHtml({
                staffName: data.staffName,
                periodLabel: data.periodLabel,
                magicLinkUrl,
              }),
              context: "notification.sendReissueEmail",
              suppressDelivery,
            }),
          }
        : undefined;
      const result = await enqueueLine(ctx, {
        shopId: data.shopId,
        staffId,
        dedupeKey: `line:reissue:${recruitmentId}:${staffId}`,
        payload: linePayload({
          toUserId: data.lineUserId,
          text: buildReissueLineText({
            staffName: data.staffName,
            shopName: data.shopName,
            periodLabel: data.periodLabel,
            magicLinkUrl,
          }),
          suppressDelivery,
          ...(fallbackEmail ? { fallbackEmail } : {}),
        }),
      });
      return result ? log("log", "line_enqueued") : log("error", "line_enqueue_failed");
    }

    if (!data.staffEmail) return log("log", "no_email_no_line_skip");

    try {
      const result = await enqueueEmail(ctx, {
        shopId: data.shopId,
        staffId,
        dedupeKey: `email:reissue:${recruitmentId}:${staffId}`,
        payload: emailPayload({
          from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
          to: data.staffEmail,
          subject: formatResendSubject(data.shopName, `${data.periodLabel} シフト閲覧リンク`),
          html: buildReissueEmailHtml({
            staffName: data.staffName,
            periodLabel: data.periodLabel,
            magicLinkUrl,
          }),
          context: "notification.sendReissueEmail",
          suppressDelivery,
        }),
      });
      if (result) {
        log("log", "email_enqueued");
      } else {
        log("error", "email_enqueue_failed");
      }
    } catch (e) {
      log("error", "email_enqueue_failed", { error: errorMessage(e) });
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
    const expiresAt = getSubmitLinkCutoff(data.periodStart);

    for (const staff of data.staffEntries) {
      const channel = selectChannel({ lineUserId: staff.lineUserId, lineFollowing: staff.lineFollowing }, quota);

      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        expiresAt,
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      if (channel === "line" && staff.lineUserId) {
        const fallbackEmail = staff.email
          ? await buildRecruitmentEmail({
              ctx,
              shopId: data.shopId,
              shopName: data.shopName,
              staff,
              recruitmentId,
              periodLabel: data.periodLabel,
              deadline: data.deadline,
              magicLinkUrl,
              suppressDelivery,
              context: "notification.sendRecruitmentNotificationEmails",
            })
          : null;
        await enqueueLine(ctx, {
          shopId: data.shopId,
          staffId: staff.staffId,
          dedupeKey: `line:recruitment:${recruitmentId}:${staff.staffId}`,
          payload: linePayload({
            toUserId: staff.lineUserId,
            text: buildRecruitmentLineText({
              staffName: staff.name,
              shopName: data.shopName,
              periodLabel: data.periodLabel,
              deadline: formatDeadlineLabel(data.deadline),
              magicLinkUrl,
            }),
            suppressDelivery,
            ...(fallbackEmail ? { fallbackEmail } : {}),
          }),
        });
        continue;
      }

      if (!staff.email) continue;
      const email = await buildRecruitmentEmail({
        ctx,
        shopId: data.shopId,
        shopName: data.shopName,
        staff,
        recruitmentId,
        periodLabel: data.periodLabel,
        deadline: data.deadline,
        magicLinkUrl,
        suppressDelivery,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      if (email) {
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          staffId: staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      }
    }
  },
});

async function buildRecruitmentEmail(opts: {
  ctx: ActionCtx;
  shopId: Id<"shops">;
  shopName: string;
  staff: {
    staffId: Id<"staffs">;
    name: string;
    email: string;
    lineUserId?: string;
    lineFollowing?: boolean;
  };
  recruitmentId: Id<"recruitments">;
  periodLabel: string;
  deadline: string;
  magicLinkUrl: string;
  suppressDelivery: boolean;
  context: string;
  dedupeKey?: string;
}): Promise<{ dedupeKey: string; payload: NotificationEmailPayload } | null> {
  const {
    ctx,
    shopId,
    shopName,
    staff,
    recruitmentId,
    periodLabel,
    deadline,
    magicLinkUrl,
    suppressDelivery,
    context,
    dedupeKey,
  } = opts;
  if (!staff.email) return null;

  const lineCtaHtml = await buildLineCtaForStaff(ctx, {
    staffId: staff.staffId,
    shopId,
    lineUserId: staff.lineUserId,
    lineFollowing: staff.lineFollowing,
    appUrl: APP_URL,
  });

  return {
    dedupeKey: dedupeKey ?? `email:recruitment:${recruitmentId}:${staff.staffId}`,
    payload: emailPayload({
      from: formatResendFrom(shopName, RESEND_FROM_EMAIL),
      to: staff.email,
      subject: formatResendSubject(shopName, `${periodLabel} シフト希望の提出をお願いします`),
      html: buildRecruitmentEmailHtml({
        staffName: staff.name,
        periodLabel,
        deadline: formatDeadlineLabel(deadline),
        magicLinkUrl,
        lineCtaHtml,
      }),
      context,
      suppressDelivery,
    }),
  };
}

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
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      try {
        const email = await buildRecruitmentEmail({
          ctx,
          shopId: data.shopId,
          shopName: data.shopName,
          staff: data.staff,
          recruitmentId: recruitment.recruitmentId,
          periodLabel: recruitment.periodLabel,
          deadline: recruitment.deadline,
          magicLinkUrl,
          suppressDelivery,
          context: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        console.error("Recruitment notification email enqueue failed for added staff", e);
      }
    }
  },
});

/**
 * メール変更時: 変更後メールアドレスへ、現在募集中の希望提出リンクを送る。
 */
export const sendOpenRecruitmentNotificationEmailsForStaffEmailChange = internalAction({
  args: {
    staffId: v.id("staffs"),
    expectedEmailNormalized: v.string(),
    emailChangedAt: v.number(),
  },
  handler: async (ctx, { staffId, expectedEmailNormalized, emailChangedAt }) => {
    const data = await ctx.runQuery(
      internal.notification.queries.getOpenRecruitmentEmailChangeNotificationDataForStaff,
      {
        staffId,
        expectedEmailNormalized,
      },
    );
    if (!data || data.recruitments.length === 0 || !data.staff.email) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const channel = selectChannel(
      { lineUserId: data.staff.lineUserId, lineFollowing: data.staff.lineFollowing },
      quota,
    );
    if (channel === "line") return;

    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );

    for (const recruitment of data.recruitments) {
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      try {
        const email = await buildRecruitmentEmail({
          ctx,
          shopId: data.shopId,
          shopName: data.shopName,
          staff: data.staff,
          recruitmentId: recruitment.recruitmentId,
          periodLabel: recruitment.periodLabel,
          deadline: recruitment.deadline,
          magicLinkUrl,
          suppressDelivery,
          context: "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
          dedupeKey: `email:openRecruitmentEmailChange:${recruitment.recruitmentId}:${data.staff.staffId}:${emailChangedAt}`,
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        console.error("Recruitment notification email enqueue failed after staff email change", e);
      }
    }
  },
});

/**
 * 手動再送: 1スタッフへ、現在送れる募集中シフトを通常の LINE / メール振り分けで送る。
 */
export const sendOpenRecruitmentNotificationsForStaff = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
      staffId,
    });
    if (!data || data.recruitments.length === 0) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const manualRunId = Date.now();

    for (const recruitment of data.recruitments) {
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;
      const channel = selectChannel(
        { lineUserId: data.staff.lineUserId, lineFollowing: data.staff.lineFollowing },
        quota,
      );

      try {
        if (channel === "line" && data.staff.lineUserId) {
          const fallbackEmail = data.staff.email
            ? await buildRecruitmentEmail({
                ctx,
                shopId: data.shopId,
                shopName: data.shopName,
                staff: data.staff,
                recruitmentId: recruitment.recruitmentId,
                periodLabel: recruitment.periodLabel,
                deadline: recruitment.deadline,
                magicLinkUrl,
                suppressDelivery,
                context: "notification.sendOpenRecruitmentNotificationsForStaff",
                dedupeKey: `email:manualRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}:${manualRunId}`,
              })
            : null;
          await enqueueLine(ctx, {
            shopId: data.shopId,
            staffId: data.staff.staffId,
            dedupeKey: `line:manualRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}:${manualRunId}`,
            payload: linePayload({
              toUserId: data.staff.lineUserId,
              text: buildRecruitmentLineText({
                staffName: data.staff.name,
                shopName: data.shopName,
                periodLabel: recruitment.periodLabel,
                deadline: formatDeadlineLabel(recruitment.deadline),
                magicLinkUrl,
              }),
              suppressDelivery,
              ...(fallbackEmail ? { fallbackEmail } : {}),
            }),
          });
          continue;
        }

        const email = await buildRecruitmentEmail({
          ctx,
          shopId: data.shopId,
          shopName: data.shopName,
          staff: data.staff,
          recruitmentId: recruitment.recruitmentId,
          periodLabel: recruitment.periodLabel,
          deadline: recruitment.deadline,
          magicLinkUrl,
          suppressDelivery,
          context: "notification.sendOpenRecruitmentNotificationsForStaff",
          dedupeKey: `email:manualRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}:${manualRunId}`,
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        console.error("Manual recruitment notification enqueue failed", e);
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
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      try {
        await enqueueLine(ctx, {
          shopId: data.shopId,
          staffId: data.staff.staffId,
          dedupeKey: `line:openRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}`,
          payload: linePayload({
            toUserId: data.staff.lineUserId,
            text: buildRecruitmentLineText({
              staffName: data.staff.name,
              shopName: data.shopName,
              periodLabel: recruitment.periodLabel,
              deadline: formatDeadlineLabel(recruitment.deadline),
              magicLinkUrl,
            }),
            suppressDelivery,
          }),
        });
      } catch (e) {
        console.error("LINE push enqueue failed for open recruitment notification", e);
      }
    }
  },
});

/**
 * 手動再送: 1スタッフへ、現在の確定シフトを送る。
 */
export const sendCurrentShiftConfirmationForStaff = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, {
      staffId,
    });
    if (!data || data.recruitments.length === 0) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const manualRunId = Date.now();

    for (const recruitment of data.recruitments) {
      const staffData = recruitment.staffEntry;
      const channel = selectChannel(
        { lineUserId: staffData.lineUserId, lineFollowing: staffData.lineFollowing },
        quota,
      );
      const { token: viewToken } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
        staffId: staffData.staffId,
        shopId: data.shopId,
        recruitmentId: recruitment.recruitmentId,
        accessKind: "view",
      });
      const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;
      const confirmationData = {
        shopId: data.shopId,
        shopName: data.shopName,
        periodLabel: recruitment.periodLabel,
      };

      try {
        if (channel === "line" && staffData.lineUserId) {
          const fallbackEmail = await buildConfirmationEmail({
            ctx,
            staffData,
            data: confirmationData,
            recruitmentId: recruitment.recruitmentId,
            magicLinkUrl,
            isResend: false,
            suppressDelivery,
            dedupeKey: `email:manualConfirmation:${recruitment.recruitmentId}:${staffData.staffId}:${manualRunId}`,
          });
          await enqueueLine(ctx, {
            shopId: data.shopId,
            staffId: staffData.staffId,
            dedupeKey: `line:manualConfirmation:${recruitment.recruitmentId}:${staffData.staffId}:${manualRunId}`,
            payload: linePayload({
              toUserId: staffData.lineUserId,
              text: buildShiftConfirmationLineText({
                staffName: staffData.name,
                shopName: data.shopName,
                periodLabel: recruitment.periodLabel,
                shifts: staffData.shifts,
                magicLinkUrl,
                isResend: false,
              }),
              suppressDelivery,
              ...(fallbackEmail ? { fallbackEmail } : {}),
            }),
          });
          continue;
        }

        await enqueueConfirmationEmail({
          ctx,
          staffData,
          data: confirmationData,
          recruitmentId: recruitment.recruitmentId,
          magicLinkUrl,
          isResend: false,
          suppressDelivery,
          dedupeKey: `email:manualConfirmation:${recruitment.recruitmentId}:${staffData.staffId}:${manualRunId}`,
        });
      } catch (e) {
        console.error("Manual current shift notification enqueue failed", e);
      }
    }
  },
});
