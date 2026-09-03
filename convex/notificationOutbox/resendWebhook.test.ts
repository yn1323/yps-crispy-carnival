import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { RESEND_DELAYED_FAILURE_GRACE_MS, RESEND_WEBHOOK_BODY_MAX_BYTES } from "../constants";

const RAW_SECRET = "test-resend-webhook-secret";
const WEBHOOK_SECRET = `whsec_${bytesToBase64(new TextEncoder().encode(RAW_SECRET))}`;
const NOW = new Date("2026-06-22T05:23:00.000Z").getTime();

describe("notificationOutbox/resendWebhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("署名不正ならDBを更新しない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = JSON.stringify(providerEmailEvent("email.delivery_delayed", "email_invalid_signature"));

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "svix-id": "svix_invalid_signature",
        "svix-timestamp": String(Math.floor(NOW / 1000)),
        "svix-signature": "v1,invalid",
      },
    });

    expect(response.status).toBe(401);
    const [events, failures] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
    ]);
    expect(events).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("照合できないdeliveredも重複排除用eventだけを安全に記録する", async () => {
    const t = convexTest(schema, modules);
    const rawBody = JSON.stringify(providerEmailEvent("email.delivered", "email_delivered"), null, 2);
    const headers = await signedHeaders("svix_delivered", rawBody);

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers,
    });

    expect(response.status).toBe(200);
    const [events, failures] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
      t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "provider_delivery_update",
      providerEventId: "svix_delivered",
      providerEventType: "email.delivered",
    });
    expect(events[0]).not.toHaveProperty("errorMessage");
    expect(failures).toEqual([]);
  });

  it("JSON以外のContent-Typeを415で拒否しDBを更新しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_wrong_content_type");
    const rawBody = JSON.stringify(
      providerEmailEvent("email.delivery_delayed", "email_wrong_content_type", ids.outboxId),
    );

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: { ...(await signedHeaders("svix_wrong_content_type", rawBody)), "content-type": "text/plain" },
    });

    expect(response.status).toBe(415);
    await expectProviderStateEmpty(t);
  });

  it("署名済みの64 KiBちょうどの対象外eventを200で受理しDBを更新しない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = buildSizedJsonBody(
      providerEmailEvent("email.sent", "email_body_at_limit"),
      RESEND_WEBHOOK_BODY_MAX_BYTES,
    );

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders("svix_body_at_limit", rawBody),
    });

    expect(response.status).toBe(200);
    await expectProviderStateEmpty(t);
  });

  it("実bodyが64 KiBを1 byte超えるrequestを413で拒否しDBを更新しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_body_too_large");
    const rawBody = buildSizedJsonBody(
      providerEmailEvent("email.delivery_delayed", "email_body_too_large", ids.outboxId),
      RESEND_WEBHOOK_BODY_MAX_BYTES + 1,
    );

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: { ...(await signedHeaders("svix_body_too_large", rawBody)), "content-length": "invalid" },
    });

    expect(response.status).toBe(413);
    await expectProviderStateEmpty(t);
  });

  it("署名済みの非object rootを400で拒否しDBを更新しない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = "[]";

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders("svix_invalid_shape", rawBody),
    });

    expect(response.status).toBe(400);
    await expectProviderStateEmpty(t);
  });

  it("署名済みdelivery_delayedは履歴を即時更新し、FailureInboxに出さず30分の期限を作る", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_delayed");
    const rawBody = JSON.stringify(providerEmailEvent("email.delivery_delayed", "email_delayed", ids.outboxId));
    const headers = await signedHeaders("svix_delayed", rawBody);

    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers,
    });

    expect(response.status).toBe(200);
    const state = await t.run(async (ctx) => ({
      failures: await ctx.db.query("notificationFailureInbox").collect(),
      deadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      history: ids.historyId ? await ctx.db.get(ids.historyId) : null,
    }));
    expect(state.failures).toEqual([]);
    expect(state.deadlines).toEqual([
      expect.objectContaining({
        outboxId: ids.outboxId,
        dueAt: NOW + RESEND_DELAYED_FAILURE_GRACE_MS,
        createdAt: NOW,
      }),
    ]);
    const history = state.history;
    expect(history).toMatchObject({ deliveryStatus: "delayed", deliveryStatusAt: NOW });
  });

  it("署名済みhard failureは猶予期限を消して即時にFailureInboxへ出す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_delayed_then_bounced");
    await postProviderEvent(
      t,
      "svix_delayed_before_bounced",
      providerEmailEvent("email.delivery_delayed", "email_delayed_then_bounced", ids.outboxId),
    );
    const response = await postProviderEvent(
      t,
      "svix_bounced_after_delayed",
      providerEmailEvent("email.bounced", "email_delayed_then_bounced", ids.outboxId, "2026-06-22T05:24:00.000Z"),
    );

    expect(response.status).toBe(200);
    const state = await t.run(async (ctx) => ({
      failures: await ctx.db.query("notificationFailureInbox").collect(),
      deadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      history: ids.historyId ? await ctx.db.get(ids.historyId) : null,
    }));
    expect(state.deadlines).toEqual([]);
    expect(state.failures).toEqual([
      expect.objectContaining({
        sourceType: "provider",
        status: "open",
        outboxId: ids.outboxId,
        lastError: "email_delivery_bounced",
      }),
    ]);
    expect(state.history).toMatchObject({
      deliveryStatus: "bounced",
      deliveryStatusAt: Date.parse("2026-06-22T05:24:00.000Z"),
    });
  });

  it("署名済みdeliveredは履歴を配信済みにし、成功eventへerrorMessageを保存しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_delivered_history");

    const response = await postProviderEvent(
      t,
      "svix_delivered_history",
      providerEmailEvent("email.delivered", "email_delivered_history", ids.outboxId),
    );

    expect(response.status).toBe(200);
    const [history, events] = await Promise.all([
      t.run(async (ctx) => (ids.historyId ? await ctx.db.get(ids.historyId) : null)),
      t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
    ]);
    expect(history).toMatchObject({
      sendStatus: "sent",
      deliveryStatus: "delivered",
      deliveryStatusAt: NOW,
      deliveredAt: NOW,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("errorMessage");
  });

  it("同じsvix-idのdeliveredはeventと状態更新を二重作成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_delivered_duplicate");
    const event = providerEmailEvent("email.delivered", "email_delivered_duplicate", ids.outboxId);

    await postProviderEvent(t, "svix_delivered_duplicate", event);
    await postProviderEvent(t, "svix_delivered_duplicate", event);

    const events = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect());
    expect(events).toHaveLength(1);
  });

  it("provider eventの順序逆転では古いdeliveredを反映せず、新しいdeliveredだけが警告を解消する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_provider_order");

    await postProviderEvent(
      t,
      "svix_delayed_newer",
      providerEmailEvent("email.delivery_delayed", "email_provider_order", ids.outboxId, "2026-06-22T05:24:00.000Z"),
    );
    await postProviderEvent(
      t,
      "svix_delivered_older",
      providerEmailEvent("email.delivered", "email_provider_order", ids.outboxId, "2026-06-22T05:23:30.000Z"),
    );

    const afterOlder = await t.run(async (ctx) => ({
      history: ids.historyId ? await ctx.db.get(ids.historyId) : null,
      failures: await ctx.db.query("notificationFailureInbox").collect(),
      deadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      outbox: await ctx.db.get(ids.outboxId),
    }));
    expect(afterOlder.history).toMatchObject({
      deliveryStatus: "delayed",
      deliveryStatusAt: Date.parse("2026-06-22T05:24:00.000Z"),
    });
    expect(afterOlder.failures).toEqual([]);
    expect(afterOlder.deadlines).toEqual([
      expect.objectContaining({
        outboxId: ids.outboxId,
        dueAt: Date.parse("2026-06-22T05:24:00.000Z") + RESEND_DELAYED_FAILURE_GRACE_MS,
      }),
    ]);
    expect(afterOlder.outbox).toMatchObject({
      resendLastEventType: "email.delivery_delayed",
      resendLastEventAt: Date.parse("2026-06-22T05:24:00.000Z"),
      resendDeliveryStatus: "delivery_delayed",
    });

    await postProviderEvent(
      t,
      "svix_delivered_newer",
      providerEmailEvent("email.delivered", "email_provider_order", ids.outboxId, "2026-06-22T05:25:00.000Z"),
    );

    const afterNewer = await t.run(async (ctx) => ({
      history: ids.historyId ? await ctx.db.get(ids.historyId) : null,
      failures: await ctx.db.query("notificationFailureInbox").collect(),
      deadlines: await ctx.db.query("notificationResendDelayedFailureDeadlines").collect(),
      outbox: await ctx.db.get(ids.outboxId),
    }));
    expect(afterNewer.history).toMatchObject({
      deliveryStatus: "delivered",
      deliveredAt: Date.parse("2026-06-22T05:25:00.000Z"),
    });
    expect(afterNewer.failures).toEqual([]);
    expect(afterNewer.deadlines).toEqual([]);
    expect(afterNewer.outbox).not.toHaveProperty("resendLastEventType");
    expect(afterNewer.outbox).not.toHaveProperty("resendDeliveryStatus");
    expect(afterNewer.outbox?.resendLastEventAt).toBe(Date.parse("2026-06-22T05:25:00.000Z"));
  });

  it("履歴のない既存Outboxでも新しいdeliveredはprovider由来の警告を解消する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedSentEmailOutbox(t, "email_legacy_without_history", { withHistory: false });

    await postProviderEvent(
      t,
      "svix_legacy_delayed",
      providerEmailEvent(
        "email.delivery_delayed",
        "email_legacy_without_history",
        ids.outboxId,
        "2026-06-22T05:24:00.000Z",
      ),
    );
    await postProviderEvent(
      t,
      "svix_legacy_delivered",
      providerEmailEvent("email.delivered", "email_legacy_without_history", ids.outboxId, "2026-06-22T05:25:00.000Z"),
    );
    await postProviderEvent(
      t,
      "svix_legacy_old_issue",
      providerEmailEvent("email.failed", "email_legacy_without_history", ids.outboxId, "2026-06-22T05:23:30.000Z"),
    );

    const [histories, failures, deadlines, outbox] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationHistory").collect()),
      t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
      t.run(async (ctx) => await ctx.db.query("notificationResendDelayedFailureDeadlines").collect()),
      t.run(async (ctx) => await ctx.db.get(ids.outboxId)),
    ]);
    expect(histories).toEqual([]);
    expect(failures).toEqual([]);
    expect(deadlines).toEqual([]);
    expect(outbox?.resendLastEventAt).toBe(Date.parse("2026-06-22T05:25:00.000Z"));
  });
});

async function seedSentEmailOutbox(
  t: TestConvex<typeof schema>,
  resendEmailId: string,
  options: { withHistory?: boolean } = {},
) {
  return await t.run(async (ctx) => {
    const { organizationId, shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "manager@example.com",
      shopName: "Resend Webhook店舗",
    });
    const staffId = await seedStaff(ctx, {
      shopId,
      name: "メールスタッフ",
      email: "mail-staff@example.com",
      isDeleted: false,
    });
    const now = Date.now();
    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "sent",
      dedupeKey: "email:test:resend-webhook",
      shopId,
      organizationId,
      staffId,
      purpose: "business",
      notificationContext: "test.resendWebhook",
      deliverySuppressed: false,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "mail-staff@example.com",
        subject: "webhook",
        html: "<p>webhook</p>",
        context: "test.resendWebhook",
      },
      attemptCount: 1,
      nextRunAt: now,
      sentAt: now,
      resendEmailId,
      createdAt: now,
      updatedAt: now,
    });
    const historyId =
      options.withHistory === false
        ? undefined
        : await ctx.db.insert("notificationHistory", {
            outboxId,
            shopId,
            staffId,
            channel: "email",
            notificationKind: "test.resendWebhook",
            displayTitle: "Webhookテスト",
            sendStatus: "sent",
            deliveryStatus: "unknown",
            requestedAt: now - 1_000,
            sentAt: now,
            updatedAt: now,
          });
    return { shopId, staffId, outboxId, historyId };
  });
}

function providerEmailEvent(
  type: string,
  emailId: string,
  outboxId?: Id<"notificationOutbox">,
  occurredAt = "2026-06-22T05:23:00.000Z",
) {
  return {
    type,
    created_at: occurredAt,
    data: {
      created_at: "2026-06-22T05:22:30.000Z",
      email_id: emailId,
      from: "noreply@example.com",
      to: ["mail-staff@example.com"],
      subject: "保存しない件名",
      tags: outboxId ? { shiftori_outbox_id: outboxId } : {},
    },
  };
}

async function postProviderEvent(
  t: TestConvex<typeof schema>,
  svixId: string,
  event: ReturnType<typeof providerEmailEvent>,
) {
  const rawBody = JSON.stringify(event);
  return await t.fetch("/resend/webhook", {
    method: "POST",
    body: rawBody,
    headers: await signedHeaders(svixId, rawBody),
  });
}

function buildSizedJsonBody(value: Record<string, unknown>, byteLength: number) {
  const encoder = new TextEncoder();
  const base = JSON.stringify({ ...value, padding: "" });
  const paddingLength = byteLength - encoder.encode(base).byteLength;
  if (paddingLength < 0) throw new Error("requested body size is too small");

  const rawBody = JSON.stringify({ ...value, padding: "x".repeat(paddingLength) });
  if (encoder.encode(rawBody).byteLength !== byteLength) throw new Error("failed to build exact-size JSON body");
  return rawBody;
}

async function signedHeaders(id: string, rawBody: string) {
  const timestamp = String(Math.floor(NOW / 1000));
  return {
    "content-type": "application/json; charset=utf-8",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": await sign(id, timestamp, rawBody),
  };
}

async function expectProviderStateEmpty(t: TestConvex<typeof schema>) {
  const [events, failures, deadlines] = await Promise.all([
    t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
    t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
    t.run(async (ctx) => await ctx.db.query("notificationResendDelayedFailureDeadlines").collect()),
  ]);
  expect(events).toEqual([]);
  expect(failures).toEqual([]);
  expect(deadlines).toEqual([]);
}

async function sign(id: string, timestamp: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(RAW_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
  );
  return `v1,${bytesToBase64(sig)}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
