import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import {
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
} from "../constants";
import { NOTIFICATION_OUTBOX_TERMINAL_STATUSES as TERMINAL_STATUSES } from "./schemas";

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
    const terminalProbes = await Promise.all(
      TERMINAL_STATUSES.map(
        async (status) => [status, await probeTerminalStatus(ctx, status, terminalCutoff)] as const,
      ),
    );
    const expiredFailure = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_sensitiveDataRedactedAt_lastFailedAt", (q) =>
        q.eq("sensitiveDataRedactedAt", undefined).lte("lastFailedAt", failureCutoff),
      )
      .first();
    const terminalWithoutTerminalAt = Object.fromEntries(
      terminalProbes.map(([status, result]) => [status, result.terminalWithoutTerminalAt]),
    ) as Record<TerminalStatus, number>;
    const expiredTerminalWithoutRedaction = Object.fromEntries(
      terminalProbes.map(([status, result]) => [status, result.expiredTerminalWithoutRedaction]),
    ) as Record<TerminalStatus, number>;
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
