import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_FANOUT_BATCH_SIZE, NOTIFICATION_FANOUT_PROCESSING_LEASE_MS } from "../constants";

describe("notification fanout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00+09:00"));
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("persisted scopeをbounded batchで進め、生存leaseと旧lease完了をfenceする", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffIds } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "fanout lease店舗");
      const staffIds: Id<"staffs">[] = [];
      for (let index = 0; index < NOTIFICATION_FANOUT_BATCH_SIZE + 1; index++) {
        staffIds.push(
          await ctx.db.insert("staffs", {
            shopId,
            name: `スタッフ${index}`,
            email: `fanout-${index}@example.com`,
            isDeleted: false,
          }),
        );
      }
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-02",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, recruitmentId, staffIds };
    });

    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");

    const first = await t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    expect(first).toMatchObject({
      state: "claimed",
      cursor: 0,
      targetStaffIds: [...staffIds].sort((left, right) => left.localeCompare(right)).slice(0, 10),
    });
    const busy = await t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    expect(busy).toEqual({ state: "busy" });
    if (first.state !== "claimed") throw new Error("first batch was not claimed");
    const firstStaffId = first.targetStaffIds[0];
    if (!firstStaffId) throw new Error("first fanout target was not claimed");

    vi.setSystemTime(Date.now() + NOTIFICATION_FANOUT_PROCESSING_LEASE_MS + 1);
    const recovered = await t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    if (recovered.state !== "claimed") throw new Error("expired fanout lease was not recovered");
    expect(recovered.cursor).toBe(0);
    expect(recovered.leaseToken).not.toBe(first.leaseToken);

    const staleEnqueue = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      recruitmentId,
      staffId: firstStaffId,
      history: { notificationKind: "shift.recruitment", displayTitle: "stale worker" },
      fanoutTargetKey: `fanout:shift.recruitment:v1:${recruitmentId}:${firstStaffId}`,
      fanoutOperationId: operationId,
      fanoutLeaseToken: first.leaseToken,
      legacyFanoutDedupeKeys: [
        `email:recruitment:${recruitmentId}:${firstStaffId}`,
        `line:recruitment:${recruitmentId}:${firstStaffId}`,
      ],
      dedupeAcrossTerminal: true,
      dedupeKey: `email:recruitment:${recruitmentId}:${firstStaffId}`,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "stale-worker@example.com",
        subject: "stale worker",
        html: "<p>stale worker</p>",
        context: "notification.sendRecruitmentNotificationEmails",
      },
    });
    expect(staleEnqueue).toBeNull();
    await expect(t.run(async (ctx) => ctx.db.query("notificationOutbox").collect())).resolves.toEqual([]);

    await expect(
      t.mutation(internal.notification.mutations.completeNotificationFanoutBatch, {
        operationId,
        leaseToken: first.leaseToken,
        expectedCursor: first.cursor,
      }),
    ).resolves.toEqual({ state: "stale" });
    await expect(
      t.mutation(internal.notification.mutations.completeNotificationFanoutBatch, {
        operationId,
        leaseToken: recovered.leaseToken,
        expectedCursor: recovered.cursor,
      }),
    ).resolves.toEqual({ state: "continued", cursor: NOTIFICATION_FANOUT_BATCH_SIZE });

    const operation = await t.run(async (ctx) => await ctx.db.get(operationId));
    expect(operation).toMatchObject({
      status: "pending",
      cursor: NOTIFICATION_FANOUT_BATCH_SIZE,
      targetStaffIds: [...staffIds].sort((left, right) => left.localeCompare(right)),
    });
  });

  it("回復処理は予約漏れpendingと期限切れprocessingだけをboundedに再予約する", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const seedOperation = async (label: string, status: "pending" | "processing", leaseExpiresAt?: number) => {
        const shopId = await seedShop(ctx, `${label}店舗`);
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: `${label}スタッフ`,
          email: `${label}@example.com`,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-02",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const operationId = await ctx.db.insert("notificationFanoutOperations", {
          operationKey: `shift.recruitment:recovery:${label}`,
          kind: "recruitment",
          purpose: "recruitment",
          recruitmentId,
          shopId,
          targetStaffIds: [staffId],
          cursor: 0,
          status,
          dedupeSuffix: "recruitment",
          ...(status === "processing" ? { leaseToken: `lease-${label}`, leaseExpiresAt: leaseExpiresAt ?? now } : {}),
          createdAt: now,
          updatedAt: now,
        });
        return operationId;
      };

      return {
        pending: await seedOperation("pending", "pending"),
        expired: await seedOperation("expired", "processing", now - 1),
        live: await seedOperation("live", "processing", now + NOTIFICATION_FANOUT_PROCESSING_LEASE_MS),
      };
    });

    await expect(t.mutation(internal.notification.mutations.recoverNotificationFanoutOperations, {})).resolves.toEqual({
      scheduledCount: 2,
      scheduledByStatus: { pending: 1, processing: 1 },
      reachedBatchLimit: false,
    });
    await expect(t.mutation(internal.notification.mutations.recoverNotificationFanoutOperations, {})).resolves.toEqual({
      scheduledCount: 0,
      scheduledByStatus: { pending: 0, processing: 0 },
      reachedBatchLimit: false,
    });
    const scheduledOperationIds = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter(
          (job) =>
            job.name === "notification/actions:sendRecruitmentNotificationEmails" &&
            (job.state.kind === "pending" || job.state.kind === "inProgress"),
        )
        .map((job) => job.args[0]?.fanoutOperationId)
        .sort(),
    );
    expect(scheduledOperationIds).toEqual([ids.pending, ids.expired].sort());

    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const recovered = await t.run(async (ctx) => ({
      pending: await ctx.db.get(ids.pending),
      expired: await ctx.db.get(ids.expired),
      live: await ctx.db.get(ids.live),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(recovered.pending).toMatchObject({ status: "completed", cursor: 1 });
    expect(recovered.expired).toMatchObject({ status: "completed", cursor: 1 });
    expect(recovered.live).toMatchObject({ status: "processing", cursor: 0, leaseToken: "lease-live" });
    expect(recovered.outbox).toHaveLength(2);
  });

  it("遅延した旧confirm jobは最新resend semantic operationと同じoutbox identityへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "legacy fanout店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "旧job対象",
        email: "legacy-fanout@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-02",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        lastConfirmationNotificationOperationKey: "semantic-confirmation-v1",
        lastConfirmationNotificationRunId: 7,
      });
      return { recruitmentId, staffId };
    });

    const operationId = await t.mutation(internal.notification.mutations.ensureConfirmationNotificationFanout, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: 7,
      operationKey: "semantic-confirmation-v1",
    });
    if (!operationId) throw new Error("confirmation fanout operation was not created");

    // deploy前から予約済みのshapeにはfanoutOperationIdがない。
    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: false,
    });
    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: 7,
      fanoutOperationId: operationId,
    });

    const state = await t.run(async (ctx) => ({
      operations: await ctx.db.query("notificationFanoutOperations").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      viewLinks: (await ctx.db.query("magicLinks").collect()).filter((link) => link.accessKind === "view"),
    }));
    expect(state.operations).toEqual([
      expect.objectContaining({
        _id: operationId,
        operationKey: "semantic-confirmation-v1",
        status: "completed",
        cursor: 1,
      }),
    ]);
    expect(state.outbox).toEqual([
      expect.objectContaining({
        staffId: ids.staffId,
        dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId}:resend:7`,
        fanoutTargetKey: `fanout:semantic-confirmation-v1:${ids.staffId}`,
        fanoutOperationId: operationId,
      }),
    ]);
    expect(state.viewLinks).toEqual([
      expect.objectContaining({
        staffId: ids.staffId,
        notificationOperationKey: "semantic-confirmation-v1",
      }),
    ]);
  });
});
