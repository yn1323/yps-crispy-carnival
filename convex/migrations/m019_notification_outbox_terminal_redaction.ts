import type { Doc } from "../_generated/dataModel";
import { NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS } from "../constants";
import {
  notificationContextForPayload,
  notificationDeliverySuppressedForPayload,
  redactNotificationPayload,
} from "../notificationOutbox/redaction";
import type { NotificationPayload } from "../notificationOutbox/types";
import { migrations } from "./index";

type OutboxRedactionPatch = {
  notificationContext?: string;
  deliverySuppressed?: boolean;
  terminalAt?: number;
  payload?: NotificationPayload;
  lastError?: undefined;
  payloadRedactedAt?: number;
  updatedAt: number;
};

export const migration = migrations.define({
  table: "notificationOutbox",
  migrateOne: async (ctx, job) => {
    const now = Date.now();
    const notificationContext = job.notificationContext ?? notificationContextForPayload(job.payload, job.dedupeKey);
    const deliverySuppressed = job.deliverySuppressed ?? notificationDeliverySuppressedForPayload(job.payload);
    const terminalAt = terminalTimestamp(job);
    const shouldRedact =
      terminalAt !== undefined &&
      job.payloadRedactedAt === undefined &&
      terminalAt <= now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS;

    const patch: OutboxRedactionPatch = { updatedAt: now };
    let changed = false;
    if (job.notificationContext === undefined) {
      patch.notificationContext = notificationContext;
      changed = true;
    }
    if (job.deliverySuppressed === undefined) {
      patch.deliverySuppressed = deliverySuppressed;
      changed = true;
    }
    if (terminalAt !== undefined && job.terminalAt === undefined) {
      patch.terminalAt = terminalAt;
      changed = true;
    }
    if (shouldRedact) {
      patch.payload = redactNotificationPayload(job.payload, notificationContext);
      patch.lastError = undefined;
      patch.payloadRedactedAt = now;
      changed = true;
    }

    if (changed) await ctx.db.patch(job._id, patch);
  },
});

function terminalTimestamp(job: Doc<"notificationOutbox">): number | undefined {
  if (job.status === "sent") return job.terminalAt ?? job.sentAt ?? job.updatedAt;
  if (job.status === "failed") return job.terminalAt ?? job.failedAt ?? job.updatedAt;
  if (job.status === "cancelled") return job.terminalAt ?? job.cancelledAt ?? job.updatedAt;
  return undefined;
}
