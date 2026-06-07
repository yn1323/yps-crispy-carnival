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
