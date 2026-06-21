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
import { recordNotificationPreparationFailure } from "./failureRecording";
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
  args: {
    recruitmentId: v.id("recruitments"),
    isResend: v.boolean(),
    targetStaffIds: v.optional(v.array(v.id("staffs"))),
    notificationRunId: v.optional(v.number()),
  },
  handler: async (ctx, { recruitmentId, isResend, targetStaffIds, notificationRunId }) => {
    const data = await ctx.runQuery(internal.notification.queries.getConfirmationEmailData, {
      recruitmentId,
      ...(targetStaffIds ? { targetStaffIds } : {}),
    });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const dedupeSuffix = isResend ? `resend:${notificationRunId ?? Date.now()}` : "confirm";

    for (const staffData of data.staffEntries) {
      const channel = selectChannel(
        { lineUserId: staffData.lineUserId, lineFollowing: staffData.lineFollowing },
        quota,
      );
      const emailDedupeKey = `email:confirmation:${recruitmentId}:${staffData.staffId}:${dedupeSuffix}`;
      const lineDedupeKey = `line:confirmation:${recruitmentId}:${staffData.staffId}:${dedupeSuffix}`;
      const selectedChannel = channel === "line" && staffData.lineUserId ? "line" : "email";
      const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
      if (selectedChannel === "email" && !staffData.email) continue;

      try {
        const { token: viewToken } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
          staffId: staffData.staffId,
          shopId: data.shopId,
          recruitmentId,
          accessKind: "view",
        });
        const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;

        if (selectedChannel === "line" && staffData.lineUserId) {
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
            dedupeKey: emailDedupeKey,
          });
          const result = await enqueueLine(ctx, {
            shopId: data.shopId,
            recruitmentId,
            staffId: staffData.staffId,
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: staffData.lineUserId,
              text,
              suppressDelivery,
              ...(fallbackEmail ? { fallbackEmail } : {}),
            }),
          });
          if (result) {
            await recordConfirmationSnapshotSentSafely(ctx, recruitmentId, staffData);
          }
          continue;
        }

        const result = await enqueueConfirmationEmail({
          ctx,
          staffData,
          data,
          recruitmentId,
          magicLinkUrl,
          isResend,
          suppressDelivery,
          dedupeKey: emailDedupeKey,
        });
        if (result) {
          await recordConfirmationSnapshotSentSafely(ctx, recruitmentId, staffData);
        }
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId,
            staffId: staffData.staffId,
            channel: selectedChannel,
            dedupeKey,
            notificationContext: "notification.sendConfirmationEmail",
          },
          e,
          "Shift confirmation notification preparation failed",
        );
      }
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

async function enqueueConfirmationEmail(opts: Parameters<typeof buildConfirmationEmail>[0]) {
  const email = await buildConfirmationEmail(opts);
  if (!email) return null;
  return await enqueueEmail(opts.ctx, {
    shopId: opts.data.shopId,
    recruitmentId: opts.recruitmentId,
    staffId: opts.staffData.staffId,
    dedupeKey: email.dedupeKey,
    payload: email.payload,
  });
}

async function recordConfirmationSnapshotSent(
  ctx: ActionCtx,
  recruitmentId: Id<"recruitments">,
  staffData: {
    staffId: Id<"staffs">;
    snapshotAssignments: Array<{
      date: string;
      startTime: string;
      endTime: string;
      positionId: Id<"positions">;
      optionId?: string;
    }>;
    snapshotSignature: string;
  },
) {
  await ctx.runMutation(internal.notification.mutations.upsertConfirmationSnapshot, {
    recruitmentId,
    staffId: staffData.staffId,
    assignments: staffData.snapshotAssignments,
    signature: staffData.snapshotSignature,
    sentAt: Date.now(),
  });
}

async function recordConfirmationSnapshotSentSafely(
  ctx: ActionCtx,
  recruitmentId: Id<"recruitments">,
  staffData: Parameters<typeof recordConfirmationSnapshotSent>[2],
) {
  try {
    await recordConfirmationSnapshotSent(ctx, recruitmentId, staffData);
  } catch (e) {
    console.error("Shift confirmation snapshot recording failed after notification enqueue", e);
  }
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
      const selectedChannel = channel === "line" && staff.lineUserId ? "line" : "email";
      const emailDedupeKey = `email:recruitment:${recruitmentId}:${staff.staffId}`;
      const lineDedupeKey = `line:recruitment:${recruitmentId}:${staff.staffId}`;
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
                dedupeKey: emailDedupeKey,
              })
            : null;
          await enqueueLine(ctx, {
            shopId: data.shopId,
            recruitmentId,
            staffId: staff.staffId,
            dedupeKey: lineDedupeKey,
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
          dedupeKey: emailDedupeKey,
        });
        if (email) {
          await enqueueEmail(ctx, {
            shopId: data.shopId,
            recruitmentId,
            staffId: staff.staffId,
            dedupeKey: email.dedupeKey,
            payload: email.payload,
          });
        }
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId,
            staffId: staff.staffId,
            channel: selectedChannel,
            dedupeKey,
            notificationContext: "notification.sendRecruitmentNotificationEmails",
          },
          e,
          "Recruitment notification preparation failed",
        );
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
      const dedupeKey = `email:recruitment:${recruitment.recruitmentId}:${data.staff.staffId}`;

      try {
        const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
          staffId: data.staff.staffId,
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
        });
        const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;
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
          dedupeKey,
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            channel: "email",
            dedupeKey,
            notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
          },
          e,
          "Recruitment notification email preparation failed for added staff",
        );
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
      const dedupeKey = `email:openRecruitmentEmailChange:${recruitment.recruitmentId}:${data.staff.staffId}:${emailChangedAt}`;

      try {
        const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
          staffId: data.staff.staffId,
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
        });
        const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;
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
          dedupeKey,
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            channel: "email",
            dedupeKey,
            notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
          },
          e,
          "Recruitment notification email preparation failed after staff email change",
        );
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
      const channel = selectChannel(
        { lineUserId: data.staff.lineUserId, lineFollowing: data.staff.lineFollowing },
        quota,
      );
      const selectedChannel = channel === "line" && data.staff.lineUserId ? "line" : "email";
      const emailDedupeKey = `email:manualRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}:${manualRunId}`;
      const lineDedupeKey = `line:manualRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}:${manualRunId}`;
      const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
      if (selectedChannel === "email" && !data.staff.email) continue;

      try {
        const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
          staffId: data.staff.staffId,
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
        });
        const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

        if (selectedChannel === "line" && data.staff.lineUserId) {
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
                dedupeKey: emailDedupeKey,
              })
            : null;
          await enqueueLine(ctx, {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            dedupeKey: lineDedupeKey,
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
          dedupeKey: emailDedupeKey,
        });
        if (!email) continue;
        await enqueueEmail(ctx, {
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          dedupeKey: email.dedupeKey,
          payload: email.payload,
        });
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            channel: selectedChannel,
            dedupeKey,
            notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
          },
          e,
          "Manual recruitment notification preparation failed",
        );
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
      const dedupeKey = `line:openRecruitment:${recruitment.recruitmentId}:${data.staff.staffId}`;

      try {
        const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
          staffId: data.staff.staffId,
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          expiresAt: getSubmitLinkCutoff(recruitment.periodStart),
        });
        const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;
        await enqueueLine(ctx, {
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          dedupeKey,
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
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            channel: "line",
            dedupeKey,
            notificationContext: "notification.sendOpenRecruitmentNotificationLinesForStaff",
          },
          e,
          "LINE push preparation failed for open recruitment notification",
        );
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
      const selectedChannel = channel === "line" && staffData.lineUserId ? "line" : "email";
      const emailDedupeKey = `email:manualConfirmation:${recruitment.recruitmentId}:${staffData.staffId}:${manualRunId}`;
      const lineDedupeKey = `line:manualConfirmation:${recruitment.recruitmentId}:${staffData.staffId}:${manualRunId}`;
      const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
      if (selectedChannel === "email" && !staffData.email) continue;
      const confirmationData = {
        shopId: data.shopId,
        shopName: data.shopName,
        periodLabel: recruitment.periodLabel,
      };

      try {
        const { token: viewToken } = await ctx.runMutation(internal.notification.mutations.createMagicLink, {
          staffId: staffData.staffId,
          shopId: data.shopId,
          recruitmentId: recruitment.recruitmentId,
          accessKind: "view",
        });
        const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;

        if (selectedChannel === "line" && staffData.lineUserId) {
          const fallbackEmail = await buildConfirmationEmail({
            ctx,
            staffData,
            data: confirmationData,
            recruitmentId: recruitment.recruitmentId,
            magicLinkUrl,
            isResend: false,
            suppressDelivery,
            dedupeKey: emailDedupeKey,
          });
          await enqueueLine(ctx, {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: staffData.staffId,
            dedupeKey: lineDedupeKey,
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
          dedupeKey: emailDedupeKey,
        });
      } catch (e) {
        await recordNotificationPreparationFailure(
          ctx,
          {
            shopId: data.shopId,
            recruitmentId: recruitment.recruitmentId,
            staffId: staffData.staffId,
            channel: selectedChannel,
            dedupeKey,
            notificationContext: "notification.sendCurrentShiftConfirmationForStaff",
          },
          e,
          "Manual current shift notification preparation failed",
        );
      }
    }
  },
});
