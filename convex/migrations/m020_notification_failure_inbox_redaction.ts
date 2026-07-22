import { NOTIFICATION_FAILURE_INBOX_RETENTION_MS } from "../constants";
import { migrations } from "./index";

const ACTIVE_FAILURE_STATUSES = new Set(["open", "retrying"]);

export const migration = migrations.define({
  table: "notificationFailureInbox",
  migrateOne: async (ctx, failure) => {
    if (
      failure.sensitiveDataRedactedAt !== undefined ||
      failure.lastFailedAt > Date.now() - NOTIFICATION_FAILURE_INBOX_RETENTION_MS
    ) {
      return;
    }

    const now = Date.now();
    const shouldExpire = ACTIVE_FAILURE_STATUSES.has(failure.status);
    await ctx.db.patch(failure._id, {
      ...(shouldExpire
        ? {
            status: "resolved" as const,
            resolvedAt: now,
            resolvedByUserId: undefined,
            resolutionKind: "expired" as const,
          }
        : {}),
      lastError: undefined,
      errorName: undefined,
      lastEventId: undefined,
      sensitiveDataRedactedAt: now,
      updatedAt: now,
    });
  },
});
