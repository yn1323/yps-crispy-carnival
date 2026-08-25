"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatDeadlineLabel, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { buildLineCtaForStaff } from "../_lib/lineCta";
import { selectChannel } from "../_lib/notification";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import {
  SHIFT_CONFIRMATION_NOTIFICATION_KIND,
  SHIFT_RECRUITMENT_NOTIFICATION_KIND,
} from "../notificationOutbox/historyKinds";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";
import {
  lineRecipientOutboxSnapshot,
  type NotificationHistoryInput,
  type NotificationLineRecipient,
  type NotificationRenderedEmailPayload,
} from "../notificationOutbox/types";
import type { ConfirmationSnapshotAssignment } from "./confirmationSnapshots";
import { recordNotificationPreparationFailure } from "./failureRecording";
import { buildNotificationFanoutTargetKey } from "./fanout";
import {
  buildConfirmationEmailHtml,
  buildRecruitmentEmailHtml,
  buildRecruitmentEmailSubject,
  buildRecruitmentLineFlexMessage,
  buildRecruitmentLineText,
  buildReissueEmailHtml,
  buildReissueLineFlexMessage,
  buildReissueLineText,
  buildShiftConfirmationLineFlexMessage,
  buildShiftConfirmationLineText,
} from "./templates";

const SHIFT_REISSUE_NOTIFICATION_KIND = "shift.reissue";

function selectLineRecipient(
  recipient: NotificationLineRecipient | null,
  quota: { status: "normal" | "exceeded" } | null,
) {
  if (!recipient) return null;
  return selectChannel({ lineUserId: recipient.lineUserId, lineFollowing: recipient.following }, quota) === "line"
    ? recipient
    : null;
}

function formatShiftPeriodHistoryTitle(title: string, periodLabel: string): string {
  return `${title} ${periodLabel}`;
}

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
    // TODO[narrow]: 全deploymentの旧scheduled actionがdrainし、fanout/outbox readinessで
    //   operation link欠損が0件になった後にrequired化してensure fallbackを削除する。
    fanoutOperationId: v.optional(v.id("notificationFanoutOperations")),
    ...businessNotificationOriginArgs,
  },
  handler: async (
    ctx,
    {
      recruitmentId,
      isResend,
      targetStaffIds,
      notificationRunId,
      fanoutOperationId,
      organizationBillingVersionAtOrigin,
    },
  ) => {
    const operationId =
      fanoutOperationId ??
      (await ctx.runMutation(internal.notification.mutations.ensureConfirmationNotificationFanout, {
        recruitmentId,
        isResend,
        ...(targetStaffIds ? { targetStaffIds } : {}),
        ...(notificationRunId === undefined ? {} : { notificationRunId }),
        ...(organizationBillingVersionAtOrigin === undefined ? {} : { organizationBillingVersionAtOrigin }),
      }));
    if (!operationId) return;
    const batch = await ctx.runMutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    if (batch.state !== "claimed") return;

    const completeBatch = () =>
      ctx.runMutation(internal.notification.mutations.completeNotificationFanoutBatch, {
        operationId,
        leaseToken: batch.leaseToken,
        expectedCursor: batch.cursor,
      });
    const operationIsResend = batch.purpose === "confirmation_resend";
    const notificationOrigin = businessNotificationOriginFrom({
      organizationBillingVersionAtOrigin: batch.organizationBillingVersionAtOrigin,
    });
    const data = await ctx.runQuery(internal.notification.queries.getConfirmationEmailData, {
      recruitmentId,
      targetStaffIds: batch.targetStaffIds,
    });
    if (!data) {
      await completeBatch();
      return;
    }

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const dedupeSuffix = batch.dedupeSuffix;

    for (const staffData of data.staffEntries) {
      const lineRecipient = selectLineRecipient(staffData.lineRecipient, quota);
      const emailDedupeKey = `email:confirmation:${recruitmentId}:${staffData.staffId}:${dedupeSuffix}`;
      const lineDedupeKey = `line:confirmation:${recruitmentId}:${staffData.staffId}:${dedupeSuffix}`;
      const fanoutTargetKey = buildNotificationFanoutTargetKey(batch.operationKey, staffData.staffId);
      const legacyFanoutDedupeKeys = [emailDedupeKey, lineDedupeKey];
      const selectedChannel = lineRecipient ? "line" : "email";
      const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
      if (selectedChannel === "email" && !staffData.email) continue;

      try {
        const { token: viewToken } = await ctx.runMutation(
          internal.notification.mutations.getOrCreateNotificationViewMagicLink,
          {
            staffId: staffData.staffId,
            shopId: data.shopId,
            recruitmentId,
            notificationOperationKey: batch.operationKey,
          },
        );
        const magicLinkUrl = `${APP_URL}/shifts/view?token=${viewToken}`;

        if (lineRecipient) {
          const lineParams = {
            staffName: staffData.name,
            shopName: data.shopName,
            periodLabel: data.periodLabel,
            shifts: staffData.shifts,
            magicLinkUrl,
            isResend: operationIsResend,
          };
          const text = buildShiftConfirmationLineText(lineParams);
          const fallbackEmail = await buildConfirmationEmail({
            ctx,
            staffData,
            data,
            recruitmentId,
            magicLinkUrl,
            isResend: operationIsResend,
            suppressDelivery,
            dedupeKey: emailDedupeKey,
          });
          const result = await enqueueLine(ctx, {
            shopId: data.shopId,
            ...notificationOrigin,
            ...lineRecipientOutboxSnapshot(lineRecipient),
            purpose: "business",
            recruitmentId,
            staffId: staffData.staffId,
            history: {
              notificationKind: SHIFT_CONFIRMATION_NOTIFICATION_KIND,
              displayTitle: formatShiftPeriodHistoryTitle(
                operationIsResend ? "シフト変更のお知らせ" : "確定シフトのお知らせ",
                data.periodLabel,
              ),
            },
            dedupeAcrossTerminal: true,
            fanoutTargetKey,
            fanoutOperationId: operationId,
            fanoutLeaseToken: batch.leaseToken,
            confirmationSnapshot: {
              assignments: staffData.snapshotAssignments,
              signature: staffData.snapshotSignature,
            },
            legacyFanoutDedupeKeys,
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: lineRecipient.lineUserId,
              text,
              message: buildShiftConfirmationLineFlexMessage(lineParams),
              suppressDelivery,
              ...(fallbackEmail ? { fallbackEmail } : {}),
            }),
          });
          await healConfirmationSnapshotForDedupedOutbox(ctx, recruitmentId, staffData, result);
          continue;
        }

        const result = await enqueueConfirmationEmail({
          ctx,
          ...notificationOrigin,
          staffData,
          data,
          recruitmentId,
          magicLinkUrl,
          isResend: operationIsResend,
          suppressDelivery,
          dedupeAcrossTerminal: true,
          fanoutTargetKey,
          fanoutOperationId: operationId,
          fanoutLeaseToken: batch.leaseToken,
          legacyFanoutDedupeKeys,
          dedupeKey: emailDedupeKey,
        });
        await healConfirmationSnapshotForDedupedOutbox(ctx, recruitmentId, staffData, result);
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
    await completeBatch();
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
    snapshotAssignments: ConfirmationSnapshotAssignment[];
    snapshotSignature: string;
  };
  data: { shopId: Id<"shops">; shopName: string; periodLabel: string };
  recruitmentId: Id<"recruitments">;
  magicLinkUrl: string;
  isResend: boolean;
  suppressDelivery: boolean;
  organizationBillingVersionAtOrigin?: number;
  dedupeAcrossTerminal?: boolean;
  fanoutTargetKey?: string;
  fanoutOperationId?: Id<"notificationFanoutOperations">;
  fanoutLeaseToken?: string;
  legacyFanoutDedupeKeys?: readonly string[];
  dedupeKey?: string;
}): Promise<{
  dedupeKey: string;
  history: NotificationHistoryInput;
  payload: NotificationRenderedEmailPayload;
} | null> {
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

  const subject = isResend
    ? formatResendSubject(data.shopName, `${data.periodLabel} シフト変更のお知らせ`)
    : formatResendSubject(data.shopName, `${data.periodLabel} シフト確定のお知らせ`);

  return {
    dedupeKey:
      dedupeKey ?? `email:confirmation:${recruitmentId}:${staffData.staffId}:${isResend ? "resend" : "confirm"}`,
    history: {
      notificationKind: SHIFT_CONFIRMATION_NOTIFICATION_KIND,
      displayTitle: subject,
    },
    payload: emailPayload({
      from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
      to: staffData.email,
      subject,
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
    ...businessNotificationOriginFrom(opts),
    purpose: "business",
    recruitmentId: opts.recruitmentId,
    staffId: opts.staffData.staffId,
    history: email.history,
    ...(opts.dedupeAcrossTerminal ? { dedupeAcrossTerminal: true } : {}),
    ...(opts.fanoutTargetKey ? { fanoutTargetKey: opts.fanoutTargetKey } : {}),
    ...(opts.fanoutOperationId ? { fanoutOperationId: opts.fanoutOperationId } : {}),
    ...(opts.fanoutLeaseToken ? { fanoutLeaseToken: opts.fanoutLeaseToken } : {}),
    ...(opts.fanoutOperationId && opts.fanoutLeaseToken
      ? {
          confirmationSnapshot: {
            assignments: opts.staffData.snapshotAssignments,
            signature: opts.staffData.snapshotSignature,
          },
        }
      : {}),
    ...(opts.legacyFanoutDedupeKeys ? { legacyFanoutDedupeKeys: opts.legacyFanoutDedupeKeys } : {}),
    dedupeKey: email.dedupeKey,
    payload: email.payload,
  });
}

/** atomic snapshot導入前のOutboxだけが残る中断を、compat evidence gate経由で限定的に修復する。 */
async function healConfirmationSnapshotForDedupedOutbox(
  ctx: ActionCtx,
  recruitmentId: Id<"recruitments">,
  staffData: {
    staffId: Id<"staffs">;
    snapshotAssignments: ConfirmationSnapshotAssignment[];
    snapshotSignature: string;
  },
  enqueueResult: { deduped: boolean } | null,
) {
  if (!enqueueResult?.deduped) return;
  await ctx.runMutation(internal.notification.mutations.upsertConfirmationSnapshot, {
    recruitmentId,
    staffId: staffData.staffId,
    assignments: staffData.snapshotAssignments,
    signature: staffData.snapshotSignature,
    sentAt: Date.now(),
  });
}

/**
 * 再発行メールの配信
 * - 連携済みかつ友達追加中 → LINE Push
 * - 未連携 / 友達解除 / Quota超過 → メール
 */
export const sendReissueEmail = internalAction({
  args: {
    staffId: v.id("staffs"),
    recruitmentId: v.id("recruitments"),
    ...businessNotificationOriginArgs,
  },
  handler: async (ctx, { staffId, recruitmentId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const log = (level: "log" | "warn" | "error", event: string, extra: Record<string, unknown> = {}) =>
      console[level](`[sendReissueEmail] ${event}`, { staffId, recruitmentId, ...extra });

    const data = await ctx.runQuery(internal.notification.queries.getReissueEmailData, { staffId, recruitmentId });
    if (!data) return log("warn", "data_not_found");

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const lineRecipient = selectLineRecipient(data.lineRecipient, quota);
    log("log", "channel_selected", {
      channel: lineRecipient ? "line" : "email",
      hasLineUserId: Boolean(data.lineRecipient?.lineUserId),
      lineFollowing: Boolean(data.lineRecipient?.following),
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
    const reissueSubject = formatResendSubject(data.shopName, `${data.periodLabel} シフト閲覧リンク`);

    if (lineRecipient) {
      const lineParams = {
        staffName: data.staffName,
        shopName: data.shopName,
        periodLabel: data.periodLabel,
        magicLinkUrl,
      };
      const fallbackEmail = data.staffEmail
        ? {
            dedupeKey: `email:reissue:${recruitmentId}:${staffId}`,
            history: {
              notificationKind: SHIFT_REISSUE_NOTIFICATION_KIND,
              displayTitle: reissueSubject,
            },
            payload: emailPayload({
              from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
              to: data.staffEmail,
              subject: reissueSubject,
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
        ...notificationOrigin,
        ...lineRecipientOutboxSnapshot(lineRecipient),
        purpose: "business",
        staffId,
        history: {
          notificationKind: SHIFT_REISSUE_NOTIFICATION_KIND,
          displayTitle: "シフト閲覧リンク",
        },
        dedupeKey: `line:reissue:${recruitmentId}:${staffId}`,
        payload: linePayload({
          toUserId: lineRecipient.lineUserId,
          text: buildReissueLineText(lineParams),
          message: buildReissueLineFlexMessage(lineParams),
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
        ...notificationOrigin,
        purpose: "business",
        staffId,
        history: {
          notificationKind: SHIFT_REISSUE_NOTIFICATION_KIND,
          displayTitle: reissueSubject,
        },
        dedupeKey: `email:reissue:${recruitmentId}:${staffId}`,
        payload: emailPayload({
          from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
          to: data.staffEmail,
          subject: reissueSubject,
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
    } catch {
      log("error", "email_enqueue_failed");
    }
  },
});

/**
 * 募集開始通知の配信（LINE 振り分け対応）
 */
export const sendRecruitmentNotificationEmails = internalAction({
  args: {
    recruitmentId: v.id("recruitments"),
    // TODO[narrow]: 全deploymentの旧scheduled actionがdrainし、fanout/outbox readinessで
    //   operation link欠損が0件になった後にrequired化してensure fallbackを削除する。
    fanoutOperationId: v.optional(v.id("notificationFanoutOperations")),
    ...businessNotificationOriginArgs,
  },
  handler: async (ctx, { recruitmentId, fanoutOperationId, organizationBillingVersionAtOrigin }) => {
    const operationId =
      fanoutOperationId ??
      (await ctx.runMutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
        recruitmentId,
        ...(organizationBillingVersionAtOrigin === undefined ? {} : { organizationBillingVersionAtOrigin }),
      }));
    if (!operationId) return;
    const batch = await ctx.runMutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    if (batch.state !== "claimed") return;
    const completeBatch = () =>
      ctx.runMutation(internal.notification.mutations.completeNotificationFanoutBatch, {
        operationId,
        leaseToken: batch.leaseToken,
        expectedCursor: batch.cursor,
      });
    const notificationOrigin = businessNotificationOriginFrom({
      organizationBillingVersionAtOrigin: batch.organizationBillingVersionAtOrigin,
    });
    const data = await ctx.runQuery(internal.notification.queries.getRecruitmentEmailData, {
      recruitmentId,
      targetStaffIds: batch.targetStaffIds,
    });
    if (!data) {
      await completeBatch();
      return;
    }

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const expiresAt = getSubmitLinkCutoff(data.periodStart);

    for (const staff of data.staffEntries) {
      const lineRecipient = selectLineRecipient(staff.lineRecipient, quota);
      const selectedChannel = lineRecipient ? "line" : "email";
      const emailDedupeKey = `email:recruitment:${recruitmentId}:${staff.staffId}`;
      const lineDedupeKey = `line:recruitment:${recruitmentId}:${staff.staffId}`;
      const fanoutTargetKey = buildNotificationFanoutTargetKey(batch.operationKey, staff.staffId);
      const legacyFanoutDedupeKeys = [emailDedupeKey, lineDedupeKey];
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
            deadline: formatDeadlineLabel(data.deadline),
            magicLinkUrl,
          };
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
            ...notificationOrigin,
            ...lineRecipientOutboxSnapshot(lineRecipient),
            purpose: "business",
            recruitmentId,
            staffId: staff.staffId,
            history: {
              notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
              displayTitle: formatShiftPeriodHistoryTitle("シフト募集のお知らせ", data.periodLabel),
            },
            dedupeAcrossTerminal: true,
            fanoutTargetKey,
            fanoutOperationId: operationId,
            fanoutLeaseToken: batch.leaseToken,
            legacyFanoutDedupeKeys,
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: lineRecipient.lineUserId,
              text: buildRecruitmentLineText(lineParams),
              message: buildRecruitmentLineFlexMessage(lineParams),
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
            ...notificationOrigin,
            purpose: "business",
            recruitmentId,
            staffId: staff.staffId,
            history: email.history,
            dedupeAcrossTerminal: true,
            fanoutTargetKey,
            fanoutOperationId: operationId,
            fanoutLeaseToken: batch.leaseToken,
            legacyFanoutDedupeKeys,
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
    await completeBatch();
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
}): Promise<{
  dedupeKey: string;
  history: NotificationHistoryInput;
  payload: NotificationRenderedEmailPayload;
} | null> {
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

  const subject = formatResendSubject(shopName, buildRecruitmentEmailSubject(periodLabel));

  return {
    dedupeKey: dedupeKey ?? `email:recruitment:${recruitmentId}:${staff.staffId}`,
    history: {
      notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
      displayTitle: subject,
    },
    payload: emailPayload({
      from: formatResendFrom(shopName, RESEND_FROM_EMAIL),
      to: staff.email,
      subject,
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
 * 不達再通知: 1スタッフへ、対象のシフト募集通知だけを通常の LINE / メール振り分けで送る。
 */
export const sendRecruitmentNotificationForStaff = internalAction({
  args: {
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    notificationContext: v.string(),
    notificationRunId: v.optional(v.number()),
    ...businessNotificationOriginArgs,
  },
  handler: async (
    ctx,
    { recruitmentId, staffId, notificationContext, notificationRunId, organizationBillingVersionAtOrigin },
  ) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.notification.queries.getRecruitmentNotificationDataForStaff, {
      recruitmentId,
      staffId,
    });
    if (!data) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const lineRecipient = selectLineRecipient(data.staff.lineRecipient, quota);
    const selectedChannel = lineRecipient ? "line" : "email";
    const runId = notificationRunId ?? Date.now();
    const emailDedupeKey = `email:failureRetryRecruitment:${recruitmentId}:${staffId}:${runId}`;
    const lineDedupeKey = `line:failureRetryRecruitment:${recruitmentId}:${staffId}:${runId}`;
    const dedupeKey = selectedChannel === "line" ? lineDedupeKey : emailDedupeKey;
    if (selectedChannel === "email" && !data.staff.email) return;

    try {
      const { token } = await ctx.runMutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId: data.staff.staffId,
        shopId: data.shopId,
        recruitmentId,
        expiresAt: getSubmitLinkCutoff(data.recruitment.periodStart),
      });
      const magicLinkUrl = `${APP_URL}/shifts/submit?token=${token}`;

      if (lineRecipient) {
        const lineParams = {
          staffName: data.staff.name,
          shopName: data.shopName,
          periodLabel: data.recruitment.periodLabel,
          deadline: formatDeadlineLabel(data.recruitment.deadline),
          magicLinkUrl,
        };
        const fallbackEmail = data.staff.email
          ? await buildRecruitmentEmail({
              ctx,
              shopId: data.shopId,
              shopName: data.shopName,
              staff: data.staff,
              recruitmentId,
              periodLabel: data.recruitment.periodLabel,
              deadline: data.recruitment.deadline,
              magicLinkUrl,
              suppressDelivery,
              context: notificationContext,
              dedupeKey: emailDedupeKey,
            })
          : null;
        await enqueueLine(ctx, {
          shopId: data.shopId,
          ...notificationOrigin,
          ...lineRecipientOutboxSnapshot(lineRecipient),
          purpose: "business",
          recruitmentId,
          staffId: data.staff.staffId,
          history: {
            notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
            displayTitle: formatShiftPeriodHistoryTitle("シフト募集のお知らせ", data.recruitment.periodLabel),
          },
          dedupeKey: lineDedupeKey,
          payload: linePayload({
            toUserId: lineRecipient.lineUserId,
            text: buildRecruitmentLineText(lineParams),
            message: buildRecruitmentLineFlexMessage(lineParams),
            suppressDelivery,
            ...(fallbackEmail ? { fallbackEmail } : {}),
          }),
        });
        return;
      }

      const email = await buildRecruitmentEmail({
        ctx,
        shopId: data.shopId,
        shopName: data.shopName,
        staff: data.staff,
        recruitmentId,
        periodLabel: data.recruitment.periodLabel,
        deadline: data.recruitment.deadline,
        magicLinkUrl,
        suppressDelivery,
        context: notificationContext,
        dedupeKey: emailDedupeKey,
      });
      if (!email) return;
      await enqueueEmail(ctx, {
        shopId: data.shopId,
        ...notificationOrigin,
        purpose: "business",
        recruitmentId,
        staffId: data.staff.staffId,
        history: email.history,
        dedupeKey: email.dedupeKey,
        payload: email.payload,
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
          notificationContext,
        },
        e,
        "Failure retry recruitment notification preparation failed",
      );
    }
  },
});

/**
 * スタッフ追加時: 追加された1スタッフへ、現在募集中の希望シフト提出リンクをメールで送る。
 */
export const sendOpenRecruitmentNotificationEmailsForStaff = internalAction({
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, { staffId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
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
          ...notificationOrigin,
          purpose: "business",
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          history: email.history,
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
 * メール変更時: 変更後メールアドレスへ、現在募集中の希望シフト提出リンクを送る。
 */
export const sendOpenRecruitmentNotificationEmailsForStaffEmailChange = internalAction({
  args: {
    staffId: v.id("staffs"),
    expectedEmailNormalized: v.string(),
    emailChangedAt: v.number(),
    ...businessNotificationOriginArgs,
  },
  handler: async (ctx, { staffId, expectedEmailNormalized, emailChangedAt, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(
      internal.notification.queries.getOpenRecruitmentEmailChangeNotificationDataForStaff,
      {
        staffId,
        expectedEmailNormalized,
      },
    );
    if (!data || data.recruitments.length === 0 || !data.staff.email) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    if (selectLineRecipient(data.staff.lineRecipient, quota)) return;

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
          ...notificationOrigin,
          purpose: "business",
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          history: email.history,
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
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, { staffId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
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
      const lineRecipient = selectLineRecipient(data.staff.lineRecipient, quota);
      const selectedChannel = lineRecipient ? "line" : "email";
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

        if (lineRecipient) {
          const lineParams = {
            staffName: data.staff.name,
            shopName: data.shopName,
            periodLabel: recruitment.periodLabel,
            deadline: formatDeadlineLabel(recruitment.deadline),
            magicLinkUrl,
          };
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
            ...notificationOrigin,
            ...lineRecipientOutboxSnapshot(lineRecipient),
            purpose: "business",
            recruitmentId: recruitment.recruitmentId,
            staffId: data.staff.staffId,
            history: {
              notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
              displayTitle: formatShiftPeriodHistoryTitle("シフト募集のお知らせ", recruitment.periodLabel),
            },
            dedupeKey: lineDedupeKey,
            payload: linePayload({
              toUserId: lineRecipient.lineUserId,
              text: buildRecruitmentLineText(lineParams),
              message: buildRecruitmentLineFlexMessage(lineParams),
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
          ...notificationOrigin,
          purpose: "business",
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          history: email.history,
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
 * LINE連携・follow時: 1スタッフへ、現在募集中の希望シフト提出リンクをLINEで送る。
 */
export const sendOpenRecruitmentNotificationLinesForStaff = internalAction({
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, { staffId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
      staffId,
    });
    if (!data || data.recruitments.length === 0 || !data.staff.lineRecipient) return;

    const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );
    const lineRecipient = selectLineRecipient(data.staff.lineRecipient, quota);
    // follow直後でも quota exceeded が分かっている場合は送らない。
    // メール経路はスタッフ追加時・募集作成時に別途担保される。
    if (!lineRecipient) return;

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
        const lineParams = {
          staffName: data.staff.name,
          shopName: data.shopName,
          periodLabel: recruitment.periodLabel,
          deadline: formatDeadlineLabel(recruitment.deadline),
          magicLinkUrl,
        };
        await enqueueLine(ctx, {
          shopId: data.shopId,
          ...notificationOrigin,
          ...lineRecipientOutboxSnapshot(lineRecipient),
          purpose: "business",
          recruitmentId: recruitment.recruitmentId,
          staffId: data.staff.staffId,
          history: {
            notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
            displayTitle: formatShiftPeriodHistoryTitle("シフト募集のお知らせ", recruitment.periodLabel),
          },
          dedupeKey,
          payload: linePayload({
            toUserId: lineRecipient.lineUserId,
            text: buildRecruitmentLineText(lineParams),
            message: buildRecruitmentLineFlexMessage(lineParams),
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
 * 旧deploymentから予約済みのaction名と引数を維持するcompatibility wrapper。
 * 送信処理は新しいbounded durable fanoutへ委譲し、ここでは認可・quotaを再消費しない。
 * TODO[narrow]: 全deploymentでこの旧functionを参照するpending/in-progress schedulerが0件になり、
 * 旧deploymentのdrain期間が終わった後に削除する。
 */
export const sendCurrentShiftConfirmationForStaff = internalAction({
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.staff.mutations.prepareLegacyCurrentShiftConfirmationFanout, args);
  },
});
