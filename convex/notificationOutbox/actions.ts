"use node";

import { createHash } from "node:crypto";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { getAppUrl, getOrganizationInvitationSigningSecret, isDebugNotifyFailEnabled } from "../_lib/config";
import { formatResendSubject } from "../_lib/emailFormat";
import { LineApiError, pushLineMessage } from "../_lib/lineClient";
import { withOpenExternalBrowser } from "../_lib/lineUrl";
import { isNotificationDeliverySuppressed } from "../_lib/notificationDelivery";
import { getResendClient, ResendEmailError, sendResendEmail } from "../_lib/resend";
import {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  NOTIFICATION_OUTBOX_RETRY_BASE_MS,
  NOTIFICATION_OUTBOX_RETRY_MAX_MS,
  NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE,
} from "../constants";
import {
  buildOrganizationManagerInvitationEmailHtml,
  type LinePushMessage,
  ORGANIZATION_MANAGER_INVITATION_SUBJECT,
} from "../notification/templates";
import { deriveInvitationToken } from "../organizationInvitation/token";
import { safeNotificationError } from "./safeError";

type NotificationJob = Doc<"notificationOutbox">;
const LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE = "LINE quota exceeded; fallback email enqueued";
type LineFallbackEmail = NonNullable<
  Extract<NotificationJob["payload"], { kind: "line" | "organizationManagerInvitationLine" }>["fallbackEmail"]
>;
class LinePushDeliveryError extends Error {
  constructor(readonly deliveryCause: unknown) {
    super(safeNotificationError(deliveryCause).code);
    this.name = "LinePushDeliveryError";
  }
}
type SendJobResult = {
  resendEmailId?: string;
  cancelled?: true;
};

export const processPending = internalAction({
  args: {},
  handler: async (ctx) => {
    let jobs: NotificationJob[];
    try {
      jobs = await ctx.runMutation(internal.notificationOutbox.mutations.claimDue, {
        now: Date.now(),
      });
    } catch (e) {
      await recordWorkerFailure(ctx, e);
      return;
    }

    for (const claimedJob of jobs) {
      let job = claimedJob;
      try {
        const preparedJob = await ctx.runMutation(internal.notificationOutbox.mutations.prepareForDelivery, {
          outboxId: claimedJob._id,
          leaseToken: claimedJob.leaseToken,
          now: Date.now(),
        });
        if (!preparedJob) continue;
        job = preparedJob;

        const result = await sendJob(ctx, job);
        if (result.cancelled) continue;
        await ctx.runMutation(internal.notificationOutbox.mutations.markSent, {
          outboxId: job._id,
          leaseToken: job.leaseToken,
          ...(result.resendEmailId ? { resendEmailId: result.resendEmailId } : {}),
        });
      } catch (e) {
        const lastError = safeNotificationError(e).code;
        if (shouldRetry(job, e)) {
          await ctx.runMutation(internal.notificationOutbox.mutations.markRetry, {
            outboxId: job._id,
            leaseToken: job.leaseToken,
            lastError,
            nextRunAt: Date.now() + retryDelayMs(job.attemptCount, e),
          });
        } else {
          let suppressFailureInbox = lastError === "line_quota_fallback_enqueued";
          if (
            !suppressFailureInbox &&
            e instanceof LinePushDeliveryError &&
            job.payload.kind === "organizationManagerInvitationLine" &&
            job.payload.fallbackEmail
          ) {
            try {
              await enqueueLineFallback(ctx, job, job.payload.fallbackEmail, lastError);
              suppressFailureInbox = true;
            } catch {
              // enqueueLineFallback が enqueue_failed を記録する。元のLINE失敗は通常の最終失敗として残す。
            }
          }
          await ctx.runMutation(internal.notificationOutbox.mutations.markFailed, {
            outboxId: job._id,
            leaseToken: job.leaseToken,
            lastError,
            ...(suppressFailureInbox ? { suppressFailureInbox: true } : {}),
          });
        }
      }
    }

    if (jobs.length === NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.actions.processPending, {});
    }
  },
});

async function sendJob(ctx: ActionCtx, job: NotificationJob): Promise<SendJobResult> {
  if (job.payload.kind === "email") {
    return await sendEmailJob(job, {
      from: job.payload.from,
      to: job.payload.to,
      subject: job.payload.subject,
      html: job.payload.html,
      context: job.payload.context,
      suppressDelivery: job.payload.suppressDelivery,
    });
  }

  if (job.payload.kind === "organizationManagerInvitationEmail") {
    const invitation = await ctx.runMutation(
      internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail,
      { outboxId: job._id, leaseToken: job.leaseToken, now: Date.now() },
    );
    if (!invitation) return { cancelled: true };

    const token = await deriveInvitationToken({
      invitationId: invitation.invitationId,
      version: invitation.invitationVersion,
      signingSecret: getOrganizationInvitationSigningSecret(),
    });
    const invitationUrl = new URL("/manager-invite", getAppUrl());
    invitationUrl.searchParams.set("token", token);

    return await sendEmailJob(job, {
      from: job.payload.from,
      to: job.payload.to,
      subject: formatResendSubject(invitation.organizationName, ORGANIZATION_MANAGER_INVITATION_SUBJECT),
      html: buildOrganizationManagerInvitationEmailHtml({
        organizationName: invitation.organizationName,
        inviterName: invitation.inviterName,
        invitationUrl: invitationUrl.toString(),
      }),
      context: job.payload.context,
      suppressDelivery: job.payload.suppressDelivery,
    });
  }

  if (job.payload.kind === "organizationManagerInvitationLine") {
    const invitation = await ctx.runMutation(
      internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail,
      { outboxId: job._id, leaseToken: job.leaseToken, now: Date.now() },
    );
    if (!invitation) return { cancelled: true };

    const token = await deriveInvitationToken({
      invitationId: invitation.invitationId,
      version: invitation.invitationVersion,
      signingSecret: getOrganizationInvitationSigningSecret(),
    });
    const invitationUrl = new URL("/manager-invite", getAppUrl());
    invitationUrl.searchParams.set("token", token);
    const externalBrowserUrl = withOpenExternalBrowser(invitationUrl.toString());
    return await sendLineJob(ctx, job, {
      toUserId: job.payload.toUserId,
      suppressDelivery: job.payload.suppressDelivery,
      fallbackEmail: job.payload.fallbackEmail,
      message: {
        type: "text",
        text: `${invitation.organizationName}の管理者として招待されました。\nログインしてアカウント連携を完了してください。\n${externalBrowserUrl}`,
      },
    });
  }

  return await sendLineJob(ctx, job, {
    toUserId: job.payload.toUserId,
    suppressDelivery: job.payload.suppressDelivery,
    fallbackEmail: job.payload.fallbackEmail,
    message: lineMessageFromPayload(job.payload),
  });
}

async function sendLineJob(
  ctx: ActionCtx,
  job: NotificationJob,
  input: {
    toUserId: string;
    suppressDelivery?: boolean;
    fallbackEmail?: Extract<
      NotificationJob["payload"],
      { kind: "line" | "organizationManagerInvitationLine" }
    >["fallbackEmail"];
    message: LinePushMessage;
  },
): Promise<SendJobResult> {
  if (isDebugNotifyFailEnabled()) {
    await pushLineJob(input.toUserId, input.message, {
      suppressDelivery: input.suppressDelivery,
      retryKey: lineRetryKey(job._id),
    });
    return {};
  }

  const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
  if (quota?.status === "exceeded") {
    if (input.fallbackEmail) {
      await enqueueLineFallback(ctx, job, input.fallbackEmail, LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE);
      throw new Error(LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE);
    }
    throw new Error("LINE quota exceeded");
  }

  await pushLineJob(input.toUserId, input.message, {
    suppressDelivery: input.suppressDelivery,
    retryKey: lineRetryKey(job._id),
  });
  return {};
}

async function pushLineJob(
  toUserId: string,
  message: LinePushMessage,
  options: { suppressDelivery?: boolean; retryKey: string },
) {
  try {
    await pushLineMessage(toUserId, message, options);
  } catch (e) {
    // push開始前後の他処理と区別し、実際のLINE送信例外だけをfallback対象にする。
    throw new LinePushDeliveryError(e);
  }
}

async function enqueueLineFallback(
  ctx: ActionCtx,
  job: NotificationJob,
  fallbackEmail: LineFallbackEmail,
  fallbackReason: string,
) {
  try {
    if (fallbackEmail.history && !job.staffId) {
      throw new Error("LINE fallback history requires a staff recipient");
    }
    const enqueueResult = await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      ...(job.shopId ? { shopId: job.shopId } : {}),
      ...(job.organizationId ? { organizationId: job.organizationId } : {}),
      ...(job.organizationInvitationId ? { organizationInvitationId: job.organizationInvitationId } : {}),
      ...(job.organizationInvitationVersion !== undefined
        ? { organizationInvitationVersion: job.organizationInvitationVersion }
        : {}),
      ...(job.organizationBillingVersionAtEnqueue !== undefined
        ? { organizationBillingVersionAtOrigin: job.organizationBillingVersionAtEnqueue }
        : {}),
      ...(job.purpose ? { purpose: job.purpose } : {}),
      ...(job.recruitmentId ? { recruitmentId: job.recruitmentId } : {}),
      ...(job.staffId ? { staffId: job.staffId } : {}),
      ...(job.fanoutOperationId ? { fanoutOperationId: job.fanoutOperationId } : {}),
      ...(job.staffId && fallbackEmail.history ? { history: fallbackEmail.history } : {}),
      ...(job.staffId && !fallbackEmail.history ? { historyMode: "legacy_no_history" as const } : {}),
      ...(job.userId ? { userId: job.userId } : {}),
      dedupeKey: fallbackEmail.dedupeKey,
      payload: fallbackEmail.payload,
    });
    if (!enqueueResult) throw new Error("LINE fallback email was not enqueued");
  } catch (e) {
    const safeError = safeNotificationError(e, "notification_enqueue_failed");
    try {
      await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
        eventType: "enqueue_failed",
        ...(job.shopId ? { shopId: job.shopId } : {}),
        ...(job.organizationId ? { organizationId: job.organizationId } : {}),
        ...(job.organizationInvitationId ? { organizationInvitationId: job.organizationInvitationId } : {}),
        ...(job.organizationInvitationVersion !== undefined
          ? { organizationInvitationVersion: job.organizationInvitationVersion }
          : {}),
        ...(job.staffId ? { staffId: job.staffId } : {}),
        ...(job.userId ? { userId: job.userId } : {}),
        outboxId: job._id,
        channel: "email",
        dedupeKey: fallbackEmail.dedupeKey,
        notificationContext: fallbackEmail.payload.context,
        attemptCount: job.attemptCount,
        errorMessage: safeError.code,
      });
    } catch {
      console.error("Notification fallback enqueue failure logging failed", {
        errorCode: "notification_worker_failed",
      });
    }
    throw e;
  }

  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "fallback_enqueued",
      ...(job.shopId ? { shopId: job.shopId } : {}),
      ...(job.organizationId ? { organizationId: job.organizationId } : {}),
      ...(job.organizationInvitationId ? { organizationInvitationId: job.organizationInvitationId } : {}),
      ...(job.organizationInvitationVersion !== undefined
        ? { organizationInvitationVersion: job.organizationInvitationVersion }
        : {}),
      ...(job.staffId ? { staffId: job.staffId } : {}),
      ...(job.userId ? { userId: job.userId } : {}),
      outboxId: job._id,
      channel: job.channel,
      dedupeKey: job.dedupeKey,
      notificationContext: fallbackEmail.payload.context,
      attemptCount: job.attemptCount,
      errorMessage: safeNotificationError(fallbackReason).code,
    });
  } catch {
    console.error("Notification fallback event logging failed", { errorCode: "notification_worker_failed" });
  }
}

async function sendEmailJob(
  job: NotificationJob,
  input: {
    from: string;
    to: string;
    subject: string;
    html: string;
    context: string;
    suppressDelivery?: boolean;
  },
): Promise<SendJobResult> {
  const resend = getResendClient({ suppressDelivery: input.suppressDelivery });
  const resendEmailId = await sendResendEmail(
    resend,
    {
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      tags: [{ name: "shiftori_outbox_id", value: job._id }],
    },
    input.context,
    { idempotencyKey: `notification-outbox-${job._id}` },
  );
  if (isNotificationDeliverySuppressed({ suppressDelivery: input.suppressDelivery })) return {};
  return { resendEmailId };
}

function lineMessageFromPayload(payload: Extract<NotificationJob["payload"], { kind: "line" }>): LinePushMessage {
  return payload.message ?? { type: "text", text: payload.text };
}

function shouldRetry(job: NotificationJob, e: unknown) {
  if (job.attemptCount >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS) return false;
  const retryCause = e instanceof LinePushDeliveryError ? e.deliveryCause : e;
  if (retryCause instanceof LineApiError) return retryCause.status === 429 || retryCause.status >= 500;
  if (e instanceof ResendEmailError) return e.retryable;

  const message = errorMessage(retryCause);
  return (
    message.includes("rate_limit_exceeded") ||
    message.includes("application_error") ||
    message.includes("timed out") ||
    message.includes("fetch failed")
  );
}

function retryDelayMs(attemptCount: number, e: unknown) {
  if (e instanceof ResendEmailError && e.retryAfterMs !== null) {
    return Math.min(e.retryAfterMs, NOTIFICATION_OUTBOX_RETRY_MAX_MS);
  }

  return Math.min(
    NOTIFICATION_OUTBOX_RETRY_BASE_MS * 2 ** Math.max(attemptCount - 1, 0),
    NOTIFICATION_OUTBOX_RETRY_MAX_MS,
  );
}

function lineRetryKey(id: string) {
  const hex = createHash("sha256").update(id).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function recordWorkerFailure(ctx: ActionCtx, e: unknown) {
  const safeError = safeNotificationError(e, "notification_worker_failed");
  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "worker_failed",
      errorMessage: safeError.code,
    });
  } catch {
    console.error("Notification outbox worker failure logging failed", { errorCode: "notification_worker_failed" });
  }
}
