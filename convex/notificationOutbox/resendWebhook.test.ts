import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

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
    const rawBody = JSON.stringify(providerEmailEvent("email.delivered", "email_delivered"));
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

async function signedHeaders(id: string, rawBody: string) {
  const timestamp = String(Math.floor(NOW / 1000));
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": await sign(id, timestamp, rawBody),
  };
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
