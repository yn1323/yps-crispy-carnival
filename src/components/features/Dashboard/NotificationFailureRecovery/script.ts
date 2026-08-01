import type { Id } from "@/convex/_generated/dataModel";

const MAX_RESEND_ALL_FAILURE_BATCHES = 20;

export type ResendOpenNotificationFailuresBatchResult = {
  scheduledFailureIds: Id<"notificationFailureInbox">[];
  hasMore: boolean;
};

export type ResendAllOpenNotificationFailuresResult = {
  scheduledFailureIds: Id<"notificationFailureInbox">[];
  hasRemainingFailures: boolean;
};

export async function resendAllOpenNotificationFailuresBatches(
  resendBatch: () => Promise<ResendOpenNotificationFailuresBatchResult>,
): Promise<ResendAllOpenNotificationFailuresResult> {
  const scheduledFailureIds: Id<"notificationFailureInbox">[] = [];

  for (let batchIndex = 0; batchIndex < MAX_RESEND_ALL_FAILURE_BATCHES; batchIndex++) {
    const result = await resendBatch();
    scheduledFailureIds.push(...result.scheduledFailureIds);

    if (!result.hasMore) {
      return { scheduledFailureIds, hasRemainingFailures: false };
    }

    // 進捗がないまま続けると、rate limit等で同じopen行を繰り返し処理してしまう。
    if (result.scheduledFailureIds.length === 0) {
      return { scheduledFailureIds, hasRemainingFailures: true };
    }
  }

  return { scheduledFailureIds, hasRemainingFailures: true };
}
