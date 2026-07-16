"use node";

import { createHash } from "node:crypto";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { getAppUrl, getOrganizationInvitationSigningSecret, isDebugNotifyFailEnabled } from "../_lib/config";
import { formatResendSubject } from "../_lib/emailFormat";
import { LineApiError, pushLineMessage } from "../_lib/lineClient";
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

type NotificationJob = Doc<"notificationOutbox">;
const LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE = "LINE quota exceeded; fallback email enqueued";
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
          now: Date.now(),
        });
        if (!preparedJob) continue;
        job = preparedJob;

        const result = await sendJob(ctx, job);
        if (result.cancelled) continue;
        await ctx.runMutation(internal.notificationOutbox.mutations.markSent, {
          outboxId: job._id,
          ...(result.resendEmailId ? { resendEmailId: result.resendEmailId } : {}),
        });
      } catch (e) {
        const lastError = errorMessage(e);
        if (shouldRetry(job, e)) {
          await ctx.runMutation(internal.notificationOutbox.mutations.markRetry, {
            outboxId: job._id,
            lastError,
            nextRunAt: Date.now() + retryDelayMs(job.attemptCount, e),
            ...(errorName(e) ? { errorName: errorName(e) } : {}),
          });
        } else {
          const suppressFailureInbox = lastError === LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE;
          await ctx.runMutation(internal.notificationOutbox.mutations.markFailed, {
            outboxId: job._id,
            lastError,
            ...(suppressFailureInbox ? { suppressFailureInbox: true } : {}),
            ...(errorName(e) ? { errorName: errorName(e) } : {}),
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
      { outboxId: job._id, now: Date.now() },
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

  if (isDebugNotifyFailEnabled()) {
    await pushLineMessage(job.payload.toUserId, lineMessageFromPayload(job.payload), {
      suppressDelivery: job.payload.suppressDelivery,
      retryKey: lineRetryKey(job._id),
    });
    return {};
  }

  const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
  if (quota?.status === "exceeded") {
    if (job.payload.fallbackEmail) {
      try {
        await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
          channel: "email",
          ...(job.shopId ? { shopId: job.shopId } : {}),
          ...(job.organizationId ? { organizationId: job.organizationId } : {}),
          ...(job.organizationBillingVersionAtEnqueue !== undefined
            ? { organizationBillingVersionAtOrigin: job.organizationBillingVersionAtEnqueue }
            : {}),
          ...(job.purpose ? { purpose: job.purpose } : {}),
          ...(job.staffId ? { staffId: job.staffId } : {}),
          ...(job.userId ? { userId: job.userId } : {}),
          dedupeKey: job.payload.fallbackEmail.dedupeKey,
          payload: job.payload.fallbackEmail.payload,
        });
      } catch (e) {
        try {
          await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
            eventType: "enqueue_failed",
            ...(job.shopId ? { shopId: job.shopId } : {}),
            ...(job.staffId ? { staffId: job.staffId } : {}),
            ...(job.userId ? { userId: job.userId } : {}),
            outboxId: job._id,
            channel: "email",
            dedupeKey: job.payload.fallbackEmail.dedupeKey,
            notificationContext: job.payload.fallbackEmail.payload.context,
            attemptCount: job.attemptCount,
            errorMessage: errorMessage(e),
            ...(errorName(e) ? { errorName: errorName(e) } : {}),
          });
        } catch (logError) {
          console.error("Notification fallback enqueue failure logging failed", logError);
        }
        throw e;
      }

      try {
        await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
          eventType: "fallback_enqueued",
          ...(job.shopId ? { shopId: job.shopId } : {}),
          ...(job.staffId ? { staffId: job.staffId } : {}),
          ...(job.userId ? { userId: job.userId } : {}),
          outboxId: job._id,
          channel: job.channel,
          dedupeKey: job.dedupeKey,
          notificationContext: job.payload.fallbackEmail.payload.context,
          attemptCount: job.attemptCount,
          errorMessage: LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE,
        });
      } catch (logError) {
        console.error("Notification fallback event logging failed", logError);
      }
      throw new Error(LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE);
    }
    throw new Error("LINE quota exceeded");
  }

  await pushLineMessage(job.payload.toUserId, lineMessageFromPayload(job.payload), {
    suppressDelivery: job.payload.suppressDelivery,
    retryKey: lineRetryKey(job._id),
  });
  return {};
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
  if (e instanceof LineApiError) return e.status === 429 || e.status >= 500;
  if (e instanceof ResendEmailError) return e.retryable;

  const message = errorMessage(e);
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

function errorName(e: unknown) {
  return e instanceof Error ? e.name : undefined;
}

async function recordWorkerFailure(ctx: ActionCtx, e: unknown) {
  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "worker_failed",
      errorMessage: errorMessage(e),
      ...(errorName(e) ? { errorName: errorName(e) } : {}),
    });
  } catch (logError) {
    console.error("Notification outbox worker failure logging failed", logError);
  }
}
