import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  createConvexTestWithMigrations,
  createMigrationHistoryTestWithMigrations,
  runMigrationToCompletion,
} from "../_test/migrations.test-helper";
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

async function runM024(t: ReturnType<typeof createNarrowPrepMigrationTest>, batchSize: number) {
  return await runMigrationToCompletion(t, internal.migrations.m024_notification_outbox_narrow_prep.migration, {
    batchSize,
    cursor: null,
  });
}

function createMigrationTest() {
  return createConvexTestWithMigrations();
}

function createNarrowPrepMigrationTest() {
  return createMigrationHistoryTestWithMigrations();
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
          ...(status === "cancelled"
            ? { cancelledAt: oldTerminalAt, cancelReason: "organization_restricted" as const }
            : {}),
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
    expect(migrated.outbox.find((job) => job._id === ids.outboxIds.cancelled)).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_restricted",
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

describe("notification outbox narrow prep migration", () => {
  it("旧shapeを現行規則で補完し、既存値と再実行後の状態を変えない", async () => {
    const t = createNarrowPrepMigrationTest();
    const ids = await t.run(async (ctx) => {
      const legacyEmailId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:m024:legacy-email",
        fanoutTargetKey: "m024:legacy-target",
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "legacy email",
          html: "legacy body",
          context: "notification.sendReminderEmails",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: 100,
        createdAt: 100,
        updatedAt: 100,
      });
      const legacyLineId = await ctx.db.insert("notificationOutbox", {
        channel: "line",
        status: "pending",
        dedupeKey: "line:m024:legacy-line",
        payload: {
          kind: "line",
          toUserId: "U_legacy_recipient",
          text: "legacy line",
          fallbackEmail: {
            dedupeKey: "email:m024:legacy-line",
            payload: {
              kind: "email",
              from: "sender@example.com",
              to: "recipient@example.com",
              subject: "legacy fallback",
              html: "legacy fallback body",
              context: "notification.sendRecruitmentNotificationEmails",
              suppressDelivery: true,
            },
          },
        },
        attemptCount: 0,
        nextRunAt: 200,
        createdAt: 200,
        updatedAt: 200,
      });
      const existingBillingId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:m024:existing-billing",
        fanoutTargetKey: "m024:existing-target",
        purpose: "billing",
        notificationContext: "existing.context",
        deliverySuppressed: false,
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "billing@example.com",
          subject: "billing",
          html: "billing body",
          context: "payload.context.must.not.replace.existing",
          suppressDelivery: true,
        },
        attemptCount: 0,
        nextRunAt: 300,
        createdAt: 300,
        updatedAt: 300,
      });
      return { existingBillingId, legacyEmailId, legacyLineId };
    });
    const beforeMigration = await outboxSnapshot(t);

    const firstProgress = await runM024(t, 1);
    expect(firstProgress.processed).toBe(3);

    const migrated = await outboxSnapshot(t);
    const legacyEmail = migrated.find((job) => job._id === ids.legacyEmailId);
    const legacyLine = migrated.find((job) => job._id === ids.legacyLineId);
    const existingBilling = migrated.find((job) => job._id === ids.existingBillingId);
    const existingBillingBefore = beforeMigration.find((job) => job._id === ids.existingBillingId);
    expect(legacyEmail).toBeDefined();
    expect(legacyLine).toBeDefined();
    expect(existingBilling).toBeDefined();
    expect(existingBillingBefore).toBeDefined();
    expect(legacyEmail).toMatchObject({
      purpose: "business",
      notificationContext: "notification.sendReminderEmails",
      deliverySuppressed: true,
      fanoutTargetKey: "m024:legacy-target",
      updatedAt: 100,
    });
    expect(legacyLine).toMatchObject({
      purpose: "business",
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      // fallback emailの抑止ではなく、Outbox本体のLINE payloadを正とする。
      deliverySuppressed: false,
      updatedAt: 200,
    });
    expect(existingBilling).toEqual(existingBillingBefore);

    const beforeRerun = await outboxSnapshot(t);
    const rerunProgress = await t.mutation(internal.migrations.m024_notification_outbox_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(rerunProgress.processed).toBe(3);
    expect(await outboxSnapshot(t)).toEqual(beforeRerun);
  });
});

async function migrationSnapshot(t: ReturnType<typeof createMigrationTest>) {
  return await t.run(async (ctx) => ({
    outbox: (await ctx.db.query("notificationOutbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
    failure: (await ctx.db.query("notificationFailureInbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
  }));
}

async function outboxSnapshot(t: ReturnType<typeof createNarrowPrepMigrationTest>) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("notificationOutbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
  );
}
