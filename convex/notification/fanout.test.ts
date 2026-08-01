import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_FANOUT_BATCH_SIZE,
  NOTIFICATION_FANOUT_CANCELLATION_BATCH_SIZE,
  NOTIFICATION_FANOUT_PROCESSING_LEASE_MS,
} from "../constants";
import { ensureNotificationFanoutOperation } from "./fanout";

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

  it("旧undefinedをsupersedingとして扱い、個別再送falseは全体fanoutと相互にsupersedeしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "fanout coexist店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "fanout coexistスタッフ",
        email: "fanout-coexist@example.com",
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
      });
      const legacyCanonicalId = await ctx.db.insert("notificationFanoutOperations", {
        operationKey: "legacy-canonical",
        kind: "confirmation",
        purpose: "confirmation",
        recruitmentId,
        shopId,
        targetStaffIds: [staffId],
        cursor: 0,
        status: "pending",
        dedupeSuffix: "confirm",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { shopId, staffId, recruitmentId, legacyCanonicalId };
    });

    const manual = await t.run(async (ctx) =>
      ensureNotificationFanoutOperation(ctx, {
        operationKey: "manual-supplemental",
        kind: "confirmation",
        purpose: "confirmation",
        recruitmentId: ids.recruitmentId,
        shopId: ids.shopId,
        targetStaffIds: [ids.staffId],
        dedupeSuffix: "staff-resend:manual-supplemental",
        supersedeActiveOperations: false,
        confirmationOperationKeyAtOrigin: null,
        recruitmentDraftSavedAtAtOrigin: null,
      }),
    );
    const legacyBeforeCanonical = await t.run(async (ctx) => ctx.db.get(ids.legacyCanonicalId));
    expect(legacyBeforeCanonical).toMatchObject({ status: "pending" });
    expect(legacyBeforeCanonical?.supersedesActiveOperations).toBeUndefined();

    const canonical = await t.run(async (ctx) =>
      ensureNotificationFanoutOperation(ctx, {
        operationKey: "new-canonical",
        kind: "confirmation",
        purpose: "confirmation_resend",
        recruitmentId: ids.recruitmentId,
        shopId: ids.shopId,
        targetStaffIds: [ids.staffId],
        dedupeSuffix: "resend:new-canonical",
        previousOperationKey: "legacy-canonical",
      }),
    );
    const coexistence = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacyCanonicalId),
      manual: await ctx.db.get(manual.operation._id),
      canonical: await ctx.db.get(canonical.operation._id),
    }));
    expect(coexistence.legacy).toMatchObject({ status: "cancelled", cancelReason: "superseded" });
    expect(coexistence.manual).toMatchObject({ status: "pending", supersedesActiveOperations: false });
    expect(coexistence.canonical).toMatchObject({ status: "pending", supersedesActiveOperations: true });

    const staleLegacyOperationId = await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        lastConfirmationNotificationOperationKey: canonical.operation.operationKey,
      });
      return await ctx.db.insert("notificationFanoutOperations", {
        operationKey: "stale-legacy-reader",
        kind: "confirmation",
        purpose: "confirmation",
        recruitmentId: ids.recruitmentId,
        shopId: ids.shopId,
        targetStaffIds: [ids.staffId],
        cursor: 0,
        status: "processing",
        dedupeSuffix: "confirm",
        leaseToken: "stale-legacy-lease",
        leaseExpiresAt: Date.now() + NOTIFICATION_FANOUT_PROCESSING_LEASE_MS,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const enqueueForOperation = async (args: {
      operationId: Id<"notificationFanoutOperations">;
      operationKey: string;
      leaseToken: string;
      dedupeSuffix: string;
    }) => {
      const dedupeKey = `email:confirmation:${ids.recruitmentId}:${ids.staffId}:${args.dedupeSuffix}`;
      return await t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        history: { notificationKind: "shift.confirmation", displayTitle: "シフト変更のお知らせ" },
        dedupeAcrossTerminal: true,
        fanoutTargetKey: `fanout:${args.operationKey}:${ids.staffId}`,
        fanoutOperationId: args.operationId,
        fanoutLeaseToken: args.leaseToken,
        legacyFanoutDedupeKeys: [dedupeKey],
        dedupeKey,
        payload: {
          kind: "email",
          from: "シフトリ <noreply@example.com>",
          to: "fanout-coexist@example.com",
          subject: "シフト変更のお知らせ",
          html: "<p>シフト変更のお知らせ</p>",
          context: "notification.sendConfirmationEmail",
        },
      });
    };

    await expect(
      enqueueForOperation({
        operationId: staleLegacyOperationId,
        operationKey: "stale-legacy-reader",
        leaseToken: "stale-legacy-lease",
        dedupeSuffix: "confirm",
      }),
    ).resolves.toBeNull();

    const claimedManual = await t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId: manual.operation._id,
    });
    expect(claimedManual).toEqual({ state: "cancelled" });

    const invalidIntermediateOperationId = await t.run(async (ctx) =>
      ctx.db.insert("notificationFanoutOperations", {
        operationKey: "invalid-intermediate-manual",
        kind: "confirmation",
        purpose: "confirmation",
        recruitmentId: ids.recruitmentId,
        shopId: ids.shopId,
        targetStaffIds: [ids.staffId],
        cursor: 0,
        status: "pending",
        dedupeSuffix: "staff-resend:invalid-intermediate-manual",
        supersedesActiveOperations: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(
      t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
        operationId: invalidIntermediateOperationId,
      }),
    ).resolves.toEqual({ state: "cancelled" });
  });

  it("個別再送operationが取消batchを超えても全体fanout作成と募集削除を妨げない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "fanout_many_manager",
        email: "fanout-many-manager@example.com",
        shopName: "fanout many店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "fanout manyスタッフ",
        email: "fanout-many@example.com",
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
      });
      for (let index = 0; index <= NOTIFICATION_FANOUT_CANCELLATION_BATCH_SIZE; index += 1) {
        await ctx.db.insert("notificationFanoutOperations", {
          operationKey: `manual-many-${index}`,
          kind: "confirmation",
          purpose: "confirmation",
          recruitmentId,
          shopId,
          targetStaffIds: [staffId],
          cursor: 0,
          status: "pending",
          dedupeSuffix: `staff-resend:manual-many-${index}`,
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: null,
          recruitmentDraftSavedAtAtOrigin: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      return { shopId, staffId, recruitmentId };
    });

    const canonicalOperationId = await t.mutation(
      internal.notification.mutations.ensureConfirmationNotificationFanout,
      {
        recruitmentId: ids.recruitmentId,
        isResend: true,
        targetStaffIds: [ids.staffId],
        operationKey: "canonical-after-many-manuals",
      },
    );
    expect(canonicalOperationId).toBeTypeOf("string");

    await expect(
      t.withIdentity({ subject: "fanout_many_manager" }).mutation(api.recruitment.mutations.deleteRecruitment, {
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();
    const state = await t.run(async (ctx) => ({
      recruitment: await ctx.db.get(ids.recruitmentId),
      operations: await ctx.db.query("notificationFanoutOperations").collect(),
    }));
    expect(state.recruitment).toMatchObject({ isDeleted: true });
    const remaining = state.operations.find((operation) => operation.status === "pending");
    expect(remaining).toBeDefined();
    if (!remaining) throw new Error("bounded cancellation unexpectedly cancelled every operation");
    await expect(
      t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, { operationId: remaining._id }),
    ).resolves.toEqual({ state: "cancelled" });
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
