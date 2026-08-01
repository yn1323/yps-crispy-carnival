import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
} from "../constants";

describe("notificationOutbox redaction readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("PIIやIDを返さず、migration欠落と期限切れ未redactをbounded probeで検出する", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const expiredTerminalAt = now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS - 1;
    const expiredFailureAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS - 1;
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "notification_redaction_readiness",
        email: "manager@example.com",
        shopName: "通知redaction readiness店舗",
      });
      const payload = {
        kind: "email" as const,
        from: "sender@example.com",
        to: "secret-recipient@example.com",
        subject: "secret subject",
        html: "<p>secret body</p>",
        context: "test.email",
      };
      const sentWithoutTerminalAtId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "sent",
        dedupeKey: "email:readiness:sent-missing-terminal",
        shopId,
        notificationContext: "test.email",
        deliverySuppressed: false,
        payload,
        attemptCount: 1,
        nextRunAt: expiredTerminalAt,
        sentAt: expiredTerminalAt,
        createdAt: expiredTerminalAt,
        updatedAt: expiredTerminalAt,
      });
      const failedWithoutRedactionId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: "email:readiness:failed-expired",
        shopId,
        notificationContext: "test.email",
        deliverySuppressed: false,
        payload,
        attemptCount: 3,
        nextRunAt: expiredTerminalAt,
        failedAt: expiredTerminalAt,
        terminalAt: expiredTerminalAt,
        createdAt: expiredTerminalAt,
        updatedAt: expiredTerminalAt,
      });
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${failedWithoutRedactionId}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        outboxId: failedWithoutRedactionId,
        channel: "email",
        dedupeKey: "email:readiness:failed-expired",
        notificationContext: "test.email",
        firstFailedAt: expiredFailureAt,
        lastFailedAt: expiredFailureAt,
        lastError: "notification_delivery_failed",
        createdAt: expiredFailureAt,
        updatedAt: expiredFailureAt,
      });
      return { sentWithoutTerminalAtId, failedWithoutRedactionId, failureId };
    });

    const before = await t.query(internal.notificationOutbox.maintenance.getRedactionReadiness, {});
    expect(before).toEqual({
      checkedAt: now,
      ready: false,
      terminalWithoutTerminalAt: { sent: 1, failed: 0, cancelled: 0 },
      expiredTerminalWithoutRedaction: { sent: 0, failed: 1, cancelled: 0 },
      expiredFailureWithoutRedaction: 1,
    });
    expect(JSON.stringify(before)).not.toContain("secret-recipient@example.com");
    expect(JSON.stringify(before)).not.toContain(ids.sentWithoutTerminalAtId);
    expect(JSON.stringify(before)).not.toContain(ids.failedWithoutRedactionId);
    expect(JSON.stringify(before)).not.toContain(ids.failureId);

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.sentWithoutTerminalAtId, { terminalAt: expiredTerminalAt });
    });
    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: 2,
    });
    await expect(t.mutation(internal.notificationOutbox.mutations.expireOldFailures, {})).resolves.toEqual({
      expiredCount: 1,
    });

    await expect(t.query(internal.notificationOutbox.maintenance.getRedactionReadiness, {})).resolves.toEqual({
      checkedAt: now,
      ready: true,
      terminalWithoutTerminalAt: { sent: 0, failed: 0, cancelled: 0 },
      expiredTerminalWithoutRedaction: { sent: 0, failed: 0, cancelled: 0 },
      expiredFailureWithoutRedaction: 0,
    });
  });
});
