import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { RESEND_WEBHOOK_BODY_MAX_BYTES } from "../constants";

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

  it("deliveredは受け取らずDBを更新しない", async () => {
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
    expect(events).toEqual([]);
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
      providerEmailEvent("email.delivered", "email_body_at_limit"),
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

  it("署名済みdelivery_delayedはoutboxから店舗とスタッフを復元してFailureInboxに出す", async () => {
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
    const failures = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      sourceType: "provider",
      status: "open",
      shopId: ids.shopId,
      staffId: ids.staffId,
      outboxId: ids.outboxId,
      channel: "email",
    });
  });
});

async function seedSentEmailOutbox(t: TestConvex<typeof schema>, resendEmailId: string) {
  return await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "manager@example.com",
      shopName: "Resend Webhook店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
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
      staffId,
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
    return { shopId, staffId, outboxId };
  });
}

function providerEmailEvent(type: string, emailId: string, outboxId?: Id<"notificationOutbox">) {
  return {
    type,
    created_at: "2026-06-22T05:23:00.000Z",
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
  const [events, failures] = await Promise.all([
    t.run(async (ctx) => await ctx.db.query("notificationDeliveryEvents").collect()),
    t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
  ]);
  expect(events).toEqual([]);
  expect(failures).toEqual([]);
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
