import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";
import { seedManagerShop } from "../_test/seed";
import {
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
} from "../constants";

async function runM019(t: ReturnType<typeof createMigrationTest>, batchSize: number) {
  return await runMigrationToCompletion(t, internal.migrations.m019_notification_outbox_terminal_redaction.migration, {
    batchSize,
    cursor: null,
  });
}

async function runM020(t: ReturnType<typeof createMigrationTest>, batchSize: number) {
  return await runMigrationToCompletion(t, internal.migrations.m020_notification_failure_inbox_redaction.migration, {
    batchSize,
    cursor: null,
  });
}

function createMigrationTest() {
  return createConvexTestWithMigrations();
}

describe("notification terminal redaction migrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("旧shapeをcursorで複数batch移行し、dryRunと再実行でデータを壊さない", async () => {
    const t = createMigrationTest();
    const now = Date.now();
    const oldTerminalAt = now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS - 1;
    const oldFailureAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS - 1;
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "notification_redaction_migration",
        email: "manager@example.com",
        shopName: "通知redaction移行店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "通知redactionスタッフ",
        email: "secret-recipient@example.com",
        isDeleted: false,
      });
      const payload = {
        kind: "email" as const,
        from: "sender@example.com",
        to: "secret-recipient@example.com",
        subject: "secret subject",
        html: '<a href="https://app.example.com/shifts/view?token=capability-secret">open</a>',
        context: "notification.sendConfirmationEmail",
        suppressDelivery: true,
      };
      const insertOutbox = async (status: "pending" | "sent" | "failed" | "cancelled") =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status,
          dedupeKey: `email:migration:${status}`,
          shopId,
          staffId,
          payload,
          attemptCount: 1,
          nextRunAt: oldTerminalAt,
          lastError: `raw-provider-error:${status}:secret-recipient@example.com`,
          ...(status === "sent" ? { sentAt: oldTerminalAt } : {}),
          ...(status === "failed" ? { failedAt: oldTerminalAt } : {}),
          ...(status === "cancelled" ? { cancelledAt: oldTerminalAt } : {}),
          createdAt: oldTerminalAt,
          updatedAt: oldTerminalAt,
        });
      const outboxIds = {
        pending: await insertOutbox("pending"),
        sent: await insertOutbox("sent"),
        failed: await insertOutbox("failed"),
        cancelled: await insertOutbox("cancelled"),
      };
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${outboxIds.failed}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        staffId,
        outboxId: outboxIds.failed,
        channel: "email",
        dedupeKey: "email:migration:failed",
        notificationContext: "notification.sendConfirmationEmail",
        firstFailedAt: oldFailureAt,
        lastFailedAt: oldFailureAt,
        lastError: "raw-provider-error:secret-recipient@example.com",
        errorName: "provider-json-capability-secret",
        createdAt: oldFailureAt,
        updatedAt: oldFailureAt,
      });
      const freshRecurringFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:migration:fresh-recurring",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:migration:fresh-recurring",
        notificationContext: "notification.sendConfirmationEmail",
        firstFailedAt: oldFailureAt,
        lastFailedAt: now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS + 1,
        lastError: "notification_preparation_failed",
        createdAt: oldFailureAt,
        updatedAt: now,
      });
      return { failureId, freshRecurringFailureId, outboxIds };
    });
    const beforeDryRun = await migrationSnapshot(t);

    await expect(
      runMigrationToCompletion(t, internal.migrations.m019_notification_outbox_terminal_redaction.migration, {
        batchSize: 1,
        cursor: null,
        dryRun: true,
      }),
    ).rejects.toThrowError();
    await expect(
      runMigrationToCompletion(t, internal.migrations.m020_notification_failure_inbox_redaction.migration, {
        batchSize: 1,
        cursor: null,
        dryRun: true,
      }),
    ).rejects.toThrowError();
    expect(await migrationSnapshot(t)).toEqual(beforeDryRun);

    const m019Progress = await runM019(t, 1);
    const m020Progress = await runM020(t, 1);
    expect(m019Progress.processed).toBe(4);
    expect(m020Progress.processed).toBe(2);

    const migrated = await migrationSnapshot(t);
    for (const status of ["sent", "failed", "cancelled"] as const) {
      const job = migrated.outbox.find((candidate) => candidate._id === ids.outboxIds[status]);
      expect(job).toMatchObject({
        status,
        terminalAt: oldTerminalAt,
        notificationContext: "notification.sendConfirmationEmail",
        deliverySuppressed: true,
        payload: { kind: "email", from: "", to: "", subject: "", html: "" },
        payloadRedactedAt: now,
      });
      expect(job?.lastError).toBeUndefined();
      expect(JSON.stringify(job)).not.toContain("capability-secret");
      expect(JSON.stringify(job)).not.toContain("secret-recipient@example.com");
    }
    expect(migrated.outbox.find((job) => job._id === ids.outboxIds.pending)).toMatchObject({
      status: "pending",
      notificationContext: "notification.sendConfirmationEmail",
      deliverySuppressed: true,
      payload: { to: "secret-recipient@example.com" },
    });
    expect(migrated.failure.find((failure) => failure._id === ids.failureId)).toMatchObject({
      status: "resolved",
      resolutionKind: "expired",
      sensitiveDataRedactedAt: now,
    });
    expect(migrated.failure.find((failure) => failure._id === ids.failureId)?.lastError).toBeUndefined();
    expect(migrated.failure.find((failure) => failure._id === ids.freshRecurringFailureId)).toMatchObject({
      status: "open",
      firstFailedAt: oldFailureAt,
      lastFailedAt: now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS + 1,
      lastError: "notification_preparation_failed",
    });
    expect(
      migrated.failure.find((failure) => failure._id === ids.freshRecurringFailureId)?.sensitiveDataRedactedAt,
    ).toBeUndefined();

    const beforeRerun = await migrationSnapshot(t);
    await runM019(t, 1);
    await runM020(t, 1);
    expect(await migrationSnapshot(t)).toEqual(beforeRerun);
    expect(
      beforeRerun.outbox.filter(
        (job) =>
          ["sent", "failed", "cancelled"].includes(job.status) &&
          job.terminalAt !== undefined &&
          job.terminalAt <= now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS &&
          job.payloadRedactedAt === undefined,
      ),
    ).toEqual([]);
    expect(
      beforeRerun.failure.filter(
        (failure) =>
          failure.lastFailedAt <= now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS &&
          failure.sensitiveDataRedactedAt === undefined,
      ),
    ).toEqual([]);
  });
});

async function migrationSnapshot(t: ReturnType<typeof createMigrationTest>) {
  return await t.run(async (ctx) => ({
    outbox: (await ctx.db.query("notificationOutbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
    failure: (await ctx.db.query("notificationFailureInbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
  }));
}
