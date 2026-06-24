import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE,
  NOTIFICATION_DELIVERY_EVENT_RETENTION_MS,
  NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE,
  NOTIFICATION_FAILURE_INBOX_RETENTION_MS,
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
} from "../constants";

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
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
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
    return { shopId, staffId };
  });
  return { t, ...ids };
}

async function collectFailureInbox(t: Awaited<ReturnType<typeof setupShop>>["t"]) {
  return await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
}

describe("notificationOutbox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("同じdedupeKeyのpendingジョブは重複作成しない", async () => {
    const { t, shopId, staffId } = await setupShop();
    const first = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      dedupeKey: "email:test:dedupe",
      payload: emailPayload,
    });
    const second = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      dedupeKey: "email:test:dedupe",
      payload: emailPayload,
    });

    expect(second.deduped).toBe(true);
    expect(second.outboxId).toBe(first.outboxId);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
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
      dedupeKey: "email:test:after-processing-bulk",
      payload: emailPayload,
    });

    expect(result.deduped).toBe(false);
    const outboxId = result.outboxId as Id<"notificationOutbox">;
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
      lastError: "temporary error",
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
      errorMessage: "temporary error",
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

    it("既にsentのジョブを再度markSentしても二重カウントしない", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:twice" });

      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

      const usage = await collectUsage(t);
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
        errorMessage: "boom",
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
        lastError: "boom",
      });
    });

    it("同じoutboxが再失敗しても要対応Inboxは重複作成せず更新する", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:refailed" });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "first" });
      const firstFailure = (await collectFailureInbox(t))[0];
      vi.advanceTimersByTime(1000);
      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "second" });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        _id: firstFailure._id,
        failureKey: `outbox:${outboxId}`,
        status: "open",
        shopId,
        lastError: "second",
      });
      expect(failures[0].firstFailedAt).toBe(firstFailure.firstFailedAt);
      expect(failures[0].lastFailedAt).toBeGreaterThan(firstFailure.lastFailedAt);
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
        lastError: "second",
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
        lastError: "second",
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
        lastError: "delivery failed",
      });

      const failures = await collectFailureInbox(t);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        _id: firstFailure._id,
        failureKey: `logical:${shopId}:${recruitmentId}:${staffId}:confirmation`,
        sourceType: "outbox",
        status: "open",
        outboxId,
        lastError: "delivery failed",
      });
      expect(failures[0].firstFailedAt).toBe(firstFailure.firstFailedAt);
    });

    it("markSentは同じoutboxの要対応Inboxをresolved/sentにする", async () => {
      const { t, shopId } = await setupShop();
      const outboxId = await insertProcessingJob(t, { shopId, channel: "email", dedupeKey: "email:test:recover" });

      await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "first" });
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

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
      await t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId });

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
        lastError: "delivery failed",
      });
    });
  });

  it("dueなジョブをclaimするとprocessingになりattemptCountが進む", async () => {
    const { t, shopId, staffId } = await setupShop();
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      dedupeKey: "email:test:claim",
      payload: emailPayload,
    });

    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe("processing");
    expect(claimed[0].attemptCount).toBe(1);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs[0].status).toBe("processing");
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
      errorMessage: "enqueue failed",
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
      lastError: "enqueue failed",
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
      lastError: "preparation failed",
      errorName: "PreparationError",
    });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.find((event) => event.eventType === "enqueue_preparation_failed")).toMatchObject({
      recruitmentId,
      errorMessage: "preparation failed",
    });
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
      notificationContext: "test.preparation",
      errorMessage: "first",
    });
    const failureId = (await collectFailureInbox(t))[0]._id;
    await t.withIdentity({ subject: "user_mgr" }).mutation(api.notificationOutbox.mutations.resolveFailure, {
      failureId,
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
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      _id: failureId,
      status: "open",
      lastError: "second",
    });
    expect(failures[0].resolvedAt).toBeUndefined();
    expect(failures[0].resolutionKind).toBeUndefined();
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
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.retryFailure, {
        failureId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.retryFailure, { failureId });

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
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(0);
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
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.resendFailure, {
        failureId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resendFailure, {
        failureId,
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
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(0);
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
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, {});

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
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      const oldOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        shopId,
        recruitmentId,
        staffId,
        payload: { ...emailPayload, context: "notification.sendConfirmationEmail" },
        attemptCount: 3,
        nextRunAt: now,
        failedAt: now - 2_000,
        createdAt: now - 2_000,
        updatedAt: now - 2_000,
      });
      const latestOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        shopId,
        recruitmentId,
        staffId,
        payload: { ...emailPayload, context: "notification.sendConfirmationEmail" },
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
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        notificationContext: "notification.sendConfirmationEmail",
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
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        notificationContext: "notification.sendConfirmationEmail",
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
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, {});

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
      failureKey: `logical:${shopId}:${ids.recruitmentId}:${staffId}:confirmation`,
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
        payload: emailPayload,
        attemptCount: 1,
        nextRunAt: now,
        processingStartedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.notificationOutbox.mutations.markFailed, { outboxId, lastError: "failed once" });
    const failureId = (await collectFailureInbox(t))[0]._id;
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other-manager@example.com",
        shopName: "別店舗",
      });
    });

    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.notificationOutbox.mutations.resolveFailure, {
        failureId,
      }),
    ).rejects.toThrow("Not found");

    const result = await t
      .withIdentity({ subject: "user_mgr" })
      .mutation(api.notificationOutbox.mutations.resolveFailure, { failureId });

    expect(result).toEqual({ resolved: true });
    const failure = await t.run(async (ctx) => await ctx.db.get(failureId));
    expect(failure).toMatchObject({
      status: "resolved",
      resolutionKind: "dismissed",
      resolvedByUserId: expect.any(String),
    });
    expect(failure?.resolvedAt).toBeTypeOf("number");
  });

  it("初回失敗から30日を過ぎたopen/retryingのFailureInboxをresolved/expiredにする", async () => {
    vi.setSystemTime(new Date("2026-06-23T00:00:00Z"));
    const { t, shopId, staffId } = await setupShop();
    const now = Date.now();
    const oldFirstFailedAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS - 1;
    const freshFirstFailedAt = now - NOTIFICATION_FAILURE_INBOX_RETENTION_MS + 1;
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
        firstFailedAt: oldFirstFailedAt,
        lastFailedAt: now,
        lastError: "old open",
        createdAt: oldFirstFailedAt,
        updatedAt: now,
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
        firstFailedAt: oldFirstFailedAt,
        lastFailedAt: now,
        lastError: "old retrying",
        retryRequestedAt: now - 1_000,
        createdAt: oldFirstFailedAt,
        updatedAt: now,
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
        firstFailedAt: freshFirstFailedAt,
        lastFailedAt: now,
        lastError: "fresh open",
        createdAt: freshFirstFailedAt,
        updatedAt: now,
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
        firstFailedAt: oldFirstFailedAt,
        lastFailedAt: oldFirstFailedAt,
        lastError: "resolved",
        resolvedAt: now - 1_000,
        resolutionKind: "dismissed",
        createdAt: oldFirstFailedAt,
        updatedAt: now - 1_000,
      });
      return { oldOpenId, oldRetryingId, freshOpenId, resolvedId };
    });

    const result = await t.mutation(internal.notificationOutbox.mutations.expireOldFailures, {});

    expect(result).toEqual({ expiredCount: 2 });
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
    });
    expect(failures.oldRetrying).toMatchObject({
      status: "resolved",
      resolvedAt: now,
      resolutionKind: "expired",
    });
    expect(failures.freshOpen).toMatchObject({
      status: "open",
    });
    expect(failures.freshOpen?.resolutionKind).toBeUndefined();
    expect(failures.resolved).toMatchObject({
      status: "resolved",
      resolutionKind: "dismissed",
      resolvedAt: now - 1_000,
    });
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
      lastError: "first",
    });
    expect(failures.find((failure) => failure._id !== firstFailure._id)).toMatchObject({
      status: "open",
      lastError: "second",
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
