import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import {
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
} from "../constants";

const TERMINAL_STATUSES = ["sent", "failed", "cancelled"] as const;

type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

async function probeTerminalStatus(ctx: QueryCtx, status: TerminalStatus, cutoff: number) {
  const terminalWithoutTerminalAt = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_status_payloadRedactedAt_terminalAt", (q) =>
      q.eq("status", status).eq("payloadRedactedAt", undefined).eq("terminalAt", undefined),
    )
    .first();
  const expiredTerminalWithoutRedaction = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_status_payloadRedactedAt_terminalAt", (q) =>
      q.eq("status", status).eq("payloadRedactedAt", undefined).gte("terminalAt", 0).lte("terminalAt", cutoff),
    )
    .first();

  return {
    terminalWithoutTerminalAt: terminalWithoutTerminalAt ? 1 : 0,
    expiredTerminalWithoutRedaction: expiredTerminalWithoutRedaction ? 1 : 0,
  };
}

/**
 * PIIやrow IDを返さず、narrow前に必要なretention残件だけをbounded index queryで確認する。
 * shape backfillの完了はmigration componentのlib:getStatusを別途正とする。
 */
export const getRedactionReadiness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const checkedAt = Date.now();
    const terminalCutoff = checkedAt - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS;
    const failureCutoff = checkedAt - NOTIFICATION_FAILURE_INBOX_RETENTION_MS;
    const sent = await probeTerminalStatus(ctx, "sent", terminalCutoff);
    const failed = await probeTerminalStatus(ctx, "failed", terminalCutoff);
    const cancelled = await probeTerminalStatus(ctx, "cancelled", terminalCutoff);
    const expiredFailure = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_sensitiveDataRedactedAt_lastFailedAt", (q) =>
        q.eq("sensitiveDataRedactedAt", undefined).lte("lastFailedAt", failureCutoff),
      )
      .first();
    const terminalWithoutTerminalAt = {
      sent: sent.terminalWithoutTerminalAt,
      failed: failed.terminalWithoutTerminalAt,
      cancelled: cancelled.terminalWithoutTerminalAt,
    };
    const expiredTerminalWithoutRedaction = {
      sent: sent.expiredTerminalWithoutRedaction,
      failed: failed.expiredTerminalWithoutRedaction,
      cancelled: cancelled.expiredTerminalWithoutRedaction,
    };
    const expiredFailureWithoutRedaction = expiredFailure ? 1 : 0;
    const ready =
      Object.values(terminalWithoutTerminalAt).every((count) => count === 0) &&
      Object.values(expiredTerminalWithoutRedaction).every((count) => count === 0) &&
      expiredFailureWithoutRedaction === 0;

    return {
      checkedAt,
      ready,
      terminalWithoutTerminalAt,
      expiredTerminalWithoutRedaction,
      expiredFailureWithoutRedaction,
    };
  },
});
