import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import { seedStaff } from "../_test/scenarioBuilders";
import {
  seedCanonicalStaffLineRecipient,
  seedLegacyManagerShop,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  RESEND_EMAIL_SEND_INTERVAL_MS,
  RESEND_RETRY_DELAY_PADDING_MS,
} from "../constants";
import { deriveInvitationToken } from "../organizationInvitation/token";

const PROVIDER_ERROR_SENTINEL =
  'staff+secret@example.com token=capability-secret {"provider":"declined","body":"raw-response"}';

const fallbackEmail = {
  dedupeKey: "email:test:fallback",
  payload: {
    kind: "email" as const,
    from: "シフトリ <noreply@example.com>",
    to: "line-staff@example.com",
    subject: "fallback",
    html: "<p>fallback</p>",
    context: "test.fallback",
    suppressDelivery: true,
  },
};

type SeededCanonicalLineRecipient = Awaited<ReturnType<typeof seedCanonicalStaffLineRecipient>>;

function lineRecipientSnapshot(recipient: SeededCanonicalLineRecipient) {
  return {
    organizationPersonLineLinkId: recipient.organizationPersonLineLinkId,
    organizationPersonLineGenerationAtEnqueue: recipient.generation,
  };
}

async function setupLineJob(status: number, responseBody = "line error") {
  vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
  const fetchMock = vi.fn(async () => ({
    ok: false,
    status,
    text: async () => responseBody,
  }));
  vi.stubGlobal("fetch", fetchMock);

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
    const recipient = await seedCanonicalStaffLineRecipient(ctx, {
      staffId,
      lineUserId: "U_test",
    });
    return { shopId, staffId, recipient };
  });
  await t.mutation(internal.notificationOutbox.mutations.enqueue, {
    channel: "line",
    shopId: ids.shopId,
    staffId: ids.staffId,
    ...lineRecipientSnapshot(ids.recipient),
    history: { notificationKind: "test.line", displayTitle: "LINE通知" },
    dedupeKey: `line:test:${status}`,
    payload: {
      kind: "line",
      toUserId: "U_test",
      text: "hello",
    },
  });
  return { t, ...ids, fetchMock };
}

async function setupLineRecipientRevalidationJob(scope: "staff" | "manager" = "staff") {
  vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
  const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId, userId, organizationId, personId } = await seedManagerShop(ctx, {
      subject: "line_revalidation_manager",
      email: "line-revalidation-manager@example.com",
      shopName: "LINE宛先再検証店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "LINE宛先再検証スタッフ",
      email: "line-revalidation@example.com",
      ...(scope === "manager" ? { organizationId, organizationPersonId: personId } : {}),
      isDeleted: false,
    });
    const recipient = await seedCanonicalStaffLineRecipient(ctx, {
      staffId,
      lineUserId: "U_line_current",
    });
    return { shopId, staffId, userId, organizationId, personId, recipient };
  });
  const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
    channel: "line",
    shopId: ids.shopId,
    ...(scope === "staff"
      ? {
          staffId: ids.staffId,
          history: { notificationKind: "test.lineRevalidation", displayTitle: "LINE宛先再検証" },
        }
      : { userId: ids.userId }),
    ...lineRecipientSnapshot(ids.recipient),
    dedupeKey: `line:test:recipient-revalidation:${scope}`,
    payload: {
      kind: "line",
      toUserId: "U_line_current",
      text: "hello",
    },
  });
  if (!enqueued) throw new Error("LINE notification was not enqueued");
  return { t, fetchMock, outboxId: enqueued.outboxId, ...ids };
}

describe("notificationOutbox/actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "");
    resetResendEmailQueueForTest();
  });
  afterEach(() => {
    resetResendEmailQueueForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("LINE payload.message がある場合はFlex Messageを送信し、既存textはfallbackとして残す", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { shopId, staffId, recipient } = await t.run(async (ctx) => {
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
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_test",
      });
      return { shopId, staffId, recipient };
    });
    const flexMessage = {
      type: "flex" as const,
      altText: "提出依頼",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "text", text: "📩 提出依頼" }],
        },
      },
    };
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId,
      staffId,
      ...lineRecipientSnapshot(recipient),
      history: { notificationKind: "test.line", displayTitle: "LINE通知" },
      dedupeKey: "line:test:flex",
      payload: {
        kind: "line",
        toUserId: "U_test",
        text: "fallback text",
        message: flexMessage,
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      to: "U_test",
      messages: [flexMessage],
    });
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "line",
      status: "sent",
      payload: {
        kind: "line",
        text: "fallback text",
        message: flexMessage,
      },
    });
  });

  it.each(["unfollow", "relinked"] as const)(
    "enqueue後にLINE宛先が%sになった場合は旧IDへ送信せずcancelする",
    async (variant) => {
      const { t, fetchMock, recipient, outboxId } = await setupLineRecipientRevalidationJob();
      await t.run(async (ctx) => {
        await ctx.db.patch(
          recipient.lineProviderUserId,
          variant === "unfollow" ? { following: false } : { lineUserId: "U_line_relinked" },
        );
      });

      await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
      await t.action(internal.notificationOutbox.actions.processPending, {});

      expect(fetchMock).not.toHaveBeenCalled();
      const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
      expect(job).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
      expect(job?.processingStartedAt).toBeUndefined();
      expect(job?.leaseToken).toBeUndefined();
      expect(job?.leaseExpiresAt).toBeUndefined();
    },
  );

  it.each(["staff", "manager"] as const)(
    "送信直前の%s LINE宛先がenqueue時と一致する場合だけproviderを1回呼ぶ",
    async (scope) => {
      const { t, fetchMock, outboxId } = await setupLineRecipientRevalidationJob(scope);

      await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
      await t.action(internal.notificationOutbox.actions.processPending, {});

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).toMatchObject({ status: "sent" });
    },
  );

  it("管理者向け通常LINEも現在の連携IDへ変わった後は旧IDへ送らない", async () => {
    const { t, fetchMock, recipient, outboxId } = await setupLineRecipientRevalidationJob("manager");
    await t.run(async (ctx) => ctx.db.patch(recipient.lineProviderUserId, { lineUserId: "U_manager_relinked" }));

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it("管理者LINEはenqueue後に同じpersonの有効staffが重複したら送信せずcancelする", async () => {
    const { t, fetchMock, outboxId, shopId, organizationId, personId } =
      await setupLineRecipientRevalidationJob("manager");
    await t.run(async (ctx) => {
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        name: "重複した管理スタッフ",
        email: "line-revalidation-duplicate@example.com",
        emailNormalized: "line-revalidation-duplicate@example.com",
        isDeleted: false,
      });
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.get(outboxId))).toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it.each([429, 500])("LINE %i はpendingに戻して再試行予約する", async (status) => {
    const { t } = await setupLineJob(status);
    const errorCode = status === 429 ? "line_rate_limited" : "line_provider_unavailable";

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("pending");
    expect(jobs[0].attemptCount).toBe(1);
    expect(jobs[0].lastError).toBe(errorCode);
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
    expect(events[0].errorMessage).toBe(errorCode);
  });

  it("LINE 400 はfailedにする", async () => {
    const { t } = await setupLineJob(400);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].lastError).toBe("line_recipient_rejected");
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
    expect(events[0].errorMessage).toBe("line_recipient_rejected");
  });

  it("LINE失敗のprovider bodyをaction結果・console・永続化先へ出さない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t } = await setupLineJob(400, PROVIDER_ERROR_SENTINEL);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const actionResult = await t.action(internal.notificationOutbox.actions.processPending, {});
    const clientResponse = await t
      .withIdentity({ subject: "user_mgr" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { cursor: null, numItems: 10 },
      });
    const persisted = await t.run(async (ctx) => ({
      outbox: await ctx.db.query("notificationOutbox").collect(),
      events: await ctx.db.query("notificationDeliveryEvents").collect(),
      failures: await ctx.db.query("notificationFailureInbox").collect(),
    }));

    const observable = JSON.stringify({
      actionResult,
      clientResponse,
      console: [...errorSpy.mock.calls, ...warnSpy.mock.calls],
      persisted,
    });
    expect(observable).not.toContain(PROVIDER_ERROR_SENTINEL);
    expect(persisted.outbox[0]?.lastError).toBe("line_recipient_rejected");
    expect(persisted.events[0]?.errorMessage).toBe("line_recipient_rejected");
    expect(persisted.failures[0]?.lastError).toBe("line_recipient_rejected");
  });

  it("DEBUG_NOTIFY_FAIL はLINEを非リトライ失敗としてFailureInboxに出す", async () => {
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "1");
    const { t, shopId, staffId, fetchMock } = await setupLineJob(400);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "line",
      shopId,
      staffId,
      status: "failed",
      attemptCount: 1,
    });
    expect(jobs[0].lastError).toBe("line_recipient_rejected");

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "final_failed",
      shopId,
      staffId,
      outboxId: jobs[0]._id,
      channel: "line",
      dedupeKey: "line:test:400",
      notificationContext: "line:test",
      attemptCount: 1,
    });
    expect(events[0].errorMessage).toBe("line_recipient_rejected");

    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      shopId,
      staffId,
      outboxId: jobs[0]._id,
      channel: "line",
      notificationContext: "line:test",
    });
    expect(failures[0].lastError).toBe("line_recipient_rejected");
  });

  it("DEBUG_NOTIFY_FAIL はLINE quota fallbackより優先される", async () => {
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "1");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { shopId, staffId, recipient } = await t.run(async (ctx) => {
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
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_test",
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
      return { shopId, staffId, recipient };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId,
      staffId,
      ...lineRecipientSnapshot(recipient),
      history: { notificationKind: "test.line", displayTitle: "LINE通知" },
      dedupeKey: "line:test:debug-quota",
      payload: {
        kind: "line",
        toUserId: "U_test",
        text: "hello",
        fallbackEmail,
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "line",
      shopId,
      staffId,
      status: "failed",
      dedupeKey: "line:test:debug-quota",
    });
    expect(jobs[0].lastError).toBe("line_recipient_rejected");

    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      shopId,
      staffId,
      channel: "line",
      notificationContext: "test.fallback",
    });
  });

  it("LINE quota exceeded はfallback emailをenqueueする", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId, recipient } = await t.run(async (ctx) => {
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
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_test",
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
      return { shopId, staffId, recipient };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId,
      staffId,
      ...lineRecipientSnapshot(recipient),
      history: { notificationKind: "test.line", displayTitle: "LINE通知" },
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
      errorMessage: "line_quota_fallback_enqueued",
    });
    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toEqual([]);
    const histories = await t.run(async (ctx) => await ctx.db.query("notificationHistory").collect());
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ channel: "line", sendStatus: "failed" });
  });

  it("新しいLINE通知のfallback metadataからメール用の別履歴を作る", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId, recipient } = await t.run(async (ctx) => {
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
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_test",
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
      return { shopId, staffId, recipient };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId,
      staffId,
      ...lineRecipientSnapshot(recipient),
      history: { notificationKind: "test.line", displayTitle: "LINE通知" },
      dedupeKey: "line:test:quota-with-history",
      payload: {
        kind: "line",
        toUserId: "U_test",
        text: "hello",
        fallbackEmail: {
          dedupeKey: "email:test:fallback-with-history",
          history: { notificationKind: "test.emailFallback", displayTitle: "fallback" },
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "line-staff@example.com",
            subject: "fallback",
            html: "<p>fallback</p>",
            context: "test.fallback",
          },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const histories = await t.run(
      async (ctx) =>
        await ctx.db
          .query("notificationHistory")
          .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId).eq("staffId", staffId))
          .collect(),
    );
    expect(histories).toHaveLength(2);
    expect(histories.map(({ channel, displayTitle, sendStatus }) => ({ channel, displayTitle, sendStatus }))).toEqual(
      expect.arrayContaining([
        { channel: "line", displayTitle: "LINE通知", sendStatus: "failed" },
        { channel: "email", displayTitle: "fallback", sendStatus: "queued" },
      ]),
    );
  });

  it("Resend送信成功時はoutbox tagを付けてemail_idを保存する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_provider_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { t, shopId, staffId } = await setupEmailJob({
      dedupeKey: "email:test:resend-success",
      context: "test.resendSuccess",
    });
    const beforeJobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    const outboxId = beforeJobs[0]._id;

    await t.action(internal.notificationOutbox.actions.processPending, {});

    const resendCall = fetchMock.mock.calls.find(([input]) => String(input).includes("api.resend.com/emails"));
    expect(resendCall).toBeDefined();
    const requestBody = JSON.parse(String((resendCall?.[1] as RequestInit | undefined)?.body));
    expect(requestBody.tags).toEqual([{ name: "shiftori_outbox_id", value: outboxId }]);

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      _id: outboxId,
      channel: "email",
      shopId,
      staffId,
      status: "sent",
      resendEmailId: "email_provider_123",
    });
  });

  it("管理者招待は送信直前にtokenと本文を生成し、Outboxには保存しない", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_invitation_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId, invitationId } = await setupOrganizationInvitationJob("valid");
    const expectedToken = await deriveInvitationToken({
      invitationId,
      version: 1,
      signingSecret: "test-secret-that-is-at-least-32-characters",
    });

    const before = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(before?.payload).toEqual({
      kind: "organizationManagerInvitationEmail",
      from: "シフトリ <noreply@example.com>",
      to: "invite@example.com",
      context: "organizationInvitation.send",
    });
    expect(JSON.stringify(before)).not.toContain(expectedToken);

    await t.action(internal.notificationOutbox.actions.processPending, {});

    const resendCall = fetchMock.mock.calls.find(([input]) => String(input).includes("api.resend.com/emails"));
    expect(resendCall).toBeDefined();
    const requestBody = JSON.parse(String((resendCall?.[1] as RequestInit | undefined)?.body));
    expect(requestBody).toMatchObject({
      from: "シフトリ <noreply@example.com>",
      to: "invite@example.com",
      subject: "【シフトリ：招待事業者】管理者として招待されました",
      tags: [{ name: "shiftori_outbox_id", value: outboxId }],
    });
    expect(requestBody.html).toContain(`href="https://app.example.com/manager-invite?token=${expectedToken}"`);
    expect(requestBody.html).toContain("招待先さん");
    expect(requestBody.html).toContain("招待事業者の招待者さんから、管理者として招待されました。");
    expect(requestBody.html).toContain("1. シフトリとは？");
    expect(requestBody.html).toContain("スタッフの希望収集からシフト作成・共有までを支えるシフト管理サービスです。");
    expect(requestBody.html).toContain('href="https://app.example.com/base"');
    expect(requestBody.html).toContain(">シフトリを見る</a>");
    expect(requestBody.html).toContain("2. 管理者になるとできること");
    expect(requestBody.html).toContain("希望シフトの募集");
    expect(requestBody.html).toContain("シフトの調整");
    expect(requestBody.html).toContain("シフトの確定");
    expect(requestBody.html).toContain("スタッフ管理");
    expect(requestBody.html).toContain("店舗作成など");
    expect(requestBody.html).toContain("3. シフトリの管理者になる操作手順");
    expect(requestBody.html).toContain("管理者になるためには、アカウント登録が必要です。");
    expect(requestBody.html).toContain("シフトリの管理者招待を受け取る");
    expect(requestBody.html).toContain('href="https://app.example.com/help"');
    expect(requestBody.html).toContain("このリンクは7日間有効です。");
    expect(requestBody.html).not.toContain("一度だけ使用できます。");
    expect(requestBody.html.split(expectedToken)).toHaveLength(2);
    expect(requestBody.html).not.toContain(invitationId);
    expect(new Headers((resendCall?.[1] as RequestInit | undefined)?.headers).get("idempotency-key")).toBe(
      `notification-outbox-${outboxId}`,
    );

    const after = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(after).toMatchObject({ status: "sent", resendEmailId: "email_invitation_123" });
    expect(JSON.stringify(after)).not.toContain(expectedToken);
  });

  it("queued受諾完了メールを配送する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_invitation_linked_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId } = await setupOrganizationInvitationAcceptanceNotificationJob();

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(t.run((ctx) => ctx.db.get(outboxId))).resolves.toMatchObject({
      status: "sent",
      resendEmailId: "email_invitation_linked_123",
    });
  });

  it("LINE管理者招待も送信直前にtokenを生成し、端末の外部ブラウザで開く", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId, invitationId } = await setupOrganizationInvitationJob("valid");
    await t.run(async (ctx) => {
      const invitation = await ctx.db.get(invitationId);
      if (!invitation) throw new Error("invitation not found");
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: invitation.organizationId,
        name: "LINE招待先",
        email: invitation.email,
        emailNormalized: invitation.emailNormalized,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId: invitation.organizationId,
        operatingStatus: "active",
        name: "LINE招待店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId: invitation.organizationId,
        organizationPersonId: personId,
        name: "LINE招待先",
        email: invitation.email,
        emailNormalized: invitation.emailNormalized,
        isDeleted: false,
      });
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_manager_invitation",
      });
      await ctx.db.patch(invitationId, { targetPersonId: personId });
      await ctx.db.patch(outboxId, {
        channel: "line",
        staffId,
        ...lineRecipientSnapshot(recipient),
        payload: {
          kind: "organizationManagerInvitationLine",
          toUserId: "U_manager_invitation",
          context: "organizationInvitation.send",
          fallbackEmail: {
            dedupeKey: "email:test:manager-invitation-fallback",
            payload: {
              kind: "organizationManagerInvitationEmail",
              from: "シフトリ <noreply@example.com>",
              to: invitation.email,
              context: "organizationInvitation.send",
            },
          },
        },
      });
    });
    const expectedToken = await deriveInvitationToken({
      invitationId,
      version: 1,
      signingSecret: "test-secret-that-is-at-least-32-characters",
    });
    expect(JSON.stringify(await t.run(async (ctx) => await ctx.db.get(outboxId)))).not.toContain(expectedToken);

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({ to: "U_manager_invitation" });
    const messageText = requestBody.messages[0].text as string;
    expect(messageText).toContain(`/manager-invite?token=${expectedToken}&openExternalBrowser=1`);
    const after = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(after).toMatchObject({ status: "sent" });
    expect(JSON.stringify(after)).not.toContain(expectedToken);
  });

  it("利用上限超過後は既存の業務メールをproviderへ送らず、課金メールだけを送る", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_usage_limit_billing_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_provider_manager",
        email: "usage-limit-provider-manager@example.com",
        plan: "free",
      });
      for (let index = 0; index < 5; index += 1) {
        await seedStaff(ctx, {
          shopId: seeded.shopId,
          name: `上限超過スタッフ${index + 1}`,
          email: `usage-limit-provider-staff-${index + 1}@example.com`,
        });
      }
      const insertEmail = async (purpose: "business" | "billing") => {
        const now = Date.now();
        return await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey: `email:test:usage-limit-provider-${purpose}`,
          organizationId: seeded.organizationId,
          purpose,
          userId: seeded.userId,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "usage-limit-provider-manager@example.com",
            subject: purpose,
            html: `<p>${purpose}</p>`,
            context: `test.usageLimitProvider.${purpose}`,
          },
          attemptCount: 0,
          nextRunAt: now,
          createdAt: now,
          updatedAt: now,
        });
      };
      return {
        businessId: await insertEmail("business"),
        billingId: await insertEmail("billing"),
      };
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    const resendCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("api.resend.com/emails"));
    expect(resendCalls).toHaveLength(1);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    const stateById = new Map(jobs.map((job) => [job._id, job]));
    expect(stateById.get(ids.businessId)).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_usage_limit_exceeded",
    });
    expect(stateById.get(ids.billingId)).toMatchObject({
      status: "sent",
      resendEmailId: "email_usage_limit_billing_123",
    });
  });

  it("Free移行前の業務メールは送信直前に停止し、移行後の業務メールと課金メールだけを送る", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_free_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { userId } = await seedManagerShop(ctx, {
        subject: "free_cutoff_manager",
        email: "manager@example.com",
        shopName: "Free通知店舗",
      });
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        createdByUserId: userId,
        name: "Free通知事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
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
      await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "free" },
        businessNotificationCutoffAt: now,
        businessNotificationCutoffVersion: 2,
        version: 2,
        createdAt: now,
        updatedAt: now,
      });
      const insertEmail = async (args: {
        dedupeKey: string;
        purpose: "business" | "billing";
        billingVersion?: number;
      }) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey: args.dedupeKey,
          organizationId,
          ...(args.billingVersion !== undefined ? { organizationBillingVersionAtEnqueue: args.billingVersion } : {}),
          purpose: args.purpose,
          userId,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "manager@example.com",
            subject: args.dedupeKey,
            html: `<p>${args.dedupeKey}</p>`,
            context: `test.free.${args.purpose}`,
          },
          attemptCount: 0,
          nextRunAt: now,
          createdAt: now,
          updatedAt: now,
        });
      return {
        oldBusinessId: await insertEmail({
          dedupeKey: "email:test:free-old-business",
          purpose: "business",
          billingVersion: 1,
        }),
        newBusinessId: await insertEmail({
          dedupeKey: "email:test:free-new-business",
          purpose: "business",
          billingVersion: 2,
        }),
        billingId: await insertEmail({ dedupeKey: "email:test:free-billing", purpose: "billing" }),
      };
    });

    const pending = t.action(internal.notificationOutbox.actions.processPending, {});
    await vi.advanceTimersByTimeAsync(RESEND_EMAIL_SEND_INTERVAL_MS);
    await pending;

    const resendCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("api.resend.com/emails"));
    expect(resendCalls).toHaveLength(2);
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    const stateById = new Map(jobs.map((job) => [job._id, job]));
    expect(stateById.get(ids.oldBusinessId)).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
    });
    expect(stateById.get(ids.newBusinessId)).toMatchObject({ status: "sent", resendEmailId: "email_free_123" });
    expect(stateById.get(ids.billingId)).toMatchObject({ status: "sent", resendEmailId: "email_free_123" });
  });

  it("有料契約へ復旧してもcutoff前の業務メールは送らない", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const outboxId = await t.run(async (ctx) => {
      const { userId } = await seedManagerShop(ctx, {
        subject: "paid_recovery_manager",
        email: "manager@example.com",
        shopName: "復旧通知店舗",
      });
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        createdByUserId: userId,
        name: "復旧通知事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
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
      await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "pro" },
        businessNotificationCutoffAt: now,
        businessNotificationCutoffVersion: 2,
        version: 3,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:paid-recovery-old-business",
        organizationId,
        organizationBillingVersionAtEnqueue: 1,
        purpose: "business",
        userId,
        payload: {
          kind: "email",
          from: "シフトリ <noreply@example.com>",
          to: "manager@example.com",
          subject: "旧業務通知",
          html: "<p>old</p>",
          context: "test.paid-recovery.business",
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
    });
  });

  it("enqueue後にスタッフが削除された場合はproviderを呼ばずに停止する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, staffId } = await setupEmailJob({ dedupeKey: "email:test:removed-staff" });
    await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
  });

  it.each([
    { label: "スタッフ", target: "staff" },
    { label: "事業者人物", target: "organizationPerson" },
    { label: "旧管理者user", target: "legacyUser" },
  ] as const)("enqueue後に$labelのメールアドレスが変わった場合は旧宛先へ送らない", async ({ target }) => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId } = await setupStaleEmailJob(target);

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it.each(["person", "member"] as const)(
    "enqueue後に事業者の%sが削除された場合はproviderを呼ばずに停止する",
    async (removedTarget) => {
      vi.stubEnv("RESEND_API_KEY", "resend-token");
      const fetchMock = vi.fn<typeof globalThis.fetch>();
      vi.stubGlobal("fetch", fetchMock);
      const { t, outboxId } = await setupOrganizationEmailJob(removedTarget);

      await t.action(internal.notificationOutbox.actions.processPending, {});

      expect(fetchMock).not.toHaveBeenCalled();
      const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
      expect(job).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    },
  );

  it("enqueue後に店舗が停止した場合はproviderを呼ばずに停止する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, shopId } = await setupEmailJob({ dedupeKey: "email:test:inactive-shop" });
    await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "cancelled", cancelReason: "shop_inactive" });
  });

  it.each([
    { label: "再発行前のversion", variant: "versionMismatch", reason: "invitation_inactive" },
    { label: "取消済み", variant: "revoked", reason: "invitation_inactive" },
    { label: "使用済み", variant: "linked", reason: "invitation_inactive" },
    { label: "期限切れ", variant: "expired", reason: "invitation_inactive" },
    { label: "宛先が変わった", variant: "recipientMismatch", reason: "invitation_inactive" },
    { label: "権限を失った招待者", variant: "inviterMemberRemoved", reason: "invitation_inactive" },
    { label: "削除された招待者", variant: "inviterPersonRemoved", reason: "invitation_inactive" },
    {
      label: "管理者変更が制限された事業者",
      variant: "managerChangesUnavailable",
      reason: "organization_usage_limit_exceeded",
    },
    { label: "削除された事業者", variant: "organizationDeleted", reason: "organization_inactive" },
  ] as const)("$labelの管理者招待はproviderを呼ばずに停止する", async ({ variant, reason }) => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId } = await setupInvalidOrganizationInvitationJob(variant);

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const job = await t.run(async (ctx) => await ctx.db.get(outboxId));
    expect(job).toMatchObject({ status: "cancelled", cancelReason: reason });
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
    expect(jobs[0].lastError).toBe("email_rate_limited");
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
    expect(events[0].errorMessage).toBe("email_rate_limited");
  });

  it("DEBUG_NOTIFY_FAIL はメールを非リトライ失敗としてFailureInboxに出す", async () => {
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, shopId, staffId } = await setupEmailJob({
      dedupeKey: "email:test:debug",
      context: "test.debugEmail",
      suppressDelivery: true,
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      shopId,
      staffId,
      status: "failed",
      attemptCount: 1,
    });
    expect(jobs[0].lastError).toBe("email_recipient_rejected");

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "final_failed",
      shopId,
      staffId,
      outboxId: jobs[0]._id,
      channel: "email",
      dedupeKey: "email:test:debug",
      notificationContext: "test.debugEmail",
      attemptCount: 1,
    });
    expect(events[0].errorMessage).toBe("email_recipient_rejected");

    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      shopId,
      staffId,
      outboxId: jobs[0]._id,
      channel: "email",
      notificationContext: "test.debugEmail",
    });
    expect(failures[0].lastError).toBe("email_recipient_rejected");
  });

  it("Resend失敗のprovider bodyをaction結果・console・永続化先へ出さない", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(
            JSON.stringify({
              name: "validation_error",
              statusCode: 422,
              message: PROVIDER_ERROR_SENTINEL,
            }),
            { status: 422 },
          ),
      ),
    );
    const { t } = await setupEmailJob({
      dedupeKey: "email:test:provider-sentinel",
      context: "line.sendInviteEmail",
    });

    const actionResult = await t.action(internal.notificationOutbox.actions.processPending, {});
    const clientResponse = await t
      .withIdentity({ subject: "user_mgr" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { cursor: null, numItems: 10 },
      });
    const persisted = await t.run(async (ctx) => ({
      outbox: await ctx.db.query("notificationOutbox").collect(),
      events: await ctx.db.query("notificationDeliveryEvents").collect(),
      failures: await ctx.db.query("notificationFailureInbox").collect(),
    }));

    const observable = JSON.stringify({
      actionResult,
      clientResponse,
      console: [...errorSpy.mock.calls, ...warnSpy.mock.calls],
      persisted,
    });
    expect(observable).not.toContain(PROVIDER_ERROR_SENTINEL);
    expect(persisted.outbox[0]?.lastError).toBe("email_recipient_rejected");
    expect(persisted.events[0]?.errorMessage).toBe("email_recipient_rejected");
    expect(persisted.failures[0]?.lastError).toBe("email_recipient_rejected");
  });
  it("LINE管理者招待のretry可能な失敗は最終試行前にはメールへfallbackしない", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response("line error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId } = await setupOrganizationInvitationLineJob();

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      _id: outboxId,
      channel: "line",
      status: "pending",
      attemptCount: 1,
    });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "retry_scheduled", outboxId, attemptCount: 1 });
  });

  it.each([
    { label: "retry不能な4xx", status: 400, initialAttemptCount: 0 },
    {
      label: "retry上限に達した5xx",
      status: 500,
      initialAttemptCount: NOTIFICATION_OUTBOX_MAX_ATTEMPTS - 1,
    },
  ])("LINE管理者招待の$labelは同じ招待参照のメールへ一度だけfallbackする", async ({ status, initialAttemptCount }) => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response("line error", { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId, invitationId, organizationId, staffId, fallbackDedupeKey } =
      await setupOrganizationInvitationLineJob({ initialAttemptCount });
    const expectedToken = await deriveInvitationToken({
      invitationId,
      version: 1,
      signingSecret: "test-secret-that-is-at-least-32-characters",
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(2);
    const lineJobs = jobs.filter((job) => job._id === outboxId);
    expect(lineJobs).toHaveLength(1);
    expect(lineJobs[0]).toMatchObject({
      channel: "line",
      status: "failed",
      attemptCount: initialAttemptCount + 1,
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
    });
    expect(lineJobs[0].lastError).toBe(status === 400 ? "line_recipient_rejected" : "line_provider_unavailable");

    const fallbackJobs = jobs.filter((job) => job.dedupeKey === fallbackDedupeKey);
    expect(fallbackJobs).toHaveLength(1);
    expect(fallbackJobs[0]).toMatchObject({
      channel: "email",
      status: "pending",
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
      purpose: "business",
      staffId,
      payload: {
        kind: "organizationManagerInvitationEmail",
        from: "シフトリ <noreply@example.com>",
        to: "invite@example.com",
        context: "organizationInvitation.send",
      },
    });
    expect(JSON.stringify(jobs)).not.toContain(expectedToken);

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.map((event) => event.eventType).sort()).toEqual(["fallback_enqueued", "final_failed"]);
    const fallbackEvents = events.filter((event) => event.eventType === "fallback_enqueued");
    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0]).toMatchObject({
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
      outboxId,
      channel: "line",
      notificationContext: "organizationInvitation.send",
      attemptCount: initialAttemptCount + 1,
    });
    expect(fallbackEvents[0].errorMessage).toBe(
      status === 400 ? "line_recipient_rejected" : "line_provider_unavailable",
    );
    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toEqual([]);
  });

  it("LINE管理者招待のnetwork errorも最終試行後はメールへfallbackする", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId, invitationId, fallbackDedupeKey } = await setupOrganizationInvitationLineJob({
      initialAttemptCount: NOTIFICATION_OUTBOX_MAX_ATTEMPTS - 1,
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(2);
    const lineJobs = jobs.filter((job) => job._id === outboxId);
    expect(lineJobs).toHaveLength(1);
    expect(lineJobs[0]).toMatchObject({
      status: "failed",
      attemptCount: NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
      lastError: "line_provider_unavailable",
    });
    const fallbackJobs = jobs.filter((job) => job.dedupeKey === fallbackDedupeKey);
    expect(fallbackJobs).toHaveLength(1);
    expect(fallbackJobs[0]).toMatchObject({
      channel: "email",
      status: "pending",
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
      payload: { kind: "organizationManagerInvitationEmail" },
    });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.map((event) => event.eventType).sort()).toEqual(["fallback_enqueued", "final_failed"]);
    expect(events.filter((event) => event.eventType === "fallback_enqueued")).toHaveLength(1);
    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toEqual([]);
  });

  it("LINE管理者招待のquota fallbackは終端失敗処理と重複しない", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubEnv("APP_URL", "https://app.example.com/base");
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "test-secret-that-is-at-least-32-characters");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, outboxId, fallbackDedupeKey } = await setupOrganizationInvitationLineJob();
    await t.run(async (ctx) => {
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(2);
    expect(jobs.filter((job) => job.dedupeKey === fallbackDedupeKey)).toHaveLength(1);
    expect(jobs.filter((job) => job._id === outboxId)[0]).toMatchObject({ status: "failed" });
    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events.map((event) => event.eventType).sort()).toEqual(["fallback_enqueued", "final_failed"]);
    expect(events.filter((event) => event.eventType === "fallback_enqueued")).toHaveLength(1);
  });
});

async function setupEmailJob(options: { dedupeKey?: string; context?: string; suppressDelivery?: boolean } = {}) {
  const dedupeKey = options.dedupeKey ?? "email:test:resend429";
  const context = options.context ?? "test.resendRetry";
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
      dedupeKey,
      shopId,
      staffId,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "mail-staff@example.com",
        subject: "retry",
        html: "<p>retry</p>",
        context,
        ...(options.suppressDelivery ? { suppressDelivery: true } : {}),
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

async function setupOrganizationEmailJob(removedTarget: "person" | "member") {
  const t = convexTest(schema, modules);
  const outboxId = await t.run(async (ctx) => {
    const { userId, shopId } = await seedManagerShop(ctx, {
      subject: `removed_${removedTarget}`,
      email: "manager@example.com",
      shopName: "所属確認店舗",
    });
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      createdByUserId: userId,
      name: "所属確認事業者",
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
      status: removedTarget === "person" ? "removed" : "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId,
      personId,
      userId,
      status: removedTarget === "member" ? "removed" : "active",
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
    return await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: `email:test:removed-organization-${removedTarget}`,
      organizationId,
      purpose: "business",
      userId,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "manager@example.com",
        subject: "所属確認",
        html: "<p>test</p>",
        context: "test.organizationRecipient",
      },
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { t, outboxId };
}

async function setupStaleEmailJob(target: "staff" | "organizationPerson" | "legacyUser") {
  const t = convexTest(schema, modules);
  const outboxId = await t.run(async (ctx) => {
    const seedArgs = {
      subject: `stale_email_${target}`,
      email: "old-recipient@example.com",
      shopName: "宛先変更確認店舗",
    };
    const seeded =
      target === "legacyUser" ? await seedLegacyManagerShop(ctx, seedArgs) : await seedManagerShop(ctx, seedArgs);
    const now = Date.now();
    if (target === "staff") {
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        name: "宛先変更スタッフ",
        email: "old-recipient@example.com",
        emailNormalized: "old-recipient@example.com",
        isDeleted: false,
      });
      const id = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:stale-staff-address",
        shopId: seeded.shopId,
        staffId,
        payload: {
          kind: "email",
          from: "シフトリ <noreply@example.com>",
          to: "old-recipient@example.com",
          subject: "宛先変更確認",
          html: "<p>test</p>",
          context: "test.staleEmail.staff",
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(staffId, {
        email: "new-recipient@example.com",
        emailNormalized: "new-recipient@example.com",
      });
      return id;
    }

    if (target === "legacyUser") {
      const id = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:test:stale-legacy-user-address",
        shopId: seeded.shopId,
        userId: seeded.userId,
        payload: {
          kind: "email",
          from: "シフトリ <noreply@example.com>",
          to: "old-recipient@example.com",
          subject: "宛先変更確認",
          html: "<p>test</p>",
          context: "test.staleEmail.legacyUser",
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(seeded.userId, {
        email: "new-recipient@example.com",
        emailNormalized: "new-recipient@example.com",
      });
      return id;
    }

    const organizationId = await ctx.db.insert("organizations", {
      createdByUserId: seeded.userId,
      name: "宛先変更確認事業者",
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(seeded.shopId, { organizationId, operatingStatus: "active" });
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId,
      userId: seeded.userId,
      name: "宛先変更管理者",
      email: "old-recipient@example.com",
      emailNormalized: "old-recipient@example.com",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId,
      personId,
      userId: seeded.userId,
      status: "active",
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
    const id = await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: "email:test:stale-organization-person-address",
      organizationId,
      purpose: "billing",
      userId: seeded.userId,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "old-recipient@example.com",
        subject: "宛先変更確認",
        html: "<p>test</p>",
        context: "test.staleEmail.organizationPerson",
      },
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(personId, {
      email: "new-recipient@example.com",
      emailNormalized: "new-recipient@example.com",
    });
    return id;
  });
  return { t, outboxId };
}

type InvalidOrganizationInvitationVariant =
  | "versionMismatch"
  | "revoked"
  | "linked"
  | "expired"
  | "recipientMismatch"
  | "inviterMemberRemoved"
  | "inviterPersonRemoved"
  | "managerChangesUnavailable"
  | "organizationDeleted";

async function setupInvalidOrganizationInvitationJob(variant: InvalidOrganizationInvitationVariant) {
  return await setupOrganizationInvitationJob(variant);
}

async function setupOrganizationInvitationJob(variant: InvalidOrganizationInvitationVariant | "valid") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { userId } = await seedManagerShop(ctx, {
      subject: `inviter_${variant}`,
      email: "inviter@example.com",
      shopName: "招待店舗",
    });
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      createdByUserId: userId,
      name: "招待事業者",
      isDeleted: variant === "organizationDeleted",
      createdAt: now,
      updatedAt: now,
    });
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId,
      userId,
      name: "招待者",
      email: "inviter@example.com",
      emailNormalized: "inviter@example.com",
      status: variant === "inviterPersonRemoved" ? "removed" : "active",
      createdAt: now,
      updatedAt: now,
    });
    const memberId = await ctx.db.insert("organizationMembers", {
      organizationId,
      personId,
      userId,
      status: variant === "inviterMemberRemoved" ? "removed" : "active",
      createdAt: now,
      updatedAt: now,
    });
    if (variant === "managerChangesUnavailable") {
      for (let index = 0; index < 2; index += 1) {
        const additionalUserId = await seedUser(
          ctx,
          `inviter_over_limit_${index}`,
          `inviter-over-limit-${index}@example.com`,
        );
        const additionalPersonId = await ctx.db.insert("organizationPeople", {
          organizationId,
          userId: additionalUserId,
          name: `追加管理者${index + 1}`,
          email: `inviter-over-limit-${index}@example.com`,
          emailNormalized: `inviter-over-limit-${index}@example.com`,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId,
          personId: additionalPersonId,
          userId: additionalUserId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await ctx.db.insert("organizationBillingStates", {
      organizationId,
      state: { kind: "active", plan: variant === "managerChangesUnavailable" ? "free" : "pro" },
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const invitationId = await ctx.db.insert("organizationInvitations", {
      organizationId,
      invitedName: "招待先",
      email: "invite@example.com",
      emailNormalized: "invite@example.com",
      tokenDigest: "digest",
      status: variant === "revoked" ? "revoked" : variant === "linked" ? "linked" : "issued",
      inviterMemberId: memberId,
      reservedSeat: true,
      version: variant === "versionMismatch" ? 2 : 1,
      expiresAt: variant === "expired" ? now : now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: `email:test:invalid-organization-invitation:${variant}`,
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 1,
      purpose: "business",
      payload: {
        kind: "organizationManagerInvitationEmail",
        from: "シフトリ <noreply@example.com>",
        to: variant === "recipientMismatch" ? "other@example.com" : "invite@example.com",
        context: "organizationInvitation.send",
      },
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { outboxId, invitationId };
  });
  return { t, ...ids };
}

async function setupOrganizationInvitationAcceptanceNotificationJob() {
  const t = convexTest(schema, modules);
  const outboxId = await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject: "queued_manager_invitation_acceptance",
      email: "manager@example.com",
      complimentary: true,
    });
    const now = Date.now();
    return await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: "email:test:queued-manager-invitation-acceptance",
      organizationId: seeded.organizationId,
      userId: seeded.userId,
      purpose: "business",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "manager@example.com",
        subject: "管理者アカウント連携が完了しました",
        html: "<p>test</p>",
        context: "organizationInvitation.linked",
      },
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { t, outboxId };
}

async function setupOrganizationInvitationLineJob(options: { initialAttemptCount?: number } = {}) {
  const setup = await setupOrganizationInvitationJob("valid");
  const fallbackDedupeKey = "email:test:manager-invitation-fallback";
  const ids = await setup.t.run(async (ctx) => {
    const invitation = await ctx.db.get(setup.invitationId);
    if (!invitation) throw new Error("invitation not found");
    const now = Date.now();
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId: invitation.organizationId,
      name: "LINE招待先",
      email: invitation.email,
      emailNormalized: invitation.emailNormalized,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const shopId = await ctx.db.insert("shops", {
      organizationId: invitation.organizationId,
      operatingStatus: "active",
      name: "LINE招待店舗",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      regularClosedDays: [],
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId: invitation.organizationId,
      organizationPersonId: personId,
      name: "LINE招待先",
      email: invitation.email,
      emailNormalized: invitation.emailNormalized,
      isDeleted: false,
    });
    const recipient = await seedCanonicalStaffLineRecipient(ctx, {
      staffId,
      lineUserId: "U_manager_invitation",
    });
    await ctx.db.patch(setup.invitationId, { targetPersonId: personId });
    await ctx.db.patch(setup.outboxId, {
      channel: "line",
      staffId,
      ...lineRecipientSnapshot(recipient),
      attemptCount: options.initialAttemptCount ?? 0,
      payload: {
        kind: "organizationManagerInvitationLine",
        toUserId: "U_manager_invitation",
        context: "organizationInvitation.send",
        fallbackEmail: {
          dedupeKey: fallbackDedupeKey,
          payload: {
            kind: "organizationManagerInvitationEmail",
            from: "シフトリ <noreply@example.com>",
            to: invitation.email,
            context: "organizationInvitation.send",
          },
        },
      },
    });
    return { organizationId: invitation.organizationId, shopId, staffId };
  });
  return { ...setup, ...ids, fallbackDedupeKey };
}
