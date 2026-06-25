"use node";

import { createHash } from "node:crypto";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { isDebugNotifyFailEnabled } from "../_lib/config";
import { LineApiError, pushTextMessage } from "../_lib/lineClient";
import { getResendClient, ResendEmailError, sendResendEmail } from "../_lib/resend";
import {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  NOTIFICATION_OUTBOX_RETRY_BASE_MS,
  NOTIFICATION_OUTBOX_RETRY_MAX_MS,
  NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE,
} from "../constants";

type NotificationJob = Doc<"notificationOutbox">;
const LINE_QUOTA_FALLBACK_ENQUEUED_MESSAGE = "LINE quota exceeded; fallback email enqueued";

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

    for (const job of jobs) {
      try {
        await sendJob(ctx, job);
        await ctx.runMutation(internal.notificationOutbox.mutations.markSent, { outboxId: job._id });
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

async function sendJob(ctx: ActionCtx, job: NotificationJob) {
  if (job.payload.kind === "email") {
    const resend = getResendClient({ suppressDelivery: job.payload.suppressDelivery });
    await sendResendEmail(
      resend,
      {
        from: job.payload.from,
        to: job.payload.to,
        subject: job.payload.subject,
        html: job.payload.html,
      },
      job.payload.context,
      { idempotencyKey: `notification-outbox-${job._id}` },
    );
    return;
  }

  if (isDebugNotifyFailEnabled()) {
    await pushTextMessage(job.payload.toUserId, job.payload.text, {
      suppressDelivery: job.payload.suppressDelivery,
      retryKey: lineRetryKey(job._id),
    });
    return;
  }

  const quota = await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {});
  if (quota?.status === "exceeded") {
    if (job.payload.fallbackEmail) {
      try {
        await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
          channel: "email",
          shopId: job.shopId,
          ...(job.staffId ? { staffId: job.staffId } : {}),
          ...(job.userId ? { userId: job.userId } : {}),
          dedupeKey: job.payload.fallbackEmail.dedupeKey,
          payload: job.payload.fallbackEmail.payload,
        });
      } catch (e) {
        try {
          await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
            eventType: "enqueue_failed",
            shopId: job.shopId,
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
          shopId: job.shopId,
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

  await pushTextMessage(job.payload.toUserId, job.payload.text, {
    suppressDelivery: job.payload.suppressDelivery,
    retryKey: lineRetryKey(job._id),
  });
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
