import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedStaff } from "../_test/scenarioBuilders";
import {
  seedCanonicalStaffLineRecipient,
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationPersonLineLink,
  seedUser,
} from "../_test/seed";
import {
  NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE,
  NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
  NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE,
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
  NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
  NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE,
  RESEND_DELAYED_FAILURE_GRACE_MS,
  RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE,
} from "../constants";
import { resolveStaffLineRecipient } from "../line/service";
import { buildConfirmationSnapshotSignature } from "../notification/confirmationSnapshots";
import { NOTIFICATION_FAILURE_REMINDER_CONTEXT, SHOP_ACTIVATION_REMINDER_CONTEXT } from "./failureSuppress";
import { lineRecipientOutboxSnapshot, toNotificationLineRecipient } from "./types";

const emailPayload = {
  kind: "email" as const,
  from: "シフトリ <noreply@example.com>",
  to: "staff@example.com",
  subject: "シフト希望の提出をお願いします",
  html: "<p>test</p>",
  context: "test.email",
  suppressDelivery: true,
};

async function setupShop() {
  const t = createConvexTestWithMigrations();
  const ids = await t.run(async (ctx) => {
    const { shopId, userId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "manager@example.com",
      shopName: "通知店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "通知スタッフ",
      email: "staff@example.com",
      isDeleted: false,
    });
    return { shopId, staffId, userId };
  });
  return { t, ...ids };
}

async function collectFailureInbox(t: Awaited<ReturnType<typeof setupShop>>["t"]) {
  return await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
}

async function collectResendDelayedFailureDeadlines(t: Awaited<ReturnType<typeof setupShop>>["t"]) {
  return await t.run(async (ctx) => await ctx.db.query("notificationResendDelayedFailureDeadlines").collect());
}

async function reopenOutboxWithTestLease(
  t: Awaited<ReturnType<typeof setupShop>>["t"],
  outboxId: Id<"notificationOutbox">,
) {
  const leaseToken = `test-lease:${outboxId}:${Date.now()}`;
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "processing",
      failedAt: undefined,
      processingStartedAt: now,
      leaseToken,
      leaseExpiresAt: now + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
      updatedAt: now,
    });
  });
  return leaseToken;
}

async function insertRecruitment(t: Awaited<ReturnType<typeof setupShop>>["t"], shopId: Id<"shops">) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
      deadline: "2026-06-25",
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
  });
}

async function seedCountedStaffForUsageLimit(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; prefix: string; count?: number },
) {
  for (let index = 0; index < (args.count ?? 5); index += 1) {
    await seedStaff(ctx, {
      shopId: args.shopId,
      name: `${args.prefix}${index + 1}`,
      email: `${args.prefix}${index + 1}@example.com`,
    });
  }
}

async function insertSentEmailOutbox(
  t: Awaited<ReturnType<typeof setupShop>>["t"],
  args: {
    shopId: Id<"shops">;
    staffId: Id<"staffs">;
    recruitmentId?: Id<"recruitments">;
    dedupeKey?: string;
    context?: string;
    resendEmailId?: string;
    suppressFailureInbox?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "sent",
      dedupeKey: args.dedupeKey ?? "email:test:provider",
      shopId: args.shopId,
      ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
      staffId: args.staffId,
      payload: {
        ...emailPayload,
        context: args.context ?? emailPayload.context,
        ...(args.suppressFailureInbox ? { suppressFailureInbox: true } : {}),
      },
      attemptCount: 1,
      nextRunAt: now,
      sentAt: now,
      ...(args.resendEmailId ? { resendEmailId: args.resendEmailId } : {}),
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("notificationOutbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("同じdedupeKeyのpendingジョブは重複作成しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const first = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:dedupe",
      payload: emailPayload,
    });
    const second = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:dedupe",
      payload: emailPayload,
    });

    expect(second?.deduped).toBe(true);
    expect(second?.outboxId).toBe(first?.outboxId);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].purpose).toBe("business");
  });

  it("canonical再連携後の同じdedupeKeyは旧generationをcancelし、現在generationで新規作成する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "canonical_dedupe_generation" });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        name: "canonical dedupe recipient",
        email: "canonical-dedupe@example.com",
        isDeleted: false,
      });
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_canonical_dedupe",
        generation: 1,
      });
      return { ...seeded, staffId, recipient };
    });
    const dedupeKey = "line:test:canonical-generation-relink";
    const first = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      organizationPersonLineLinkId: ids.recipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: ids.recipient.generation,
      purpose: "business",
      history: { notificationKind: "test.canonicalRelink", displayTitle: "canonical relink" },
      dedupeKey,
      payload: { kind: "line", toUserId: "U_canonical_dedupe", text: "generation 1", suppressDelivery: true },
    });
    if (!first) throw new Error("generation 1 notification was not enqueued");

    const currentRecipient = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(ids.recipient.organizationPersonLineLinkId, { isDeleted: true, unlinkedAt: now });
      await ctx.db.patch(ids.recipient.lineProviderUserId, { isDeleted: true });
      await ctx.db.patch(ids.recipient.organizationPersonId, { lineLinkGeneration: 2, updatedAt: now });
      return await seedOrganizationPersonLineLink(ctx, {
        organizationId: ids.recipient.organizationId,
        organizationPersonId: ids.recipient.organizationPersonId,
        lineUserId: "U_canonical_dedupe",
        generation: 3,
      });
    });
    const second = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      organizationPersonLineLinkId: currentRecipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: currentRecipient.generation,
      purpose: "business",
      history: { notificationKind: "test.canonicalRelink", displayTitle: "canonical relink" },
      dedupeKey,
      payload: { kind: "line", toUserId: "U_canonical_dedupe", text: "generation 3", suppressDelivery: true },
    });

    expect(second).toEqual({ outboxId: expect.any(String), deduped: false });
    expect(second?.outboxId).not.toBe(first.outboxId);
    const jobs = await t.run(async (ctx) =>
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", dedupeKey))
        .collect(),
    );
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: first.outboxId,
          status: "cancelled",
          cancelReason: "recipient_inactive",
          organizationPersonLineGenerationAtEnqueue: 1,
        }),
        expect.objectContaining({
          _id: second?.outboxId,
          status: "pending",
          organizationPersonLineLinkId: currentRecipient.organizationPersonLineLinkId,
          organizationPersonLineGenerationAtEnqueue: 3,
          payload: expect.objectContaining({ text: "generation 3" }),
        }),
      ]),
    );
  });

  it("canonical snapshot付きjobは同じLINE IDへの再連携generation変更で停止する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "legacy_snapshot_generation",
        plan: "pro",
      });
      const now = Date.now();
      const organizationPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: seeded.organizationId,
        name: "legacy snapshot recipient",
        email: "legacy-snapshot-generation@example.com",
        emailNormalized: "legacy-snapshot-generation@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId,
        name: "legacy snapshot recipient",
        email: "legacy-snapshot-generation@example.com",
        isDeleted: false,
      });
      const recipient = await seedOrganizationPersonLineLink(ctx, {
        organizationId: seeded.organizationId,
        organizationPersonId,
        lineUserId: "U_legacy_same_id_relink",
        following: true,
      });
      return { ...seeded, organizationPersonId, staffId, recipient };
    });
    const resolvedRecipient = await t.run(async (ctx) =>
      resolveStaffLineRecipient(ctx, { staffId: ids.staffId, shopId: ids.shopId }),
    );
    const notificationRecipient = toNotificationLineRecipient(resolvedRecipient);
    if (!notificationRecipient) throw new Error("canonical recipient was not resolved");
    const snapshot = lineRecipientOutboxSnapshot(notificationRecipient);
    expect(snapshot).toEqual({
      organizationPersonLineLinkId: ids.recipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: ids.recipient.generation,
    });
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      ...snapshot,
      history: { notificationKind: "test.legacyGeneration", displayTitle: "legacy generation" },
      dedupeKey: "line:test:legacy-generation",
      payload: { kind: "line", toUserId: "U_legacy_same_id_relink", text: "test", suppressDelivery: true },
    });
    if (!enqueued) throw new Error("snapshot notification was not enqueued");
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.organizationPersonId, {
        lineLinkGeneration: ids.recipient.generation + 1,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(ids.recipient.organizationPersonLineLinkId, {
        generation: ids.recipient.generation + 1,
      });
    });
    const [claimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });
    if (!claimed?.leaseToken) throw new Error("snapshot notification lease was not issued");

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareLineForProviderDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: claimed.leaseToken,
        now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it("snapshot欠損の旧jobをfail closedで停止する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "canonical_snapshot_missing" });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        name: "canonical recipient",
        email: "canonical-recipient@example.com",
        emailNormalized: "canonical-recipient@example.com",
        isDeleted: false,
      });
      await seedCanonicalStaffLineRecipient(ctx, { staffId, lineUserId: "U_canonical_snapshot" });
      const now = Date.now();
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "line",
        status: "processing",
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        staffId,
        purpose: "business",
        notificationContext: "test.canonicalSnapshotMissing",
        deliverySuppressed: true,
        dedupeKey: "line:test:canonical-snapshot-missing",
        payload: {
          kind: "line",
          toUserId: "U_canonical_snapshot",
          text: "test",
          suppressDelivery: true,
        },
        attemptCount: 1,
        nextRunAt: now,
        processingStartedAt: now,
        leaseToken: "canonical-snapshot-missing-lease",
        leaseExpiresAt: now + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
        createdAt: now,
        updatedAt: now,
      });
      return { outboxId, now };
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareLineForProviderDelivery, {
        outboxId: ids.outboxId,
        leaseToken: "canonical-snapshot-missing-lease",
        now: ids.now,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(ids.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it("旧actionのsplit snapshotを検証後にcanonical snapshotとして保存する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-01",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const operationKey = "shift.confirmation:legacy-split-snapshot";
      const leaseToken = "legacy-split-snapshot-lease";
      const operationId = await ctx.db.insert("notificationFanoutOperations", {
        operationKey,
        kind: "confirmation",
        purpose: "confirmation",
        recruitmentId,
        shopId,
        targetStaffIds: [staffId],
        cursor: 0,
        status: "processing",
        dedupeSuffix: "confirm",
        leaseToken,
        leaseExpiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { recruitmentId, positionId, operationId, operationKey, leaseToken };
    });
    const rawAssignments = [
      { date: "2026-07-01", startTime: "10:00", endTime: "12:00", positionId: ids.positionId },
      { date: "2026-07-01", startTime: "12:00", endTime: "18:00", positionId: ids.positionId },
    ];

    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      recruitmentId: ids.recruitmentId,
      purpose: "business",
      history: { notificationKind: "shift.confirmation", displayTitle: "確定シフト" },
      fanoutTargetKey: `fanout:${ids.operationKey}:${staffId}`,
      fanoutOperationId: ids.operationId,
      fanoutLeaseToken: ids.leaseToken,
      legacyFanoutDedupeKeys: [],
      confirmationSnapshot: {
        assignments: rawAssignments,
        signature: buildConfirmationSnapshotSignature(rawAssignments),
      },
      dedupeKey: `email:confirmation:${ids.recruitmentId}:${staffId}:confirm`,
      payload: emailPayload,
    });

    const state = await t.run(async (ctx) => ({
      outbox: await ctx.db.query("notificationOutbox").first(),
      snapshot: await ctx.db
        .query("shiftConfirmationSnapshots")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", ids.recruitmentId).eq("staffId", staffId))
        .unique(),
    }));
    const canonicalAssignments = [
      { date: "2026-07-01", startTime: "10:00", endTime: "18:00", positionId: ids.positionId },
    ];
    expect(state.outbox?.payload).toEqual(emailPayload);
    expect(state.snapshot).toMatchObject({
      assignments: canonicalAssignments,
      signature: buildConfirmationSnapshotSignature(canonicalAssignments),
    });
  });

  it("組織削除とpending・claim済み通知が競合しても新しい外部送信を開始しない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "organization_notification_deleted",
        email: "organization-notification-deleted@example.com",
        plan: "free",
      }),
    );
    const payload = {
      ...emailPayload,
      to: "organization-notification-deleted@example.com",
      context: "test.organizationDeleted",
    };
    const processing = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: "email:test:organization-deleted-processing",
      payload,
    });
    if (!processing) throw new Error("processing notification was not enqueued");
    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimedBeforeDeletion = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now(),
    });
    expect(claimedBeforeDeletion.map(({ _id, status }) => ({ _id, status }))).toEqual([
      { _id: processing.outboxId, status: "processing" },
    ]);

    const pending = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: "email:test:organization-deleted-pending",
      payload,
    });
    if (!pending) throw new Error("pending notification was not enqueued");
    await t.run(async (ctx) => await ctx.db.patch(ids.organizationId, { isDeleted: true }));

    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        userId: ids.userId,
        purpose: "business",
        dedupeKey: "email:test:organization-deleted-after",
        payload,
      }),
    ).resolves.toBeNull();

    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimedAfterDeletion = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now(),
    });
    expect(claimedAfterDeletion.map((job) => job._id)).toEqual([pending.outboxId]);
    const claims = [...claimedBeforeDeletion, ...claimedAfterDeletion];
    for (const outboxId of [processing.outboxId, pending.outboxId]) {
      const leaseToken = claims.find((job) => job._id === outboxId)?.leaseToken;
      if (!leaseToken) throw new Error("notification lease was not issued");
      await expect(
        t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
          outboxId,
          leaseToken,
          now: Date.now(),
        }),
      ).resolves.toBeNull();
    }

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(
      jobs
        .map(({ dedupeKey, status, cancelReason }) => ({ dedupeKey, status, cancelReason }))
        .sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey)),
    ).toEqual(
      ["email:test:organization-deleted-pending", "email:test:organization-deleted-processing"].map((dedupeKey) => ({
        dedupeKey,
        status: "cancelled",
        cancelReason: "organization_inactive",
      })),
    );
  });

  it("active.freeの実利用人数が上限超過中は新しい業務通知をenqueueしない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "outbox_usage_limit_enqueue",
        email: "outbox-usage-limit-enqueue@example.com",
        plan: "free",
      });
      await seedCountedStaffForUsageLimit(ctx, {
        shopId: seeded.shopId,
        prefix: "outbox-usage-limit-enqueue-staff-",
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        userId: ids.userId,
        purpose: "business",
        dedupeKey: "email:test:usage-limit-enqueue",
        payload: {
          ...emailPayload,
          to: "outbox-usage-limit-enqueue@example.com",
          context: "test.usageLimitEnqueue",
        },
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.query("notificationOutbox").collect())).resolves.toEqual([]);
  });

  it("enqueue後に実利用人数が上限を超えた業務通知はprovider直前にcancelする", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "outbox_usage_limit_prepare",
        email: "outbox-usage-limit-prepare@example.com",
        plan: "free",
      }),
    );
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: "email:test:usage-limit-prepare",
      payload: {
        ...emailPayload,
        to: "outbox-usage-limit-prepare@example.com",
        context: "test.usageLimitPrepare",
      },
    });
    if (!enqueued) throw new Error("business notification was not enqueued");

    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(claimed.map(({ _id, status }) => ({ _id, status }))).toEqual([
      { _id: enqueued.outboxId, status: "processing" },
    ]);
    await t.run(async (ctx) => {
      await seedCountedStaffForUsageLimit(ctx, {
        shopId: ids.shopId,
        prefix: "outbox-usage-limit-prepare-staff-",
      });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: claimed[0]?.leaseToken,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "organization_usage_limit_exceeded",
    });
  });

  it("active.freeの実利用人数が上限超過中でもbilling通知は配送直前検証を通す", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "outbox_usage_limit_billing",
        email: "outbox-usage-limit-billing@example.com",
        plan: "free",
      });
      await seedCountedStaffForUsageLimit(ctx, {
        shopId: seeded.shopId,
        prefix: "outbox-usage-limit-billing-staff-",
      });
      return seeded;
    });
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "billing",
      dedupeKey: "email:test:usage-limit-billing",
      payload: {
        ...emailPayload,
        to: "outbox-usage-limit-billing@example.com",
        subject: "契約のお知らせ",
        context: "organizationBilling.billingEmailChanged",
      },
    });
    if (!enqueued) throw new Error("billing notification was not enqueued");

    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(claimed.map(({ _id, status }) => ({ _id, status }))).toEqual([
      { _id: enqueued.outboxId, status: "processing" },
    ]);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: claimed[0]?.leaseToken,
        now: Date.now(),
      }),
    ).resolves.toMatchObject({
      _id: enqueued.outboxId,
      status: "processing",
      purpose: "billing",
    });
  });

  it.each([
    {
      label: "Trial終了",
      context: "organizationBilling.trialEnding",
      state: { kind: "trial" as const, trialEndsAt: 1_000 },
    },
    {
      label: "猶予終了前",
      context: "organizationBilling.graceEndingSoon",
      state: { kind: "grace" as const, plan: "pro" as const, startedAt: 100, endsAt: 1_000 },
    },
  ])("$labelの課金reminderは状態変更後の再送を送信直前に停止する", async ({ context, state }) => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `stale_${state.kind}_reminder`,
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, { state, version: 4 });
      return { ...seeded, billingStateId: billingState._id };
    });
    const payload = {
      kind: "email" as const,
      from: "シフトリ <noreply@example.com>",
      to: `stale_${state.kind}_reminder@example.com`,
      subject: "契約期限のお知らせ",
      html: "<p>test</p>",
      context,
      suppressDelivery: true,
    };
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "billing",
      dedupeKey: `email:test:stale-${state.kind}-reminder`,
      payload,
    });
    if (!enqueued) throw new Error("notification was not enqueued");

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.billingStateId, {
        state: { kind: "active", plan: "pro" },
        version: 5,
      });
      await ctx.db.patch(enqueued.outboxId, { status: "processing" });
    });
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
      organizationBillingVersionAtEnqueue: 4,
    });
  });

  it("契約制限を維持する支払い結果待ちはfallback snapshot欠損でも業務通知を送信直前に停止する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "pending_restricted_business_gate", plan: "pro" }),
    );
    const payload = {
      kind: "email" as const,
      from: "シフトリ <noreply@example.com>",
      to: "pending_restricted_business_gate@example.com",
      subject: "業務通知",
      html: "<p>test</p>",
      context: "test.organizationBusiness",
      suppressDelivery: true,
    };
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: "email:test:pending-restricted-final-gate",
      payload,
    });
    if (!enqueued) throw new Error("notification was not enqueued");
    await t.run(async (ctx) => {
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          startedAt: Date.now(),
        },
        version: 2,
      });
      await ctx.db.patch(enqueued.outboxId, { status: "processing" });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "organization_restricted",
    });
  });

  it("課金状態の正本が重複した場合は送信直前にfail-closedにする", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "duplicate_billing_state_gate", plan: "pro" }),
    );
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "billing",
      dedupeKey: "email:test:duplicate-billing-state-gate",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "duplicate_billing_state_gate@example.com",
        subject: "課金通知",
        html: "<p>test</p>",
        context: "organizationBilling.billingEmailChanged",
        suppressDelivery: true,
      },
    });
    if (!enqueued) throw new Error("notification was not enqueued");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationBillingStates", {
        organizationId: ids.organizationId,
        state: { kind: "active", plan: "pro" },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(enqueued.outboxId, { status: "processing" });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "invalid_scope",
    });
  });

  it("legacy shopMembersが重複した受信者は送信直前にfail-closedにする", async () => {
    const { t, shopId } = await setupShop();
    const userId = await t.run(async (ctx) => {
      const legacyUserId = await seedUser(ctx, "duplicate_legacy_recipient", "duplicate-legacy-recipient@example.com");
      await seedLegacyShopMembership(ctx, { shopId, userId: legacyUserId });
      return legacyUserId;
    });
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      userId,
      purpose: "business",
      dedupeKey: "email:test:duplicate-legacy-recipient",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "duplicate-legacy-recipient@example.com",
        subject: "業務通知",
        html: "<p>test</p>",
        context: "test.duplicateLegacyRecipient",
        suppressDelivery: true,
      },
    });
    if (!enqueued) throw new Error("notification was not enqueued");
    await t.run(async (ctx) => {
      await seedLegacyShopMembership(ctx, { shopId, userId });
      await ctx.db.patch(enqueued.outboxId, { status: "processing" });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it("person作成後でorganizationMember作成前の管理者通知はperson連絡先とLINEで配送直前検証を通す", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "outbox_partial_person",
        email: "outbox-login@example.com",
        plan: "pro",
      });
      await ctx.db.delete(seeded.memberId);
      await seedLegacyShopMembership(ctx, { shopId: seeded.shopId, userId: seeded.userId });
      await ctx.db.patch(seeded.personId, {
        email: "outbox-contact@example.com",
        emailNormalized: "outbox-contact@example.com",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        userId: seeded.userId,
        name: "移行途中管理者",
        email: "outbox-contact@example.com",
        emailNormalized: "outbox-contact@example.com",
        isDeleted: false,
      });
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_outbox_partial_person",
        following: true,
      });
      return { ...seeded, recipient };
    });
    const email = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: "email:test:partial-person-recipient",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "outbox-contact@example.com",
        subject: "業務通知",
        html: "<p>test</p>",
        context: "test.partialPersonRecipient",
        suppressDelivery: true,
      },
    });
    const line = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      organizationPersonLineLinkId: ids.recipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: ids.recipient.generation,
      purpose: "business",
      dedupeKey: "line:test:partial-person-recipient",
      payload: {
        kind: "line",
        toUserId: "U_outbox_partial_person",
        text: "業務通知",
        suppressDelivery: true,
      },
    });
    if (!email || !line) throw new Error("notifications were not enqueued");
    await t.run(async (ctx) => {
      await ctx.db.patch(email.outboxId, { status: "processing" });
      await ctx.db.patch(line.outboxId, { status: "processing" });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: email.outboxId,
        now: Date.now(),
      }),
    ).resolves.toMatchObject({ _id: email.outboxId });
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: line.outboxId,
        now: Date.now(),
      }),
    ).resolves.toMatchObject({ _id: line.outboxId });
  });

  it.each(["restrictedStarted", "recovered"] as const)(
    "%sのreadOnly非復旧担当者は既存Outbox経路でも送信対象にしない",
    async (event) => {
      const t = createConvexTestWithMigrations();
      const ids = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject: `${event}_outbox_current`, plan: "pro" });
        const now = Date.now();
        const formerUserId = await seedUser(ctx, `${event}_outbox_former`, `${event}-outbox-former@example.com`);
        const formerPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          userId: formerUserId,
          name: "旧復旧担当者",
          email: `${event}-outbox-former@example.com`,
          emailNormalized: `${event}-outbox-former@example.com`,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: seeded.organizationId,
          personId: formerPersonId,
          userId: formerUserId,
          status: "readOnly",
          createdAt: now,
          updatedAt: now,
        });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        if (event === "restrictedStarted") {
          await ctx.db.patch(billingState._id, {
            state: {
              kind: "restricted",
              reason: "freeConditionsNotMet",
              previousPlan: "pro",
              recoveryManagerPersonIds: [seeded.personId],
              previousActiveShopIds: [seeded.shopId],
              restrictedAt: now,
            },
          });
        }
        return { ...seeded, formerUserId };
      });

      await expect(
        t.mutation(internal.notificationOutbox.mutations.enqueue, {
          channel: "email",
          organizationId: ids.organizationId,
          userId: ids.formerUserId,
          purpose: "billing",
          dedupeKey: `email:test:${event}-former-recipient`,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: `${event}-outbox-former@example.com`,
            subject: "契約通知",
            html: "<p>test</p>",
            context: `organizationBilling.${event}`,
            suppressDelivery: true,
          },
        }),
      ).resolves.toBeNull();
      await expect(t.run((ctx) => ctx.db.query("notificationOutbox").collect())).resolves.toEqual([]);
    },
  );

  it("契約cutoff前の同一dedupeKeyジョブを停止し、現在versionの業務通知を新規作成する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const { oldOutboxId, organizationId } = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "Free通知事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "free" },
        businessNotificationCutoffAt: now,
        businessNotificationCutoffVersion: 2,
        version: 2,
        createdAt: now,
        updatedAt: now,
      });
      const oldOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:billing-version-dedupe",
        shopId,
        organizationId,
        organizationBillingVersionAtEnqueue: 1,
        purpose: "business",
        staffId,
        payload: emailPayload,
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { oldOutboxId, organizationId };
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      organizationId,
      organizationBillingVersionAtOrigin: 2,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:billing-version-dedupe",
      payload: emailPayload,
    });

    expect(result).toMatchObject({ deduped: false });
    expect(result?.outboxId).not.toBe(oldOutboxId);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs.find((job) => job._id === oldOutboxId)).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
    });
    expect(jobs.find((job) => job._id === result?.outboxId)).toMatchObject({
      status: "pending",
      organizationBillingVersionAtEnqueue: 2,
    });
  });

  it("事業者の業務通知だけを停止し、billing通知と送信済み通知は残す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "通知事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });

      const insertOutbox = async (args: {
        dedupeKey: string;
        status: "pending" | "processing" | "sent";
        purpose?: "business" | "billing";
        organizationScoped?: boolean;
        billingVersion?: number;
      }) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: args.status,
          dedupeKey: args.dedupeKey,
          shopId,
          ...(args.organizationScoped ? { organizationId } : {}),
          ...(args.billingVersion !== undefined ? { organizationBillingVersionAtEnqueue: args.billingVersion } : {}),
          ...(args.purpose ? { purpose: args.purpose } : {}),
          staffId,
          payload: emailPayload,
          attemptCount: args.status === "processing" ? 1 : 0,
          nextRunAt: now,
          ...(args.status === "processing" ? { processingStartedAt: now } : {}),
          ...(args.status === "sent" ? { sentAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        });

      return {
        organizationId,
        businessId: await insertOutbox({
          dedupeKey: "email:test:organization-business",
          status: "pending",
          purpose: "business",
          organizationScoped: true,
          billingVersion: 1,
        }),
        processingId: await insertOutbox({
          dedupeKey: "email:test:organization-processing",
          status: "processing",
          purpose: "business",
          organizationScoped: true,
          billingVersion: 1,
        }),
        legacyId: await insertOutbox({
          dedupeKey: "email:test:organization-legacy",
          status: "pending",
        }),
        billingId: await insertOutbox({
          dedupeKey: "email:test:organization-billing",
          status: "pending",
          purpose: "billing",
          organizationScoped: true,
        }),
        newBusinessId: await insertOutbox({
          dedupeKey: "email:test:organization-new-business",
          status: "pending",
          purpose: "business",
          organizationScoped: true,
          billingVersion: 2,
        }),
        sentId: await insertOutbox({
          dedupeKey: "email:test:organization-sent",
          status: "sent",
          purpose: "business",
          organizationScoped: true,
        }),
      };
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: ids.organizationId,
        cutoffAt: Date.now(),
        cutoffVersion: 2,
      }),
    ).resolves.toEqual({ cancelledCount: 3 });

    await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId: ids.businessId });
    await t.mutation(internal.notificationOutbox.mutations.markRetry, {
      outboxId: ids.legacyId,
      lastError: "late worker",
      nextRunAt: Date.now(),
    });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    const stateById = new Map(jobs.map((job) => [job._id, job]));
    for (const outboxId of [ids.businessId, ids.processingId, ids.legacyId]) {
      expect(stateById.get(outboxId)).toMatchObject({
        status: "cancelled",
        cancelReason: "organization_billing_changed",
      });
    }
    expect(stateById.get(ids.billingId)?.status).toBe("pending");
    expect(stateById.get(ids.newBusinessId)?.status).toBe("pending");
    expect(stateById.get(ids.sentId)?.status).toBe("sent");

    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(new Set(claimed.map((job) => job._id))).toEqual(new Set([ids.billingId, ids.newBusinessId]));
  });

  it("billingと管理者招待のchannel・payload・参照を整合させる", async () => {
    const { t, shopId, userId } = await setupShop();
    const { organizationId, invitationId } = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        createdByUserId: userId,
        name: "招待事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "管理者",
        email: "manager@example.com",
        emailNormalized: "manager@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId,
        email: "invite@example.com",
        emailNormalized: "invite@example.com",
        tokenDigest: "digest",
        status: "pending",
        inviterMemberId: memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "pro" },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      return { organizationId, invitationId };
    });

    const linePayload = { kind: "line" as const, toUserId: "U_test", text: "test" };
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "line",
        organizationId,
        userId,
        purpose: "billing",
        dedupeKey: "line:test:billing",
        payload: linePayload,
      }),
    ).rejects.toThrow("Notification cannot be enqueued");
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "line",
        organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        dedupeKey: "line:test:organization-invitation",
        payload: linePayload,
      }),
    ).rejects.toThrow("Notification cannot be enqueued");

    const invitationPayload = {
      kind: "organizationManagerInvitationEmail" as const,
      from: "シフトリ <noreply@example.com>",
      to: "invite@example.com",
      context: "organizationInvitation.send",
    };
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        organizationId,
        purpose: "business",
        dedupeKey: "email:test:organization-invitation-missing-reference",
        payload: invitationPayload,
      }),
    ).rejects.toThrow("Notification cannot be enqueued");
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "billing",
        dedupeKey: "email:test:organization-invitation-billing",
        payload: invitationPayload,
      }),
    ).rejects.toThrow("Notification cannot be enqueued");
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        dedupeKey: "email:test:organization-invitation-rendered-html",
        payload: { ...emailPayload, to: "invite@example.com" },
      }),
    ).rejects.toThrow("Notification cannot be enqueued");

    const result = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
      purpose: "business",
      dedupeKey: "email:test:organization-invitation-valid",
      payload: invitationPayload,
    });
    expect(result?.deduped).toBe(false);
    expect(await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect())).toHaveLength(1);
  });

  it("100件の通常通知をpendingジョブとして受け付ける", async () => {
    const { t, shopId } = await setupShop();
    const staffIds = await t.run(async (ctx) => {
      const ids: Id<"staffs">[] = [];
      for (let i = 0; i < 100; i++) {
        ids.push(
          await ctx.db.insert("staffs", {
            shopId,
            name: `通知スタッフ${i + 1}`,
            email: `notify-${i + 1}@example.com`,
            isDeleted: false,
          }),
        );
      }
      return ids;
    });

    for (const [index, staffId] of staffIds.entries()) {
      await t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId,
        staffId,
        history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
        dedupeKey: `email:test:bulk:${index}`,
        payload: { ...emailPayload, to: `notify-${index + 1}@example.com` },
      });
    }

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(100);
    expect(jobs.every((job) => job.status === "pending")).toBe(true);
    expect(jobs.every((job) => job.nextRunAt >= job.createdAt + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS)).toBe(true);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(0);
  });

  it("processing中の別ジョブが多い状態でも新規通知をpendingジョブとして受け付ける", async () => {
    const { t, shopId, staffId } = await setupShop();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 500; i++) {
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "processing",
          dedupeKey: `email:test:processing:${i}`,
          shopId,
          staffId,
          payload: emailPayload,
          attemptCount: 1,
          nextRunAt: now,
          processingStartedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:after-processing-bulk",
      payload: emailPayload,
    });

    expect(result?.deduped).toBe(false);
    const outboxId = result?.outboxId as Id<"notificationOutbox">;
    const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(job?.status).toBe("pending");
  });

  it("dueなpendingジョブが残っていてもenqueueではworker予定を作らない", async () => {
    const { t, shopId, staffId } = await setupShop();
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:stale",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 0,
        nextRunAt: Date.now() - 1000,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });
    });

    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:after-stale",
      payload: emailPayload,
    });

    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(0);
  });

  it("markRetryはpendingに戻してretryイベントを残し、個別workerは予約しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const retryJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:retry-backoff",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 1,
        nextRunAt: now,
        processingStartedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.notificationOutbox.mutations.markRetry, {
      outboxId: retryJobId,
      lastError: "temporary error",
      nextRunAt: now + 60 * 60 * 1000,
    });

    const job = await t.run(async (ctx) => await ctx.db.get(retryJobId));
    expect(job).toMatchObject({
      status: "pending",
      nextRunAt: now + 60 * 60 * 1000,
      lastError: "notification_delivery_failed",
    });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "retry_scheduled",
      shopId,
      staffId,
      outboxId: retryJobId,
      channel: "email",
      dedupeKey: "email:test:retry-backoff",
      notificationContext: "test.email",
      attemptCount: 1,
      nextRunAt: now + 60 * 60 * 1000,
      errorMessage: "notification_delivery_failed",
    });
    expect(await collectFailureInbox(t)).toEqual([]);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(0);
  });

  it("dueなpendingジョブにdedupeした場合もworker予定を作らない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const staleJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:stale-dedupe",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 0,
        nextRunAt: Date.now() - 1000,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:stale-dedupe",
      payload: emailPayload,
    });

    expect(result).toEqual({ outboxId: staleJobId, deduped: true });
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(0);
  });

  describe("markSent", () => {
    async function insertProcessingJob(
      t: Awaited<ReturnType<typeof setupShop>>["t"],
      args: {
        shopId: Id<"shops">;
        channel: "email" | "line";
        dedupeKey: string;
        suppressDelivery?: boolean;
        staffId?: Id<"staffs">;
        recruitmentId?: Id<"recruitments">;
        context?: string;
      },
    ) {
      const suppressDelivery = args.suppressDelivery ?? false;
      return await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("notificationOutbox", {
          channel: args.channel,
          status: "processing",
          dedupeKey: args.dedupeKey,
          shopId: args.shopId,
          ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
          ...(args.staffId ? { staffId: args.staffId } : {}),
          payload:
            args.channel === "email"
              ? { ...emailPayload, context: args.context ?? emailPayload.context, suppressDelivery }
              : { kind: "line" as const, toUserId: "U_test", text: "hello", suppressDelivery },
          attemptCount: 1,
          nextRunAt: now,
          processingStartedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      });
    }

    async function collectUsage(t: Awaited<ReturnType<typeof setupShop>>["t"]) {
      return await t.run(async (ctx) => await ctx.db.query("notificationUsage").collect());
    }

    beforeEach(() => {
      // JST 2026-06-15 12:00
      vi.setSystemTime(new Date("2026-06-15T03:00:00Z"));
    });

    it("email送信成功でその店舗・月のemailCountが+1される", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:sent" });

      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

      const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
      expect(job?.status).toBe("sent");
      const usage = await collectUsage(t);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ shopId, month: "2026-06", emailCount: 1, lineCount: 0 });
    });

    it("LINE送信成功でその店舗・月のlineCountが+1される", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "line", dedupeKey: "line:test:sent" });

      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

      const usage = await collectUsage(t);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ shopId, month: "2026-06", emailCount: 0, lineCount: 1 });
    });

    it("同月内の複数送信は同一行に累積される", async () => {
      const { t, shopId } = await setupShop();
      const outboxIds = [
        await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:1" }),
        await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:2" }),
        await insertProcessingJob(t, { shopId, channel: "line", dedupeKey: "line:test:1" }),
      ];

      for (const outboxId of outboxIds) {
        await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });
      }

      const usage = await collectUsage(t);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ shopId, month: "2026-06", emailCount: 2, lineCount: 1 });
    });

    it("店舗が異なれば別の行にカウントされる", async () => {
      const { t, shopId } = await setupShop();
      const otherShopId = await t.run(async (ctx) => {
        return await ctx.db.insert("shops", {
          name: "別店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
      });
      const outboxIds = [
        await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:a" }),
        await insertProcessingJob(t, { shopId: otherShopId, channel: "email", dedupeKey: "email:test:b" }),
      ];

      for (const outboxId of outboxIds) {
        await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });
      }

      const usage = await collectUsage(t);
      expect(usage).toHaveLength(2);
      expect(usage.every((row) => row.emailCount === 1 && row.lineCount === 0)).toBe(true);
    });

    it("既にsentのジョブを再度markSentしても送信日時を動かさず二重カウントしない", async () => {
      const { t, shopId, staffId } = await setupShop();
      const outboxId = await insertProcessingJob(t, {
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:twice",
      });
      const historyId = await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("notificationHistory", {
          outboxId,
          shopId,
          staffId,
          channel: "email",
          notificationKind: "test.email",
          displayTitle: emailPayload.subject,
          sendStatus: "queued",
          deliveryStatus: "unknown",
          requestedAt: now,
          updatedAt: now,
        });
      });

      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });
      const firstSentAt = Date.now();
      vi.advanceTimersByTime(60_000);
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

      const [job, history, usage] = await Promise.all([
        t.run(async (ctx) => await ctx.db.get(outboxId)),
        t.run(async (ctx) => await ctx.db.get(historyId)),
        collectUsage(t),
      ]);
      expect(job?.sentAt).toBe(firstSentAt);
      expect(history?.sentAt).toBe(firstSentAt);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ emailCount: 1, lineCount: 0 });
    });

    it("dry-run（suppressDelivery）のジョブはsentになってもカウントされない", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, {
        shopId,
        channel: "email",
        dedupeKey: "email:test:dry-run",
        suppressDelivery: true,
      });

      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

      const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
      expect(job?.status).toBe("sent");
      const usage = await collectUsage(t);
      expect(usage).toHaveLength(0);
    });

    it("markFailedではカウントされない", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:failed" });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "boom" });

      const usage = await collectUsage(t);
      expect(usage).toHaveLength(0);
      const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "final_failed",
        shopId,
        outboxId,
        channel: "email",
        dedupeKey: "email:test:failed",
        notificationContext: "test.email",
        attemptCount: 1,
        errorMessage: "notification_delivery_failed",
      });
      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        failureKey: `outbox:${outboxId}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        outboxId,
        channel: "email",
        dedupeKey: "email:test:failed",
        notificationContext: "test.email",
        attemptCount: 1,
        lastEventId: events[0]._id,
        lastError: "notification_delivery_failed",
      });
    });

    it("同じoutboxが再失敗しても要対応Inboxは重複作成せず更新する", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:refailed" });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "first" });
      const firstFailure = (await collectFailureInbox(t))[0];
      vi.advanceTimersByTime(1000);
      const leaseToken = await reopenOutboxWithTestLease(t, outboxId);
      await t.mutation(internal.notificationOutbox.mutations.markFailed, {
        outboxId,
        leaseToken,
        lastError: "notification_delivery_failed",
      });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        _id: firstFailure._id,
        failureKey: `outbox:${outboxId}`,
        status: "open",
        shopId,
        lastError: "notification_delivery_failed",
      });
      expect(failures[0].firstFailedAt).toBe(firstFailure.firstFailedAt);
      expect(failures[0].lastFailedAt).toBeGreaterThan(firstFailure.lastFailedAt);
    });

    it("markFailedは抑止対象contextでも配送イベントを残し、要対応Inbox化しない", async () => {
      const { t, shopId } = await setupShop();
      const dedupeKey = "email:notificationFailureReminder:shop_test:user_test";
      const outboxId = await insertProcessingJob(t, {
        shopId,
        channel: "email",
        dedupeKey,
        context: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
      });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "reminder failed" });

      const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "final_failed",
        shopId,
        outboxId,
        channel: "email",
        dedupeKey,
        notificationContext: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
        errorMessage: "notification_delivery_failed",
      });
      expect(await collectFailureInbox(t)).toEqual([]);
    });

    it("markFailedは店舗登録後リマインダーcontextでも配送イベントを残し、要対応Inbox化しない", async () => {
      const { t, shopId } = await setupShop();
      const dedupeKey = `email:shopActivationReminder:${shopId}:user_test`;
      const outboxId = await insertProcessingJob(t, {
        shopId,
        channel: "email",
        dedupeKey,
        context: SHOP_ACTIVATION_REMINDER_CONTEXT,
      });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "reminder failed" });

      const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "final_failed",
        shopId,
        outboxId,
        channel: "email",
        dedupeKey,
        notificationContext: SHOP_ACTIVATION_REMINDER_CONTEXT,
        errorMessage: "notification_delivery_failed",
      });
      expect(await collectFailureInbox(t)).toEqual([]);
    });

    it("同じ通知種別・募集・スタッフの異なるoutbox失敗は最新1件の要対応Inboxに更新する", async () => {
      const { t, shopId, staffId } = await setupShop();
      const recruitmentId = await t.run(async (ctx) => {
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });
      const firstOutboxId = await insertProcessingJob(t, {
        shopId,
        staffId,
        recruitmentId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        context: "notification.sendConfirmationEmail",
      });
      await t.mutation(internal.notificationOutbox.mutations.markFailed, {
        outboxId: firstOutboxId,
        lastError: "first",
      });
      const firstFailure = (await collectFailureInbox(t))[0];

      vi.advanceTimersByTime(1000);
      const secondOutboxId = await insertProcessingJob(t, {
        shopId,
        staffId,
        recruitmentId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        context: "notification.sendConfirmationEmail",
      });
      await t.mutation(internal.notificationOutbox.mutations.markFailed, {
        outboxId: secondOutboxId,
        lastError: "notification_delivery_failed",
      });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        _id: firstFailure._id,
        failureKey: `logical:${shopId}:${recruitmentId}:${staffId}:confirmation`,
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        outboxId: secondOutboxId,
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        notificationContext: "notification.sendConfirmationEmail",
        lastError: "notification_delivery_failed",
      });
      expect(failures[0].firstFailedAt).toBe(firstFailure.firstFailedAt);
      expect(failures[0].lastFailedAt).toBeGreaterThan(firstFailure.lastFailedAt);
    });

    it("投入前失敗と配送最終失敗が同じ通知対象なら最新1件にまとまる", async () => {
      const { t, shopId, staffId } = await setupShop();
      const recruitmentId = await t.run(async (ctx) => {
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });

      await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
        eventType: "enqueue_preparation_failed",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        notificationContext: "notification.sendConfirmationEmail",
        errorMessage: "preparation failed",
      });
      const firstFailure = (await collectFailureInbox(t))[0];

      vi.advanceTimersByTime(1000);
      const outboxId = await insertProcessingJob(t, {
        shopId,
        staffId,
        recruitmentId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        context: "notification.sendConfirmationEmail",
      });
      await t.mutation(internal.notificationOutbox.mutations.markFailed, {
        outboxId,
        lastError: "notification_delivery_failed",
      });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        _id: firstFailure._id,
        failureKey: `logical:${shopId}:${recruitmentId}:${staffId}:confirmation`,
        sourceType: "outbox",
        status: "open",
        outboxId,
        lastError: "notification_delivery_failed",
      });
      expect(failures[0].firstFailedAt).toBe(firstFailure.firstFailedAt);
    });

    it("markSentは同じoutboxの要対応Inboxをresolved/sentにする", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:recover" });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "first" });
      const leaseToken = await reopenOutboxWithTestLease(t, outboxId);
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId, leaseToken });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        status: "resolved",
        resolutionKind: "sent",
      });
      expect(failures[0].resolvedAt).toBeTypeOf("number");
    });

    it("markSentは同じoutboxIdを持つenqueue失敗ではなくoutbox失敗だけをresolvedにする", async () => {
      const { t, shopId, staffId } = await setupShop();
      const outboxId = await insertProcessingJob(t, {
        shopId,
        channel: "email",
        dedupeKey: "email:test:recover-target",
      });
      await t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.insert("notificationFailureInbox", {
          failureKey: `enqueue:${shopId}:email:test:fallback-enqueue`,
          sourceType: "enqueue",
          status: "open",
          shopId,
          staffId,
          outboxId,
          channel: "email",
          dedupeKey: "email:test:fallback-enqueue",
          notificationContext: "test.fallback",
          firstFailedAt: now,
          lastFailedAt: now,
          lastError: "enqueue failed",
          createdAt: now,
          updatedAt: now,
        });
      });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "delivery failed" });
      const leaseToken = await reopenOutboxWithTestLease(t, outboxId);
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId, leaseToken });

      const failures = await collectFailureInbox(t);
      expect(failures.find((failure) => failure.failureKey === `outbox:${outboxId}`)).toMatchObject({
        status: "resolved",
        resolutionKind: "sent",
      });
      expect(failures.find((failure) => failure.failureKey.startsWith("enqueue:"))).toMatchObject({
        status: "open",
      });
    });

    it("markFailedはoutboxのrecruitmentIdを配送イベントと要対応Inboxへ引き継ぐ", async () => {
      const { t, shopId, staffId } = await setupShop();
      const { recruitmentId, outboxId } = await t.run(async (ctx) => {
        const now = Date.now();
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "processing",
          dedupeKey: `email:recruitment:${recruitmentId}:${staffId}`,
          shopId,
          recruitmentId,
          staffId,
          payload: emailPayload,
          attemptCount: 1,
          nextRunAt: now,
          processingStartedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return { recruitmentId, outboxId };
      });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "delivery failed" });

      const [events, failures] = await Promise.all([
        t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
        collectFailureInbox(t),
      ]);
      expect(events[0]).toMatchObject({
        eventType: "final_failed",
        recruitmentId,
        outboxId,
      });
      expect(failures[0]).toMatchObject({
        sourceType: "outbox",
        recruitmentId,
        outboxId,
        lastError: "notification_delivery_failed",
      });
    });
  });

  it("dueなジョブをclaimするとprocessingになりattemptCountが進む", async () => {
    const { t, shopId, staffId } = await setupShop();
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:claim",
      payload: emailPayload,
    });

    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe("processing");
    expect(claimed[0].attemptCount).toBe(1);
    expect(claimed[0].leaseToken).toEqual(expect.any(String));
    expect(claimed[0].leaseExpiresAt).toBe(
      Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
    );
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs[0].status).toBe("processing");
  });

  it("有効なleaseは再claimせず、期限到達後は同じジョブを新しいtokenで回収する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:lease-reclaim",
      payload: emailPayload,
    });
    if (!enqueued) throw new Error("notification was not enqueued");

    const claimAt = Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS;
    const [first] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: claimAt });
    if (!first?.leaseToken || first.leaseExpiresAt === undefined) throw new Error("lease was not issued");

    await expect(
      t.mutation(internal.notificationOutbox.mutations.claimDue, { now: first.leaseExpiresAt - 1 }),
    ).resolves.toEqual([]);

    const [reclaimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: first.leaseExpiresAt,
    });
    expect(reclaimed).toMatchObject({ _id: enqueued.outboxId, status: "processing", attemptCount: 2 });
    expect(reclaimed.leaseToken).toEqual(expect.any(String));
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken);
    expect(reclaimed.leaseExpiresAt).toBe(first.leaseExpiresAt + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS);
  });

  it("lease fieldsのない旧processing行もprocessingStartedAtから期限判定して回収する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const { expiredOutboxId, liveOutboxId } = await t.run(async (ctx) => {
      const expiredOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:legacy-processing-lease",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 1,
        nextRunAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
        processingStartedAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
        createdAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
        updatedAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
      });
      const liveOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:legacy-live-processing-lease",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 1,
        nextRunAt: now,
        processingStartedAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS + 1,
        createdAt: now,
        updatedAt: now,
      });
      return { expiredOutboxId, liveOutboxId };
    });

    const [reclaimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now });

    expect(reclaimed).toMatchObject({ _id: expiredOutboxId, status: "processing", attemptCount: 2 });
    expect(reclaimed.leaseToken).toEqual(expect.any(String));
    expect(reclaimed.leaseExpiresAt).toBe(now + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS);
    expect(await t.run(async (ctx) => await ctx.db.get(liveOutboxId))).toMatchObject({
      status: "processing",
      attemptCount: 1,
      processingStartedAt: now - NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS + 1,
    });
  });

  it("再claim前のworkerはprepareと全完了更新を行えず、現在tokenだけが確定できる", async () => {
    const { t, shopId, staffId } = await setupShop();
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      history: { notificationKind: "test.email", displayTitle: emailPayload.subject },
      dedupeKey: "email:test:lease-fencing",
      payload: emailPayload,
    });
    if (!enqueued) throw new Error("notification was not enqueued");

    const [first] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });
    if (!first?.leaseToken || first.leaseExpiresAt === undefined) throw new Error("first lease was not issued");
    const [current] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: first.leaseExpiresAt,
    });
    if (!current?.leaseToken) throw new Error("current lease was not issued");

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: first.leaseToken,
        now: first.leaseExpiresAt,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.notificationOutbox.mutations.markRetry, {
        outboxId: enqueued.outboxId,
        leaseToken: first.leaseToken,
        lastError: "stale retry",
        nextRunAt: first.leaseExpiresAt + 1,
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.markFailed, {
        outboxId: enqueued.outboxId,
        leaseToken: first.leaseToken,
        lastError: "stale failure",
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.markSent, {
        outboxId: enqueued.outboxId,
        leaseToken: first.leaseToken,
      }),
    ).resolves.toBe(false);

    expect(await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect())).toEqual([]);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: current.leaseToken,
        now: first.leaseExpiresAt,
      }),
    ).resolves.toMatchObject({ _id: enqueued.outboxId, leaseToken: current.leaseToken });
    await expect(
      t.mutation(internal.notificationOutbox.mutations.markSent, {
        outboxId: enqueued.outboxId,
        leaseToken: current.leaseToken,
      }),
    ).resolves.toBe(true);

    const job = await t.run(async (ctx) => await ctx.db.get(enqueued.outboxId));
    expect(job).toMatchObject({ status: "sent", attemptCount: 2 });
    expect(job?.processingStartedAt).toBeUndefined();
    expect(job?.leaseToken).toBeUndefined();
    expect(job?.leaseExpiresAt).toBeUndefined();
  });

  it("recordDeliveryEventはOutbox投入失敗と投入準備失敗を要対応Inbox化する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-07",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    });

    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId,
      recruitmentId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:enqueue-failed",
      notificationContext: "test.enqueue",
      errorMessage: "notification_enqueue_failed",
    });
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId,
      recruitmentId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:preparation-failed",
      notificationContext: "test.preparation",
      errorMessage: "preparation failed",
      errorName: "PreparationError",
    });
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "retry_scheduled",
      shopId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:retry-event",
      notificationContext: "test.retry",
      errorMessage: "retry",
    });
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "fallback_enqueued",
      shopId,
      staffId,
      channel: "line",
      dedupeKey: "line:test:fallback",
      notificationContext: "test.fallback",
      errorMessage: "fallback",
    });

    const failures = await collectFailureInbox(t);
    expect(failures).toHaveLength(2);
    expect(failures.find((failure) => failure.sourceType === "enqueue")).toMatchObject({
      failureKey: `enqueue:${shopId}:email:test:enqueue-failed`,
      sourceType: "enqueue",
      status: "open",
      shopId,
      recruitmentId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:enqueue-failed",
      notificationContext: "test.enqueue",
      lastError: "notification_enqueue_failed",
    });
    expect(failures.find((failure) => failure.sourceType === "enqueue_preparation")).toMatchObject({
      failureKey: `enqueue_preparation:${shopId}:email:test:preparation-failed`,
      sourceType: "enqueue_preparation",
      status: "open",
      shopId,
      recruitmentId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:preparation-failed",
      notificationContext: "test.preparation",
      lastError: "notification_preparation_failed",
    });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.find((event) => event.eventType === "enqueue_preparation_failed")).toMatchObject({
      recruitmentId,
      errorMessage: "notification_preparation_failed",
    });
  });

  it("recordDeliveryEventは抑止対象contextでも配送イベントを残し、要対応Inbox化しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const dedupeKey = "email:notificationFailureReminder:shop_test:user_test";

    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
      errorMessage: "notification_enqueue_failed",
    });

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "enqueue_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
      errorMessage: "notification_enqueue_failed",
    });
    expect(await collectFailureInbox(t)).toEqual([]);
  });

  it.each(["enqueue_failed", "enqueue_preparation_failed"] as const)(
    "recordDeliveryEventは店舗登録後リマインダーcontextの%sを要対応Inbox化しない",
    async (eventType) => {
      const { t, shopId, staffId } = await setupShop();
      const dedupeKey = `email:shopActivationReminder:${shopId}:user_test`;

      await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
        eventType,
        shopId,
        staffId,
        channel: "email",
        dedupeKey,
        notificationContext: SHOP_ACTIVATION_REMINDER_CONTEXT,
        errorMessage:
          eventType === "enqueue_failed" ? "notification_enqueue_failed" : "notification_preparation_failed",
      });

      const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType,
        shopId,
        staffId,
        channel: "email",
        dedupeKey,
        notificationContext: SHOP_ACTIVATION_REMINDER_CONTEXT,
        errorMessage:
          eventType === "enqueue_failed" ? "notification_enqueue_failed" : "notification_preparation_failed",
      });
      expect(await collectFailureInbox(t)).toEqual([]);
    },
  );

  it("recordDeliveryEventは通知不達リマインダーLINEのdedupe由来contextでも要対応Inbox化しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const dedupeKey = "line:notificationFailureReminder:shop_test:user_test";

    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId,
      staffId,
      channel: "line",
      dedupeKey,
      errorMessage: "notification_enqueue_failed",
    });

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "enqueue_failed",
      shopId,
      staffId,
      channel: "line",
      dedupeKey,
      errorMessage: "notification_enqueue_failed",
    });
    expect(await collectFailureInbox(t)).toEqual([]);
  });

  it.each([
    ["email.failed", "failed", "email_delivery_failed"],
    ["email.bounced", "bounced", "email_delivery_bounced"],
    ["email.suppressed", "suppressed", "email_delivery_suppressed"],
  ] as const)(
    "recordResendProviderIssueはhard failureの%sを即時にprovider失敗として要対応Inbox化する",
    async (eventType, deliveryStatus, errorCode) => {
      const { t, shopId, staffId } = await setupShop();
      const recruitmentId = await insertRecruitment(t, shopId);
      const outboxId = await insertSentEmailOutbox(t, {
        shopId,
        staffId,
        recruitmentId,
        dedupeKey: `email:recruitment:${recruitmentId}:${staffId}`,
        context: "notification.sendRecruitmentNotificationEmails",
        resendEmailId: `email_${eventType}`,
      });

      await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
        providerEventId: `svix_${eventType}`,
        providerEventType: eventType,
        providerEmailId: `email_${eventType}`,
        occurredAt: Date.now() + 1000,
        errorMessage: errorCode,
      });

      const [events, failures, outbox] = await Promise.all([
        t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
        collectFailureInbox(t),
        t.run(async (ctx) => await ctx.db.get(outboxId)),
      ]);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "provider_delivery_issue",
        provider: "resend",
        providerEventId: `svix_${eventType}`,
        providerEmailId: `email_${eventType}`,
        providerEventType: eventType,
        shopId,
        recruitmentId,
        staffId,
        outboxId,
        channel: "email",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        errorMessage: errorCode,
      });
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        failureKey: `logical:${shopId}:${recruitmentId}:${staffId}:recruitment`,
        sourceType: "provider",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        outboxId,
        channel: "email",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        lastEventId: events[0]._id,
        lastError: errorCode,
      });
      expect(outbox).toMatchObject({
        status: "sent",
        resendLastEventType: eventType,
        resendDeliveryStatus: deliveryStatus,
      });
      expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    },
  );

  it("recordResendProviderIssueは最初のdelivery_delayedを30分状態にし、重複eventで期限を延長しない", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await insertRecruitment(t, shopId);
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      recruitmentId,
      dedupeKey: `email:recruitment:${recruitmentId}:${staffId}`,
      context: "notification.sendRecruitmentNotificationEmails",
      resendEmailId: "email_delayed_grace",
    });
    const firstOccurredAt = Date.now();

    const first = await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_grace_first",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_grace",
      occurredAt: firstOccurredAt,
      errorMessage: "保存しないprovider message",
    });
    vi.setSystemTime(firstOccurredAt + 60_000);
    const repeated = await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_grace_repeated",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_grace",
      occurredAt: Date.now(),
      errorMessage: "保存しないprovider message",
    });

    expect(first).toEqual({ recorded: true, inboxed: false, reason: "delayedGrace" });
    expect(repeated).toEqual({ recorded: true, inboxed: false, reason: "delayedGrace" });
    expect(await collectFailureInbox(t)).toEqual([]);
    const deadlines = await collectResendDelayedFailureDeadlines(t);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]).toMatchObject({
      outboxId,
      dueAt: firstOccurredAt + RESEND_DELAYED_FAILURE_GRACE_MS,
      createdAt: firstOccurredAt,
    });
    const outbox = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(outbox).toMatchObject({
      resendLastEventType: "email.delivery_delayed",
      resendLastEventAt: firstOccurredAt + 60_000,
      resendDeliveryStatus: "delivery_delayed",
    });
  });

  it("delivery_delayedの猶予中にhard failureを受けると期限を消して即時に要対応化する", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_delayed_then_failed",
    });
    const delayedAt = Date.now();
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_then_failed_delayed",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_then_failed",
      occurredAt: delayedAt,
      errorMessage: "delayed",
    });

    vi.setSystemTime(delayedAt + 60_000);
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_then_failed_failed",
      providerEventType: "email.failed",
      providerEmailId: "email_delayed_then_failed",
      occurredAt: Date.now(),
      errorMessage: "failed",
    });

    expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    expect(await collectFailureInbox(t)).toEqual([
      expect.objectContaining({
        sourceType: "provider",
        status: "open",
        outboxId,
        lastError: "email_delivery_failed",
        lastFailedAt: delayedAt + 60_000,
      }),
    ]);
  });

  it("delivery_delayedの猶予中にdeliveredを受けると期限を消し、期限後も要対応化しない", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_delayed_then_delivered",
    });
    const delayedAt = Date.now();
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_then_delivered_delayed",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_then_delivered",
      occurredAt: delayedAt,
      errorMessage: "delayed",
    });
    vi.setSystemTime(delayedAt + 60_000);
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate, {
      providerEventId: "svix_delayed_then_delivered_delivered",
      providerEventType: "email.delivered",
      providerEmailId: "email_delayed_then_delivered",
      occurredAt: Date.now(),
    });

    vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS + 1);
    await t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {});

    expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    expect(await collectFailureInbox(t)).toEqual([]);
    expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).toMatchObject({
      status: "sent",
      resendLastEventAt: delayedAt + 60_000,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).not.toHaveProperty("resendDeliveryStatus");
  });

  it("recoverOverdueResendDelayedFailuresは30分ちょうどで一度だけFailureInboxへ昇格する", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_delayed_exact_boundary",
    });
    const delayedAt = Date.now();
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_exact_boundary",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_exact_boundary",
      occurredAt: delayedAt,
      errorMessage: "delayed",
    });

    vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS - 1);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
    ).resolves.toEqual({ processedCount: 0, promotedCount: 0 });
    expect(await collectFailureInbox(t)).toEqual([]);
    expect(await collectResendDelayedFailureDeadlines(t)).toHaveLength(1);

    vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
    ).resolves.toEqual({ processedCount: 1, promotedCount: 1 });
    expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    expect(await collectFailureInbox(t)).toEqual([
      expect.objectContaining({
        sourceType: "provider",
        status: "open",
        outboxId,
        lastFailedAt: delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS,
        lastError: "email_delivery_delayed",
      }),
    ]);

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
    ).resolves.toEqual({ processedCount: 0, promotedCount: 0 });
    expect(await collectFailureInbox(t)).toHaveLength(1);
  });

  it("期限回収後に遅れて到着した新しいdeliveredはprovider発生時刻が回収前でもFailureInboxを解消する", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_delayed_recovered_then_delivered",
    });
    const delayedAt = Date.now();
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_recovered_then_delivered_delayed",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_recovered_then_delivered",
      occurredAt: delayedAt,
      errorMessage: "delayed",
    });

    const recoveredAt = delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS;
    vi.setSystemTime(recoveredAt);
    await t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {});
    expect(await collectFailureInbox(t)).toEqual([
      expect.objectContaining({ sourceType: "provider", status: "open", lastFailedAt: recoveredAt }),
    ]);

    // providerでは期限前にdelivered済みだが、Webhookが期限回収後に到着した順序逆転を再現する。
    vi.setSystemTime(recoveredAt + 60_000);
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate, {
      providerEventId: "svix_delayed_recovered_then_delivered_delivered",
      providerEventType: "email.delivered",
      providerEmailId: "email_delayed_recovered_then_delivered",
      occurredAt: recoveredAt - 60_000,
    });

    expect(await collectFailureInbox(t)).toEqual([
      expect.objectContaining({
        sourceType: "provider",
        status: "resolved",
        resolutionKind: "sent",
        outboxId,
      }),
    ]);
    expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).not.toHaveProperty("resendDeliveryStatus");
  });

  it("recoverOverdueResendDelayedFailuresは新しいprovider状態でstaleになった期限を破棄する", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_delayed_stale_recovery",
    });
    const delayedAt = Date.now();
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_delayed_stale_recovery",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_delayed_stale_recovery",
      occurredAt: delayedAt,
      errorMessage: "delayed",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(outboxId, {
        resendLastEventType: undefined,
        resendDeliveryStatus: undefined,
        resendLastEventAt: delayedAt + 1,
      });
    });

    vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS);
    await expect(
      t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
    ).resolves.toEqual({ processedCount: 1, promotedCount: 0 });
    expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    expect(await collectFailureInbox(t)).toEqual([]);
  });

  it.each([
    ["suppressFailureInbox", true],
    ["shopless", false],
  ] as const)(
    "recoverOverdueResendDelayedFailuresは%sのdelayed期限を消すがFailureInboxへ出さない",
    async (kind, suppressFailureInbox) => {
      vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
      const { t, shopId, staffId } = await setupShop();
      const delayedAt = Date.now();
      const outboxId = await t.run(async (ctx) => {
        if (kind === "suppressFailureInbox") {
          return await ctx.db.insert("notificationOutbox", {
            channel: "email",
            status: "sent",
            dedupeKey: "email:test:delayed-suppressed-recovery",
            shopId,
            staffId,
            payload: { ...emailPayload, suppressFailureInbox },
            attemptCount: 1,
            nextRunAt: delayedAt,
            sentAt: delayedAt,
            resendEmailId: "email_delayed_suppressed_recovery",
            createdAt: delayedAt,
            updatedAt: delayedAt,
          });
        }
        return await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: "email:test:delayed-shopless-recovery",
          payload: {
            kind: "organizationManagerInvitationEmail",
            from: "シフトリ <noreply@example.com>",
            to: "manager@example.com",
            context: "organizationInvitation.managerInvite",
          },
          attemptCount: 1,
          nextRunAt: delayedAt,
          sentAt: delayedAt,
          resendEmailId: "email_delayed_shopless_recovery",
          createdAt: delayedAt,
          updatedAt: delayedAt,
        });
      });
      await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
        providerEventId: `svix_delayed_${kind}_recovery`,
        providerEventType: "email.delivery_delayed",
        providerEmailId:
          kind === "suppressFailureInbox" ? "email_delayed_suppressed_recovery" : "email_delayed_shopless_recovery",
        occurredAt: delayedAt,
        errorMessage: "delayed",
      });
      expect(await collectResendDelayedFailureDeadlines(t)).toEqual([expect.objectContaining({ outboxId })]);

      vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS);
      await expect(
        t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
      ).resolves.toEqual({ processedCount: 1, promotedCount: 0 });
      expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
      expect(await collectFailureInbox(t)).toEqual([]);
    },
  );

  it.each(["shop", "staff"] as const)(
    "recoverOverdueResendDelayedFailuresは猶予中に%sが削除された通知を要対応へ復活させない",
    async (deletedScope) => {
      vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
      const { t, shopId, staffId } = await setupShop();
      const outboxId = await insertSentEmailOutbox(t, {
        shopId,
        staffId,
        resendEmailId: `email_delayed_deleted_${deletedScope}`,
      });
      const delayedAt = Date.now();
      await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
        providerEventId: `svix_delayed_deleted_${deletedScope}`,
        providerEventType: "email.delivery_delayed",
        providerEmailId: `email_delayed_deleted_${deletedScope}`,
        occurredAt: delayedAt,
        errorMessage: "delayed",
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(deletedScope === "shop" ? shopId : staffId, { isDeleted: true });
      });

      vi.setSystemTime(delayedAt + RESEND_DELAYED_FAILURE_GRACE_MS);
      await expect(
        t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
      ).resolves.toEqual({ processedCount: 1, promotedCount: 0 });
      expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
      expect(await collectFailureInbox(t)).toEqual([]);
      expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).toMatchObject({
        resendDeliveryStatus: "delivery_delayed",
      });
    },
  );

  it("recoverOverdueResendDelayedFailuresはbatch上限の100件ずつ処理し、継続を予約する", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let index = 0; index < RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE + 1; index++) {
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:test:delayed-recovery-batch:${index}`,
          shopId,
          staffId,
          payload: emailPayload,
          attemptCount: 1,
          nextRunAt: now,
          sentAt: now,
          resendEmailId: `email_delayed_recovery_batch_${index}`,
          resendLastEventType: "email.delivery_delayed",
          resendLastEventAt: now - RESEND_DELAYED_FAILURE_GRACE_MS,
          resendDeliveryStatus: "delivery_delayed",
          createdAt: now - RESEND_DELAYED_FAILURE_GRACE_MS,
          updatedAt: now,
        });
        await ctx.db.insert("notificationResendDelayedFailureDeadlines", {
          outboxId,
          dueAt: now,
          createdAt: now - RESEND_DELAYED_FAILURE_GRACE_MS,
        });
      }
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {}),
    ).resolves.toEqual({
      processedCount: RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE,
      promotedCount: RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE,
    });
    const state = await t.run(async (ctx) => ({
      deadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      failures: await ctx.db.query("notificationFailureInbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.deadlines).toHaveLength(1);
    expect(state.failures).toHaveLength(RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE);
    expect(
      state.scheduled.some((job) => job.name === "notificationOutbox/mutations:recoverOverdueResendDelayedFailures"),
    ).toBe(true);
  });

  it("deadlineがないlegacy delivery_delayedは次のdelayed eventで即時に要対応のままとする", async () => {
    vi.setSystemTime(new Date("2026-06-22T05:23:00.000Z"));
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_legacy_delayed",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(outboxId, {
        resendLastEventType: "email.delivery_delayed",
        resendLastEventAt: Date.now() - 60_000,
        resendDeliveryStatus: "delivery_delayed",
      });
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_legacy_delayed_repeated",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_legacy_delayed",
      occurredAt: Date.now(),
      errorMessage: "delayed",
    });

    expect(result).toMatchObject({ recorded: true, inboxed: true });
    expect(await collectResendDelayedFailureDeadlines(t)).toEqual([]);
    expect(await collectFailureInbox(t)).toEqual([
      expect.objectContaining({ sourceType: "provider", status: "open", outboxId }),
    ]);
  });

  it("recordResendProviderIssueは同じsvix-idを二重作成しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_duplicate",
    });
    const args = {
      providerEventId: "svix_duplicate",
      providerEventType: "email.delivery_delayed" as const,
      providerEmailId: "email_duplicate",
      occurredAt: Date.now(),
      errorMessage: "Resend reported email delivery delayed",
    };

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, args);
    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, args);

    const [events, failures, deadlines] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      collectFailureInbox(t),
      collectResendDelayedFailureDeadlines(t),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ providerEventId: "svix_duplicate", outboxId });
    expect(failures).toEqual([]);
    expect(deadlines).toEqual([expect.objectContaining({ outboxId })]);
  });

  it("recordResendProviderIssueはoutbox照合できないイベントをFailureInboxに出さない", async () => {
    const { t } = await setupShop();

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_missing_outbox",
      providerEventType: "email.failed",
      providerEmailId: "email_missing",
      occurredAt: Date.now(),
      errorMessage: "email_delivery_failed",
    });

    const [events, failures] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      collectFailureInbox(t),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "provider_delivery_issue",
      provider: "resend",
      providerEventId: "svix_missing_outbox",
      providerEmailId: "email_missing",
      providerEventType: "email.failed",
    });
    expect(failures).toEqual([]);
  });

  it("recordResendProviderIssueはshiftori_outbox_id tagからoutboxを復元できる", async () => {
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      dedupeKey: "email:test:provider-tag",
    });

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_tag_fallback",
      providerEventType: "email.bounced",
      providerEmailId: "email_from_tag",
      outboxIdTag: outboxId,
      occurredAt: Date.now(),
      errorMessage: "Resend reported email bounced",
    });

    const [failures, outbox] = await Promise.all([
      collectFailureInbox(t),
      t.run(async (ctx) => await ctx.db.get(outboxId)),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      sourceType: "provider",
      outboxId,
      channel: "email",
      dedupeKey: "email:test:provider-tag",
    });
    expect(outbox?.resendEmailId).toBe("email_from_tag");
  });

  it("recordResendProviderIssueはsuppressFailureInboxのoutboxを要対応Inbox化しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      resendEmailId: "email_suppressed_inbox",
      suppressFailureInbox: true,
    });

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_suppressed_inbox",
      providerEventType: "email.suppressed",
      providerEmailId: "email_suppressed_inbox",
      occurredAt: Date.now(),
      errorMessage: "Resend reported email suppressed",
    });

    const [events, failures] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      collectFailureInbox(t),
    ]);
    expect(events).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  it("recordResendProviderIssueは店舗登録後リマインダーcontextを要対応Inbox化しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await insertSentEmailOutbox(t, {
      shopId,
      staffId,
      dedupeKey: `email:shopActivationReminder:${shopId}:user_test`,
      context: SHOP_ACTIVATION_REMINDER_CONTEXT,
      resendEmailId: "email_shop_activation_reminder",
    });

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_shop_activation_reminder",
      providerEventType: "email.failed",
      providerEmailId: "email_shop_activation_reminder",
      occurredAt: Date.now(),
      errorMessage: "email_delivery_failed",
    });

    const [events, failures, outbox] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      collectFailureInbox(t),
      t.run(async (ctx) => await ctx.db.get(outboxId)),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "provider_delivery_issue",
      provider: "resend",
      providerEventId: "svix_shop_activation_reminder",
      providerEmailId: "email_shop_activation_reminder",
      providerEventType: "email.failed",
      outboxId,
      shopId,
      channel: "email",
      notificationContext: SHOP_ACTIVATION_REMINDER_CONTEXT,
      errorMessage: "email_delivery_failed",
    });
    expect(outbox).toMatchObject({
      status: "sent",
      resendLastEventType: "email.failed",
      resendDeliveryStatus: "failed",
    });
    expect(failures).toEqual([]);
  });

  it("recordDeliveryEventは解決済みの投入準備失敗を再発時にopenへ戻す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const dedupeKey = "email:test:preparation-reopen";

    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: "line.sendInviteEmail",
      errorMessage: "first",
    });
    const failureId = (await collectFailureInbox(t))[0]._id;
    await t.withIdentity({ subject: "user_mgr" }).mutation(api.notificationOutbox.mutations.resolveFailure, {
      failureId,
      shopId,
    });

    vi.advanceTimersByTime(1000);
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: "line.sendInviteEmail",
      errorMessage: "second",
    });

    const failures = await collectFailureInbox(t);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      _id: failureId,
      status: "open",
      lastError: "notification_preparation_failed",
    });
    expect(failures[0].resolvedAt).toBeUndefined();
    expect(failures[0].resolutionKind).toBeUndefined();
  });

  it.each(["overLimit", "unknown"] as const)("利用状態が%sでも通知失敗の解決だけは実行できる", async (usageState) => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: `resolve_failure_${usageState}`,
        plan: "free",
      });
      const now = Date.now();
      const staffId = await seedStaff(ctx, {
        shopId: base.shopId,
        name: "通知失敗の整理対象",
        email: `resolve-failure-${usageState}@example.com`,
      });
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `resolve-failure-${usageState}`,
        sourceType: "enqueue",
        status: "open",
        shopId: base.shopId,
        staffId,
        channel: "email",
        dedupeKey: `resolve-failure-${usageState}`,
        notificationContext: "line.sendInviteEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      if (usageState === "overLimit") {
        await seedCountedStaffForUsageLimit(ctx, {
          shopId: base.shopId,
          prefix: "resolve-failure-over-limit-",
          count: 4,
        });
      } else {
        for (let index = 0; index < 99; index += 1) {
          const email = `resolve-failure-unknown-${index}@example.com`;
          await ctx.db.insert("organizationPeople", {
            organizationId: base.organizationId,
            name: `利用状態未確定人物${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      return { ...base, failureId };
    });
    const asManager = t.withIdentity({ subject: `resolve_failure_${usageState}` });

    await expect(
      asManager.mutation(api.notificationOutbox.mutations.retryFailure, {
        shopId: ids.shopId,
        failureId: ids.failureId,
      }),
    ).rejects.toMatchObject({
      data: {
        code: usageState === "unknown" ? "USAGE_LIMIT_EVALUATION_UNAVAILABLE" : "USAGE_LIMIT_EXCEEDED",
      },
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.failureId))).toMatchObject({ status: "open" });

    await expect(
      asManager.mutation(api.notificationOutbox.mutations.resolveFailure, {
        shopId: ids.shopId,
        failureId: ids.failureId,
      }),
    ).resolves.toEqual({ resolved: true });

    const failure = await t.run(async (ctx) => await ctx.db.get(ids.failureId));
    expect(failure).toMatchObject({ status: "resolved", resolutionKind: "dismissed" });
  });

  it("retryFailureは他店舗の失敗をNot foundにし、対象outboxをpendingに戻す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:manual-retry",
        shopId,
        staffId,
        payload: emailPayload,
        attemptCount: 3,
        nextRunAt: now,
        processingStartedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "failed once" });
    const failureId = (await collectFailureInbox(t))[0]._id;
    const otherShopId = await t.run(async (ctx) => {
      const other = await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
      return other.shopId;
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.retryFailure, {
        failureId,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.retryFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(outboxId),
      failure: await ctx.db.get(failureId),
    }));
    expect(state.job).toMatchObject({ status: "pending", attemptCount: 0 });
    expect(state.job?.lastError).toBeUndefined();
    expect(state.job?.failedAt).toBeUndefined();
    expect(state.job?.processingStartedAt).toBeUndefined();
    expect(state.job?.nextRunAt).toBeTypeOf("number");
    expect(state.failure).toMatchObject({
      status: "retrying",
      retryRequestedByUserId: expect.any(String),
    });
    expect(state.failure?.retryRequestedAt).toBeTypeOf("number");
    const openPage = await t
      .withIdentity({ subject: "user_mgr" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        shopId,
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(0);
  });

  it("payloadRedacted済みOutboxのretryはquota消費と副作用なしでInboxをexpired解決する", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const { outboxId, failureId } = await t.run(async (ctx) => {
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: "email:test:redacted-manual-retry",
        shopId,
        staffId,
        notificationContext: "test.email",
        deliverySuppressed: true,
        payload: {
          kind: "email",
          from: "",
          to: "",
          subject: "",
          html: "",
          context: "test.email",
          suppressDelivery: true,
        },
        attemptCount: 3,
        nextRunAt: now,
        failedAt: now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
        terminalAt: now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
        payloadRedactedAt: now,
        createdAt: now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS,
        updatedAt: now,
      });
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${outboxId}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        staffId,
        outboxId,
        channel: "email",
        dedupeKey: "email:test:redacted-manual-retry",
        notificationContext: "test.email",
        firstFailedAt: now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
        lastFailedAt: now,
        attemptCount: 3,
        lastError: "notification_delivery_failed",
        errorName: "legacy_provider_error",
        createdAt: now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
        updatedAt: now,
      });
      return { outboxId, failureId };
    });
    const before = await t.run(async (ctx) => ({
      outbox: await ctx.db.get(outboxId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));

    await expect(
      t.withIdentity({ subject: "user_mgr" }).mutation(api.notificationOutbox.mutations.retryFailure, {
        failureId,
        shopId,
      }),
    ).resolves.toEqual({ scheduled: false, reason: "notRetryable" });

    const after = await t.run(async (ctx) => ({
      outbox: await ctx.db.get(outboxId),
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      deliveryEvents: await ctx.db.query("notificationDeliveryEvents").collect(),
      retryRateLimitRows: await ctx.db
        .query("rateLimits")
        .withIndex("name", (q) => q.eq("name", "notificationFailureRetryShort"))
        .collect(),
    }));
    expect(after.outbox).toEqual(before.outbox);
    expect(after.failure).toMatchObject({
      status: "resolved",
      resolvedAt: now,
      resolutionKind: "expired",
      sensitiveDataRedactedAt: now,
    });
    expect(after.failure?.lastError).toBeUndefined();
    expect(after.failure?.errorName).toBeUndefined();
    expect(after.scheduled).toEqual(before.scheduled);
    expect(after.deliveryEvents).toEqual([]);
    expect(after.retryRateLimitRows).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resendFailureは投入前失敗を対象通知actionに予約し、open一覧から外す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    });
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:recruitment",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:recruitment:retry-target",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
    });
    const otherShopId = await t.run(async (ctx) => {
      const other = await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
      return other.shopId;
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.resendFailure, {
        failureId,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, {
        failureId,
        shopId,
      });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({
      status: "retrying",
      retryRequestedByUserId: expect.any(String),
    });
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "notification/actions:sendRecruitmentNotificationForStaff" &&
          job.args[0]?.recruitmentId === recruitmentId &&
          job.args[0]?.staffId === staffId,
      ),
    ).toBe(true);
    const openPage = await t
      .withIdentity({ subject: "user_mgr" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        shopId,
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(0);
  });

  it("resendFailureは催促不達を個別催促actionに予約してretryingへ移す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await insertRecruitment(t, shopId);
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:reminder",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "line",
        dedupeKey: "line:reminder:retry-target",
        notificationContext: "notification.sendReminderEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({
      status: "retrying",
      retryRequestedByUserId: expect.any(String),
    });
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "notification/reminderActions:sendReminderEmailForStaff" &&
          job.args[0]?.recruitmentId === recruitmentId &&
          job.args[0]?.staffId === staffId,
      ),
    ).toBe(true);
  });

  it("resendFailureは確定通知の不達を対象スタッフの再通知actionに予約してretryingへ移す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await insertRecruitment(t, shopId);
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:confirmation",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:confirmation:retry-target",
        notificationContext: "notification.sendConfirmationEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({
      status: "retrying",
      retryRequestedAt: expect.any(Number),
      retryRequestedByUserId: expect.any(String),
    });
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "notification/actions:sendShiftConfirmationEmails" &&
          job.args[0]?.recruitmentId === recruitmentId &&
          job.args[0]?.isResend === true &&
          Array.isArray(job.args[0]?.targetStaffIds) &&
          job.args[0]?.targetStaffIds.length === 1 &&
          job.args[0]?.targetStaffIds[0] === staffId &&
          typeof job.args[0]?.notificationRunId === "number",
      ),
    ).toBe(true);
  });

  it("resendFailureは確定シフト再発行の不達を個別再発行actionに予約してretryingへ移す", async () => {
    const { t, shopId, staffId } = await setupShop();
    const recruitmentId = await insertRecruitment(t, shopId);
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:reissue",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:reissue:retry-target",
        notificationContext: "notification.sendReissueEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({
      status: "retrying",
      retryRequestedAt: expect.any(Number),
      retryRequestedByUserId: expect.any(String),
    });
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "notification/actions:sendReissueEmail" &&
          job.args[0]?.recruitmentId === recruitmentId &&
          job.args[0]?.staffId === staffId,
      ),
    ).toBe(true);
  });

  it("resendFailureはLINE連携案内の不達を連携依頼メール再送に予約する（募集なしでも可）", async () => {
    const { t, shopId, staffId } = await setupShop();
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "provider:resend:lineInvite",
        sourceType: "provider",
        status: "open",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: `email:lineInvite:${staffId}`,
        notificationContext: "line.sendInviteEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "bounced",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: true });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({ status: "retrying", retryRequestedByUserId: expect.any(String) });
    expect(
      state.scheduled.some((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId),
    ).toBe(true);
    const inviteJob = state.scheduled.find((job) => job.name === "line/actions:sendInviteEmail");
    expect(inviteJob?.args[0]).not.toHaveProperty("organizationPersonId");
    expect(inviteJob?.args[0]).not.toHaveProperty("lineLinkGenerationAtSchedule");
    const openPage = await t
      .withIdentity({ subject: "user_mgr" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        shopId,
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(0);
  });

  it("LINE案内再送はunlinked世代をsnapshotし、link後に再度unlinkedでも古い予約を送らない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "line_invite_resend_generation_manager",
        email: "line-invite-resend-generation-manager@example.com",
      });
      await ctx.db.patch(seeded.personId, { lineLinkGeneration: 2, updatedAt: Date.now() });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        name: "LINE案内再送世代スタッフ",
        email: "line-invite-resend-generation@example.com",
        emailNormalized: "line-invite-resend-generation@example.com",
        isDeleted: false,
      });
      const now = Date.now();
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "provider:resend:lineInvite-generation",
        sourceType: "provider",
        status: "open",
        shopId: seeded.shopId,
        staffId,
        channel: "email",
        dedupeKey: `email:lineInvite:${staffId}`,
        notificationContext: "line.sendInviteEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "bounced",
        createdAt: now,
        updatedAt: now,
      });
      return { ...seeded, staffId, failureId };
    });

    await expect(
      t
        .withIdentity({ subject: "line_invite_resend_generation_manager" })
        .mutation(api.notificationOutbox.mutations.resendFailure, {
          failureId: ids.failureId,
          shopId: ids.shopId,
        }),
    ).resolves.toEqual({ scheduled: true });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const inviteJob = scheduled.find((job) => job.name === "line/actions:sendInviteEmail");
    expect(inviteJob?.args[0]).toMatchObject({
      staffId: ids.staffId,
      organizationPersonId: ids.personId,
      lineLinkGenerationAtSchedule: 2,
    });

    await t.run(async (ctx) => {
      const linked = await seedOrganizationPersonLineLink(ctx, {
        organizationId: ids.organizationId,
        organizationPersonId: ids.personId,
        lineUserId: "U_line_invite_resend_generation",
        generation: 3,
      });
      const now = Date.now();
      await ctx.db.patch(linked.organizationPersonLineLinkId, { isDeleted: true, unlinkedAt: now });
      await ctx.db.patch(linked.lineProviderUserId, { isDeleted: true });
      await ctx.db.patch(ids.personId, { lineLinkGeneration: 4, updatedAt: now });
    });
    await t.action(internal.line.actions.sendInviteEmail, {
      staffId: ids.staffId,
      organizationPersonId: ids.personId,
      lineLinkGenerationAtSchedule: 2,
    });

    const effects = await t.run(async (ctx) => ({
      lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(effects).toEqual({ lineLinkTokens: [], outbox: [] });
  });

  it("LINE連携済みの案内再送はnotRetryableとして失敗を解決し、新規予約しない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "line_invite_resend_linked_manager" });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        name: "LINE連携済み再送対象",
        email: "line-invite-resend-linked@example.com",
        emailNormalized: "line-invite-resend-linked@example.com",
        isDeleted: false,
      });
      await seedCanonicalStaffLineRecipient(ctx, { staffId, lineUserId: "U_line_invite_resend_linked" });
      const now = Date.now();
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "provider:resend:lineInvite-linked",
        sourceType: "provider",
        status: "open",
        shopId: seeded.shopId,
        staffId,
        channel: "email",
        dedupeKey: `email:lineInvite:${staffId}`,
        notificationContext: "line.sendInviteEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "bounced",
        createdAt: now,
        updatedAt: now,
      });
      return { ...seeded, failureId };
    });

    await expect(
      t
        .withIdentity({ subject: "line_invite_resend_linked_manager" })
        .mutation(api.notificationOutbox.mutations.resendFailure, {
          failureId: ids.failureId,
          shopId: ids.shopId,
        }),
    ).resolves.toEqual({ scheduled: false, reason: "notRetryable" });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(ids.failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure).toMatchObject({ status: "resolved", resolutionKind: "superseded" });
    expect(state.scheduled).toEqual([]);
  });

  it("resendFailureはメール未登録スタッフのLINE連携案内を再送しない", async () => {
    const { t, shopId } = await setupShop();
    const staffWithoutEmailId = await t.run(async (ctx) => {
      return await ctx.db.insert("staffs", { shopId, name: "メールなしスタッフ", email: "", isDeleted: false });
    });
    const failureId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationFailureInbox", {
        failureKey: "provider:resend:lineInvite-noemail",
        sourceType: "provider",
        status: "open",
        shopId,
        staffId: staffWithoutEmailId,
        channel: "email",
        dedupeKey: `email:lineInvite:${staffWithoutEmailId}`,
        notificationContext: "line.sendInviteEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "bounced",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId, shopId });

    expect(result).toEqual({ scheduled: false, reason: "notRetryable" });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure?.status).toBe("open");
    expect(state.scheduled.some((job) => job.name === "line/actions:sendInviteEmail")).toBe(false);
  });

  it("resendFailureは募集終了した不達を再送しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:closed-recruitment",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:recruitment:closed-recruitment",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
      return { failureId };
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, { failureId: ids.failureId, shopId });

    expect(result).toEqual({ scheduled: false, reason: "notRetryable" });
    const state = await t.run(async (ctx) => ({
      failure: await ctx.db.get(ids.failureId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.failure?.status).toBe("open");
    expect(state.scheduled).toHaveLength(0);
  });

  it("resendOpenFailuresは同一スタッフのLINE連携案内をまとめて1回だけ予約する", async () => {
    const { t, shopId, staffId } = await setupShop();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const suffix of ["a", "b"]) {
        await ctx.db.insert("notificationFailureInbox", {
          failureKey: `provider:resend:lineInvite-${suffix}`,
          sourceType: "provider",
          status: "open",
          shopId,
          staffId,
          channel: "email",
          dedupeKey: `email:lineInvite:${staffId}`,
          notificationContext: "line.sendInviteEmail",
          firstFailedAt: now,
          lastFailedAt: now,
          lastError: "bounced",
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, { shopId });

    expect(result.scheduledCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system
        .query("_scheduled_functions")
        .collect()
        .then((jobs) => jobs.filter((job) => job.name === "line/actions:sendInviteEmail")),
    );
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.args[0]?.staffId).toBe(staffId);
  });

  it("resendOpenFailuresは現在店舗のopen失敗だけを一斉再通知する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const other = await seedManagerShop(ctx, {
        subject: "manager_other_bulk",
        email: "other-bulk@example.com",
        shopName: "別店舗",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      const currentFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:bulk-current",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:recruitment:bulk-current",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
      const otherStaffId = await ctx.db.insert("staffs", {
        shopId: other.shopId,
        name: "別店舗スタッフ",
        email: "other-staff@example.com",
        isDeleted: false,
      });
      const otherRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: other.shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const otherFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "enqueue_preparation:test:bulk-other",
        sourceType: "enqueue_preparation",
        status: "open",
        shopId: other.shopId,
        recruitmentId: otherRecruitmentId,
        staffId: otherStaffId,
        channel: "email",
        dedupeKey: "email:recruitment:bulk-other",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "preparation failed",
        createdAt: now,
        updatedAt: now,
      });
      return { currentFailureId, otherFailureId };
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, { shopId });

    expect(result.scheduledFailureIds).toEqual([ids.currentFailureId]);
    const failures = await t.run(async (ctx) => ({
      current: await ctx.db.get(ids.currentFailureId),
      other: await ctx.db.get(ids.otherFailureId),
    }));
    expect(failures.current?.status).toBe("retrying");
    expect(failures.other?.status).toBe("open");
  });

  it("resendOpenFailuresは既存形式の重複open行を最新1件だけ再通知し、古い行をsupersededにする", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      const oldOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: `email:recruitment:${recruitmentId}:${staffId}:resend:1`,
        shopId,
        recruitmentId,
        staffId,
        payload: { ...emailPayload, context: "notification.sendRecruitmentNotificationEmails" },
        attemptCount: 3,
        nextRunAt: now,
        failedAt: now - 2_000,
        createdAt: now - 2_000,
        updatedAt: now - 2_000,
      });
      const latestOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: `email:recruitment:${recruitmentId}:${staffId}:resend:2`,
        shopId,
        recruitmentId,
        staffId,
        payload: { ...emailPayload, context: "notification.sendRecruitmentNotificationEmails" },
        attemptCount: 3,
        nextRunAt: now,
        failedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const oldFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${oldOutboxId}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        outboxId: oldOutboxId,
        channel: "email",
        dedupeKey: `email:recruitment:${recruitmentId}:${staffId}:resend:1`,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now - 2_000,
        lastFailedAt: now - 2_000,
        lastError: "old failed",
        createdAt: now - 2_000,
        updatedAt: now - 2_000,
      });
      const latestFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${latestOutboxId}`,
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        outboxId: latestOutboxId,
        channel: "email",
        dedupeKey: `email:recruitment:${recruitmentId}:${staffId}:resend:2`,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "latest failed",
        createdAt: now,
        updatedAt: now,
      });
      return { recruitmentId, oldOutboxId, latestOutboxId, oldFailureId, latestFailureId };
    });

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, { shopId });

    expect(result).toMatchObject({
      scheduled: true,
      scheduledCount: 1,
      scheduledFailureIds: [ids.latestFailureId],
      skippedCount: 1,
    });
    const state = await t.run(async (ctx) => ({
      oldFailure: await ctx.db.get(ids.oldFailureId),
      latestFailure: await ctx.db.get(ids.latestFailureId),
      oldOutbox: await ctx.db.get(ids.oldOutboxId),
      latestOutbox: await ctx.db.get(ids.latestOutboxId),
    }));
    expect(state.oldFailure).toMatchObject({
      status: "resolved",
      resolutionKind: "superseded",
    });
    expect(state.latestFailure).toMatchObject({
      failureKey: `logical:${shopId}:${ids.recruitmentId}:${staffId}:recruitment`,
      status: "retrying",
      retryRequestedByUserId: expect.any(String),
    });
    expect(state.oldOutbox?.status).toBe("failed");
    expect(state.latestOutbox).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("m006 migrationは既存FailureInboxの重複openを最新1件に寄せ、未知contextは変更しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const ids = await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      const oldFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:migrate-old",
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        notificationContext: "notification.sendConfirmationEmail",
        firstFailedAt: now - 2_000,
        lastFailedAt: now - 2_000,
        lastError: "old failed",
        createdAt: now - 2_000,
        updatedAt: now - 2_000,
      });
      const latestFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:migrate-latest",
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        notificationContext: "notification.sendConfirmationEmail",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "latest failed",
        createdAt: now,
        updatedAt: now,
      });
      const unknownFailureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:unknown",
        sourceType: "outbox",
        status: "open",
        shopId,
        recruitmentId,
        staffId,
        channel: "email",
        dedupeKey: "email:unknown",
        notificationContext: "test.unknown",
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "unknown failed",
        createdAt: now,
        updatedAt: now,
      });
      return { recruitmentId, oldFailureId, latestFailureId, unknownFailureId };
    });

    await t.mutation(internal.migrations.m006_notification_failure_inbox_collapse_duplicates.migration, {
      cursor: null,
      dryRun: false,
    });
    await t.mutation(internal.migrations.m006_notification_failure_inbox_collapse_duplicates.migration, {
      cursor: null,
      dryRun: false,
    });

    const state = await t.run(async (ctx) => ({
      oldFailure: await ctx.db.get(ids.oldFailureId),
      latestFailure: await ctx.db.get(ids.latestFailureId),
      unknownFailure: await ctx.db.get(ids.unknownFailureId),
    }));
    expect(state.oldFailure).toMatchObject({
      status: "resolved",
      resolutionKind: "superseded",
    });
    expect(state.latestFailure).toMatchObject({
      failureKey: `logical:${shopId}:${ids.recruitmentId}:${staffId}:confirmation`,
      status: "open",
    });
    expect(state.unknownFailure).toMatchObject({
      failureKey: "outbox:unknown",
      status: "open",
      notificationContext: "test.unknown",
    });
  });

  it("resolveFailureは他店舗の失敗を拒否し、対象失敗をresolved/dismissedにする", async () => {
    const { t, shopId, staffId } = await setupShop();
    const outboxId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:manual-resolve",
        shopId,
        staffId,
        payload: { ...emailPayload, context: "line.sendInviteEmail" },
        attemptCount: 1,
        nextRunAt: now,
        processingStartedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "failed once" });
    const failureId = (await collectFailureInbox(t))[0]._id;
    const otherShopId = await t.run(async (ctx) => {
      const other = await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
      return other.shopId;
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.resolveFailure, {
        failureId,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resolveFailure, { failureId, shopId });

    expect(result).toEqual({ resolved: true });
    const failure = await t.run(async (ctx) => await ctx.db.get(failureId));
    expect(failure).toMatchObject({
      status: "resolved",
      resolutionKind: "dismissed",
      resolvedByUserId: expect.any(String),
    });
    expect(failure?.resolvedAt).toBeTypeOf("number");
  });

  it("resolveFailureはopenかつDashboard表示対象でない失敗を拒否する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const failureIds = await t.run(async (ctx) => {
      const now = Date.now();
      const closedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const common = {
        sourceType: "outbox" as const,
        shopId,
        staffId,
        channel: "email" as const,
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "failed",
        createdAt: now,
        updatedAt: now,
      };
      const retryingId = await ctx.db.insert("notificationFailureInbox", {
        ...common,
        failureKey: "outbox:resolve-retrying",
        status: "retrying",
        dedupeKey: "email:test:resolve-retrying",
        notificationContext: "line.sendInviteEmail",
        retryRequestedAt: now,
      });
      const resolvedId = await ctx.db.insert("notificationFailureInbox", {
        ...common,
        failureKey: "outbox:resolve-resolved",
        status: "resolved",
        dedupeKey: "email:test:resolve-resolved",
        notificationContext: "line.sendInviteEmail",
        resolvedAt: now,
        resolutionKind: "sent",
      });
      const notActionableId = await ctx.db.insert("notificationFailureInbox", {
        ...common,
        failureKey: "outbox:resolve-not-actionable",
        status: "open",
        dedupeKey: "email:test:resolve-not-actionable",
        notificationContext: "test.email",
      });
      const closedRecruitmentFailureId = await ctx.db.insert("notificationFailureInbox", {
        ...common,
        failureKey: "outbox:resolve-closed-recruitment",
        status: "open",
        recruitmentId: closedRecruitmentId,
        dedupeKey: "email:test:resolve-closed-recruitment",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      return [retryingId, resolvedId, notActionableId, closedRecruitmentFailureId];
    });

    for (const failureId of failureIds) {
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.notificationOutbox.mutations.resolveFailure, {
          failureId,
          shopId,
        }),
      ).rejects.toThrow("Not found");
    }

    const failures = await t.run(async (ctx) => await Promise.all(failureIds.map(async (id) => await ctx.db.get(id))));
    expect(failures.map((failure) => failure?.status)).toEqual(["retrying", "resolved", "open", "open"]);
  });

  it("保持期限を過ぎたsent/failed/cancelledだけpayloadと生errorをredactする", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const expiredAt = now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS - 1;
    const retainedAt = now - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS + 1;
    const sensitivePayload = {
      kind: "email" as const,
      from: "sender@example.com",
      to: "secret-recipient@example.com",
      subject: "secret subject",
      html: '<a href="https://app.example.com/shifts/view?token=capability-secret">open</a>',
      context: "notification.sendConfirmationEmail",
    };
    const ids = await t.run(async (ctx) => {
      const insert = async (
        dedupeKey: string,
        status: "pending" | "processing" | "sent" | "failed" | "cancelled",
        terminalAt: number,
      ) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status,
          dedupeKey,
          shopId,
          staffId,
          payload: sensitivePayload,
          attemptCount: 1,
          nextRunAt: terminalAt,
          lastError: `raw-error:${dedupeKey}:secret-recipient@example.com`,
          terminalAt,
          ...(status === "sent" ? { sentAt: terminalAt } : {}),
          ...(status === "failed" ? { failedAt: terminalAt } : {}),
          ...(status === "cancelled" ? { cancelledAt: terminalAt, cancelReason: "recipient_inactive" as const } : {}),
          createdAt: terminalAt,
          updatedAt: terminalAt,
        });
      return {
        expiredSentId: await insert("email:redact:sent", "sent", expiredAt),
        expiredFailedId: await insert("email:redact:failed", "failed", expiredAt),
        expiredCancelledId: await insert("email:redact:cancelled", "cancelled", expiredAt),
        retainedSentId: await insert("email:redact:retained", "sent", retainedAt),
        pendingId: await insert("email:redact:pending", "pending", expiredAt),
        processingId: await insert("email:redact:processing", "processing", expiredAt),
      };
    });

    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: 3,
    });
    const state = await t.run(async (ctx) => ({
      expired: await Promise.all([
        ctx.db.get(ids.expiredSentId),
        ctx.db.get(ids.expiredFailedId),
        ctx.db.get(ids.expiredCancelledId),
      ]),
      retainedSent: await ctx.db.get(ids.retainedSentId),
      pending: await ctx.db.get(ids.pendingId),
      processing: await ctx.db.get(ids.processingId),
    }));

    for (const job of state.expired) {
      expect(job).toMatchObject({
        notificationContext: "notification.sendConfirmationEmail",
        payload: { kind: "email", from: "", to: "", subject: "", html: "" },
        payloadRedactedAt: now,
      });
      expect(job?.lastError).toBeUndefined();
      expect(JSON.stringify(job)).not.toContain("capability-secret");
      expect(JSON.stringify(job)).not.toContain("secret-recipient@example.com");
    }
    for (const job of [state.retainedSent, state.pending, state.processing]) {
      expect(job?.payload).toEqual(sensitivePayload);
      expect(job?.payloadRedactedAt).toBeUndefined();
    }
    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: 0,
    });
  });

  it("terminal payload redactionをbounded batchで継続し再実行しても結果が変わらない", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const expiredAt = Date.now() - NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS - 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE + 1; i++) {
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:redact:batch:${i}`,
          shopId,
          staffId,
          payload: { ...emailPayload, to: `secret-${i}@example.com` },
          attemptCount: 1,
          nextRunAt: expiredAt,
          sentAt: expiredAt,
          terminalAt: expiredAt,
          createdAt: expiredAt,
          updatedAt: expiredAt,
        });
      }
    });

    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE,
    });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((job) => job.name === "notificationOutbox/mutations:redactExpiredTerminalData")).toBe(true);
    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: 1,
    });
    await expect(t.mutation(internal.notificationOutbox.mutations.redactExpiredTerminalData, {})).resolves.toEqual({
      redactedCount: 0,
    });
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE + 1);
    expect(jobs.every((job) => job.payloadRedactedAt === Date.now())).toBe(true);
  });

  it("最終失敗から30日を過ぎたFailureInboxだけをredactし、直近に再失敗した行を保持する", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const oldFailedAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS - 1;
    const freshLastFailedAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS + 1;
    const ids = await t.run(async (ctx) => {
      const oldOpenId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:old-open",
        sourceType: "outbox",
        status: "open",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:old-open",
        notificationContext: "test.email",
        firstFailedAt: oldFailedAt,
        lastFailedAt: oldFailedAt,
        lastError: "old open",
        createdAt: oldFailedAt,
        updatedAt: oldFailedAt,
      });
      const oldRetryingId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:old-retrying",
        sourceType: "outbox",
        status: "retrying",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:old-retrying",
        notificationContext: "test.email",
        firstFailedAt: oldFailedAt,
        lastFailedAt: oldFailedAt,
        lastError: "old retrying",
        retryRequestedAt: now - 1_000,
        createdAt: oldFailedAt,
        updatedAt: oldFailedAt,
      });
      const freshOpenId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:fresh-open",
        sourceType: "outbox",
        status: "open",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:fresh-open",
        notificationContext: "test.email",
        firstFailedAt: oldFailedAt,
        lastFailedAt: freshLastFailedAt,
        lastError: "fresh open",
        createdAt: oldFailedAt,
        updatedAt: freshLastFailedAt,
      });
      const resolvedId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: "outbox:resolved",
        sourceType: "outbox",
        status: "resolved",
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:resolved",
        notificationContext: "test.email",
        firstFailedAt: oldFailedAt,
        lastFailedAt: oldFailedAt,
        lastError: "resolved",
        resolvedAt: now - 1_000,
        resolutionKind: "dismissed",
        createdAt: oldFailedAt,
        updatedAt: now - 1_000,
      });
      return { oldOpenId, oldRetryingId, freshOpenId, resolvedId };
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.expireOldFailures, {});

    expect(result).toEqual({ expiredCount: 3 });
    const failures = await t.run(async (ctx) => ({
      oldOpen: await ctx.db.get(ids.oldOpenId),
      oldRetrying: await ctx.db.get(ids.oldRetryingId),
      freshOpen: await ctx.db.get(ids.freshOpenId),
      resolved: await ctx.db.get(ids.resolvedId),
    }));
    expect(failures.oldOpen).toMatchObject({
      status: "resolved",
      resolvedAt: now,
      resolutionKind: "expired",
      sensitiveDataRedactedAt: now,
    });
    expect(failures.oldRetrying).toMatchObject({
      status: "resolved",
      resolvedAt: now,
      resolutionKind: "expired",
      sensitiveDataRedactedAt: now,
    });
    expect(failures.oldOpen?.lastError).toBeUndefined();
    expect(failures.oldRetrying?.lastError).toBeUndefined();
    expect(failures.freshOpen).toMatchObject({
      status: "open",
      firstFailedAt: oldFailedAt,
      lastFailedAt: freshLastFailedAt,
      lastError: "fresh open",
    });
    expect(failures.freshOpen?.resolutionKind).toBeUndefined();
    expect(failures.freshOpen?.sensitiveDataRedactedAt).toBeUndefined();
    expect(failures.resolved).toMatchObject({
      status: "resolved",
      resolutionKind: "dismissed",
      resolvedAt: now - 1_000,
      sensitiveDataRedactedAt: now,
    });
    expect(failures.resolved?.lastError).toBeUndefined();
  });

  it("期限切れFailureInboxがbatch満杯なら期限切れ化の継続を予約する", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const oldFirstFailedAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS - 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE + 1; i++) {
        await ctx.db.insert("notificationFailureInbox", {
          failureKey: `outbox:expired-batch:${i}`,
          sourceType: "outbox",
          status: "open",
          shopId,
          staffId,
          channel: "email",
          dedupeKey: `email:test:expired-batch:${i}`,
          notificationContext: "test.email",
          firstFailedAt: oldFirstFailedAt,
          lastFailedAt: oldFirstFailedAt,
          lastError: "old",
          createdAt: oldFirstFailedAt,
          updatedAt: oldFirstFailedAt,
        });
      }
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.expireOldFailures, {});

    expect(result).toEqual({ expiredCount: NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE });
    const state = await t.run(async (ctx) => ({
      openFailures: await ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_status_firstFailedAt", (q) => q.eq("status", "open"))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.openFailures).toHaveLength(1);
    expect(state.scheduled.some((job) => job.name === "notificationOutbox/mutations:expireOldFailures")).toBe(true);
  });

  it("expired済みFailureInboxは再発時に再利用せず、新しいopen行として記録する", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const dedupeKey = "email:test:expired-reopen";

    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: "test.preparation",
      errorMessage: "first",
    });
    const firstFailure = (await collectFailureInbox(t))[0];
    await t.run(async (ctx) => {
      await ctx.db.patch(firstFailure._id, {
        status: "resolved",
        resolvedAt: Date.now(),
        resolutionKind: "expired",
      });
    });

    vi.advanceTimersByTime(1000);
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId,
      staffId,
      channel: "email",
      dedupeKey,
      notificationContext: "test.preparation",
      errorMessage: "second",
    });

    const failures = await collectFailureInbox(t);
    expect(failures).toHaveLength(2);
    expect(failures.find((failure) => failure._id === firstFailure._id)).toMatchObject({
      status: "resolved",
      resolutionKind: "expired",
      lastError: "notification_preparation_failed",
    });
    expect(failures.find((failure) => failure._id !== firstFailure._id)).toMatchObject({
      status: "open",
      lastError: "notification_preparation_failed",
    });
    expect(failures.find((failure) => failure._id !== firstFailure._id)?.resolutionKind).toBeUndefined();
  });

  it("期限切れの配送イベントだけを削除する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationDeliveryEvents", {
        eventType: "enqueue_failed",
        createdAt: now - NOTIFICATION_DELIVERY_EVENT_RETENTION_MS - 1,
        expiresAt: now - 1,
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:old",
        notificationContext: "test.email",
        errorMessage: "old",
      });
      await ctx.db.insert("notificationDeliveryEvents", {
        eventType: "enqueue_failed",
        createdAt: now,
        expiresAt: now + NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
        shopId,
        staffId,
        channel: "email",
        dedupeKey: "email:test:new",
        notificationContext: "test.email",
        errorMessage: "new",
      });
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.pruneExpiredEvents, {});

    expect(result).toEqual({ deletedCount: 1 });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0].dedupeKey).toBe("email:test:new");
  });

  it("期限切れ配送イベントがbatch満杯なら削除継続を予約する", async () => {
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE + 1; i++) {
        await ctx.db.insert("notificationDeliveryEvents", {
          eventType: "enqueue_failed",
          createdAt: now - NOTIFICATION_DELIVERY_EVENT_RETENTION_MS - 1,
          expiresAt: now - 1,
          shopId,
          staffId,
          channel: "email",
          dedupeKey: `email:test:expired:${i}`,
          notificationContext: "test.email",
          errorMessage: "old",
        });
      }
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.pruneExpiredEvents, {});

    expect(result).toEqual({ deletedCount: NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE });
    const remainingEvents = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(remainingEvents).toHaveLength(1);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((job) => job.name === "notificationOutbox/mutations:pruneExpiredEvents")).toBe(true);
  });
});
