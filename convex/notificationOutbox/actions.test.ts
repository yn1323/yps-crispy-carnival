import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS, RESEND_RETRY_DELAY_PADDING_MS } from "../constants";

const fallbackEmail = {
  dedupeKey: "email:test:fallback",
  payload: {
    kind: "email" as const,
    from: "シフトリ <noreply@example.com>",
    to: "staff@example.com",
    subject: "fallback",
    html: "<p>fallback</p>",
    context: "test.fallback",
    suppressDelivery: true,
  },
};

async function setupLineJob(status: number) {
  vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      text: async () => "line error",
    })),
  );

  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "manager@example.com",
      shopName: "LINE通知店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "LINEスタッフ",
      email: "line-staff@example.com",
      isDeleted: false,
    });
    return { shopId, staffId };
  });
  await t.mutation(internal.notificationOutbox.mutations.enqueue, {
    channel: "line",
    shopId: ids.shopId,
    staffId: ids.staffId,
    dedupeKey: `line:test:${status}`,
    payload: {
      kind: "line",
      toUserId: "U_test",
      text: "hello",
    },
  });
  return { t, ...ids };
}

describe("notificationOutbox/actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([429, 500])("LINE %i はpendingに戻して再試行予約する", async (status) => {
    const { t } = await setupLineJob(status);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("pending");
    expect(jobs[0].attemptCount).toBe(1);
    expect(jobs[0].lastError).toContain(`LINE push failed: ${status}`);
    expect(jobs[0].nextRunAt).toBeGreaterThan(Date.now());
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "retry_scheduled",
      shopId: jobs[0].shopId,
      staffId: jobs[0].staffId,
      outboxId: jobs[0]._id,
      channel: "line",
      dedupeKey: `line:test:${status}`,
      notificationContext: `line:test`,
      attemptCount: 1,
    });
    expect(events[0].errorMessage).toContain(`LINE push failed: ${status}`);
  });

  it("LINE 400 はfailedにする", async () => {
    const { t } = await setupLineJob(400);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].lastError).toContain("LINE push failed: 400");
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "final_failed",
      shopId: jobs[0].shopId,
      staffId: jobs[0].staffId,
      outboxId: jobs[0]._id,
      channel: "line",
      dedupeKey: "line:test:400",
      notificationContext: "line:test",
      attemptCount: 1,
    });
    expect(events[0].errorMessage).toContain("LINE push failed: 400");
  });

  it("LINE quota exceeded はfallback emailをenqueueする", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@example.com",
        shopName: "LINE通知店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
      return { shopId, staffId };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId,
      staffId,
      dedupeKey: "line:test:quota",
      payload: {
        kind: "line",
        toUserId: "U_test",
        text: "hello",
        fallbackEmail,
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => job.channel).sort()).toEqual(["email", "line"]);
    expect(jobs.find((job) => job.channel === "line")?.status).toBe("failed");
    expect(jobs.find((job) => job.channel === "email")?.status).toBe("pending");
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.map((event) => event.eventType).sort()).toEqual(["fallback_enqueued", "final_failed"]);
    expect(events.find((event) => event.eventType === "fallback_enqueued")).toMatchObject({
      shopId,
      staffId,
      channel: "line",
      dedupeKey: "line:test:quota",
      notificationContext: "test.fallback",
      attemptCount: 1,
      errorMessage: "LINE quota exceeded; fallback email enqueued",
    });
    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toEqual([]);
  });

  it("Resend 429 はretry-afterに従って再予約する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            name: "rate_limit_exceeded",
            statusCode: 429,
            message: "Too many requests",
          }),
          {
            status: 429,
            headers: { "retry-after": "2" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { t, shopId, staffId } = await setupEmailJob();

    const result = t.action(internal.notificationOutbox.actions.processPending, {});
    const resendRetryDelayMs = 2000 + RESEND_RETRY_DELAY_PADDING_MS;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(resendRetryDelayMs);
    await vi.advanceTimersByTimeAsync(resendRetryDelayMs);
    await vi.advanceTimersByTimeAsync(resendRetryDelayMs);
    await result;

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    const resendCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("api.resend.com/emails"));
    expect(resendCalls).toHaveLength(4);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      shopId,
      staffId,
      status: "pending",
      attemptCount: 1,
    });
    expect(jobs[0].lastError).toContain("rate_limit_exceeded");
    expect(jobs[0].nextRunAt - jobs[0].updatedAt).toBe(2000 + RESEND_RETRY_DELAY_PADDING_MS);
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "retry_scheduled",
      shopId,
      staffId,
      channel: "email",
      dedupeKey: "email:test:resend429",
      notificationContext: "test.resendRetry",
      attemptCount: 1,
    });
    expect(events[0].errorMessage).toContain("rate_limit_exceeded");
  });
});

async function setupEmailJob() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "manager@example.com",
      shopName: "メール通知店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "メールスタッフ",
      email: "mail-staff@example.com",
      isDeleted: false,
    });
    await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: "email:test:resend429",
      shopId,
      staffId,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "mail-staff@example.com",
        subject: "retry",
        html: "<p>retry</p>",
        context: "test.resendRetry",
      },
      attemptCount: 0,
      nextRunAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { shopId, staffId };
  });
  return { t, ...ids };
}
