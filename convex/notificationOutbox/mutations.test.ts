import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

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
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(1);
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
    const job = await t.run(async (ctx) => await ctx.db.get(result.outboxId));
    expect(job?.status).toBe("pending");
  });

  it("dueなpendingジョブが残っていてもworker予定がなければ再予約する", async () => {
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
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(1);
  });

  it("future retry workerだけが予約済みでも新規due通知用の即時workerを予約する", async () => {
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

    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      dedupeKey: "email:test:after-retry-backoff",
      payload: emailPayload,
    });

    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const workers = scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending");
    expect(workers).toHaveLength(2);
    expect(workers.some((job) => job.scheduledTime <= now)).toBe(true);
    expect(workers.some((job) => job.scheduledTime > now)).toBe(true);
  });

  it("dueなpendingジョブにdedupeした場合もworker予定がなければ再予約する", async () => {
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
    expect(scheduled.filter((job) => job.name === "notificationOutbox/actions:processPending")).toHaveLength(1);
  });

  describe("markSent", () => {
    async function insertProcessingJob(
      t: Awaited<ReturnType<typeof setupShop>>["t"],
      args: { shopId: Id<"shops">; channel: "email" | "line"; dedupeKey: string; suppressDelivery?: boolean },
    ) {
      const suppressDelivery = args.suppressDelivery ?? false;
      return await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("notificationOutbox", {
          channel: args.channel,
          status: "processing",
          dedupeKey: args.dedupeKey,
          shopId: args.shopId,
          payload:
            args.channel === "email"
              ? { ...emailPayload, suppressDelivery }
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

    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe("processing");
    expect(claimed[0].attemptCount).toBe(1);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs[0].status).toBe("processing");
  });
});
