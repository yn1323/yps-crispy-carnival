import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modules, schema } from "../_test/setup.test-helper";
import { STRIPE_WEBHOOK_BODY_MAX_BYTES, STRIPE_WEBHOOK_SIGNATURE_MAX_LENGTH } from "../constants";

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    getStripeSafetyConfiguration: () => ({
      secretKey: "sk_test_organization_stripe",
      webhookSecret: "whsec_test_organization_stripe",
      livemode: false,
    }),
  };
});

const WEBHOOK_SECRET = "whsec_test_organization_stripe";
const API_VERSION = "2026-04-22.dahlia";
const NOW = new Date("2026-07-20T05:23:00.000Z").getTime();
const externalFetchMock = vi.fn();

describe("organizationStripe/webhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", externalFetchMock);
    externalFetchMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("署名検証済みの対応イベントだけをreceiptへ保存して処理を予約する", async () => {
    const t = convexTest(schema, modules);
    const event = stripeEvent({
      id: "evt_invoice_paid",
      type: "invoice.paid",
      objectId: "in_paid",
      customerId: "cus_signed_hint",
    });

    const response = await postStripeEvent(t, event);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("OK");
    const state = await stripeState(t);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      stripeEventId: "evt_invoice_paid",
      type: "invoice.paid",
      apiVersion: API_VERSION,
      livemode: false,
      objectId: "in_paid",
      objectCustomerId: "cus_signed_hint",
      eventCreatedAt: NOW,
      status: "received",
      attemptCount: 0,
      receivedAt: NOW,
    });
    expect(state.events[0]).not.toHaveProperty("rawBody");
    expect(state.events[0]).not.toHaveProperty("signature");
    expect(state.scheduled).toEqual([
      {
        name: "organizationStripe/actions:processWebhookEvent",
        args: [{ stripeEventId: "evt_invoice_paid" }],
      },
    ]);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("同じEvent IDの再送を一度だけ保存して処理予約も増やさない", async () => {
    const t = convexTest(schema, modules);
    const event = stripeEvent({ id: "evt_duplicate", type: "customer.subscription.updated", objectId: "sub_1" });

    const first = await postStripeEvent(t, event);
    const second = await postStripeEvent(t, event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const state = await stripeState(t);
    expect(state.events).toHaveLength(1);
    expect(state.scheduled).toHaveLength(1);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("署名済みでも未対応のイベントはreceiptへ保存しない", async () => {
    const t = convexTest(schema, modules);
    const event = stripeEvent({ id: "evt_unsupported", type: "customer.updated", objectId: "cus_1" });

    const response = await postStripeEvent(t, event);

    expect(response.status).toBe(200);
    await expectStripeStateEmpty(t);
  });

  it.each([
    {
      name: "API version不一致",
      event: stripeEvent({
        id: "evt_api_mismatch",
        type: "invoice.paid",
        objectId: "in_1",
        apiVersion: "2026-06-24.dahlia",
      }),
      errorCode: "api_version_mismatch",
    },
    {
      name: "livemode不一致",
      event: stripeEvent({ id: "evt_livemode_mismatch", type: "invoice.paid", objectId: "in_2", livemode: true }),
      errorCode: "livemode_mismatch",
    },
  ])("$nameは処理せずactionRequiredとして安全に記録する", async ({ event, errorCode }) => {
    const t = convexTest(schema, modules);

    const response = await postStripeEvent(t, event);

    expect(response.status).toBe(200);
    const state = await stripeState(t);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ status: "actionRequired", lastErrorCode: errorCode });
    expect(state.scheduled).toEqual([]);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("不正署名ではJSONを解釈せずDB・scheduler・Stripe APIを変更しない", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: '{"type":"invoice.paid"',
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${Math.floor(NOW / 1000)},v1=invalid`,
      },
    });

    expect(response.status).toBe(400);
    await expectStripeStateEmpty(t);
  });

  it("5分を超えた署名timestampを拒否して副作用を起こさない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = JSON.stringify(stripeEvent({ id: "evt_stale", type: "invoice.paid", objectId: "in_stale" }));
    const staleTimestamp = Math.floor(NOW / 1000) - 301;

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody, staleTimestamp),
    });

    expect(response.status).toBe(400);
    await expectStripeStateEmpty(t);
  });

  it("署名headerの欠落と上限超過をbody処理前に拒否する", async () => {
    for (const signature of [undefined, "x".repeat(STRIPE_WEBHOOK_SIGNATURE_MAX_LENGTH + 1)]) {
      const t = convexTest(schema, modules);
      const response = await t.fetch("/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(stripeEvent({ id: "evt_header", type: "invoice.paid", objectId: "in_header" })),
        headers: {
          "content-type": "application/json",
          ...(signature ? { "stripe-signature": signature } : {}),
        },
      });

      expect(response.status).toBe(400);
      await expectStripeStateEmpty(t);
    }
  });

  it("JSON以外のContent-Typeを415で拒否して副作用を起こさない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = JSON.stringify(stripeEvent({ id: "evt_content_type", type: "invoice.paid", objectId: "in_1" }));

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: rawBody,
      headers: { ...(await signedHeaders(rawBody)), "content-type": "text/plain" },
    });

    expect(response.status).toBe(415);
    await expectStripeStateEmpty(t);
  });

  it("署名済みのbody上限ちょうどを受理する", async () => {
    const t = convexTest(schema, modules);
    const rawBody = buildSizedJsonBody(
      stripeEvent({ id: "evt_body_at_limit", type: "customer.updated", objectId: "cus_1" }),
      STRIPE_WEBHOOK_BODY_MAX_BYTES,
    );

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });

    expect(response.status).toBe(200);
    await expectStripeStateEmpty(t);
  });

  it("実bodyが上限を1 byte超えたら413で拒否する", async () => {
    const t = convexTest(schema, modules);
    const rawBody = buildSizedJsonBody(
      stripeEvent({ id: "evt_body_too_large", type: "invoice.paid", objectId: "in_1" }),
      STRIPE_WEBHOOK_BODY_MAX_BYTES + 1,
    );

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${Math.floor(NOW / 1000)},v1=invalid`,
        "content-length": "invalid",
      },
    });

    expect(response.status).toBe(413);
    await expectStripeStateEmpty(t);
  });

  it("署名済みでも対応イベントのshapeが不正ならreceiptへ保存しない", async () => {
    const t = convexTest(schema, modules);
    const malformedEvent = {
      ...stripeEvent({ id: "evt_bad_shape", type: "invoice.paid", objectId: "in_1" }),
      data: {},
    };

    const response = await postStripeEvent(t, malformedEvent);

    expect(response.status).toBe(400);
    await expectStripeStateEmpty(t);
  });
});

function stripeEvent({
  id,
  type,
  objectId,
  apiVersion = API_VERSION,
  livemode = false,
  customerId,
}: {
  id: string;
  type: string;
  objectId: string;
  apiVersion?: string;
  livemode?: boolean;
  customerId?: string;
}) {
  return {
    id,
    object: "event",
    api_version: apiVersion,
    created: Math.floor(NOW / 1000),
    data: {
      object: { id: objectId, object: objectId.split("_", 1)[0], ...(customerId ? { customer: customerId } : {}) },
    },
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

async function postStripeEvent(t: TestConvex<typeof schema>, event: Record<string, unknown>) {
  const rawBody = JSON.stringify(event);
  return await t.fetch("/stripe/webhook", {
    method: "POST",
    body: rawBody,
    headers: await signedHeaders(rawBody),
  });
}

async function signedHeaders(rawBody: string, timestamp = Math.floor(NOW / 1000)) {
  return {
    "content-type": "application/json; charset=utf-8",
    "stripe-signature": `t=${timestamp},v1=${await sign(timestamp, rawBody)}`,
  };
}

async function sign(timestamp: number, rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function stripeState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    customers: await ctx.db.query("organizationStripeCustomers").collect(),
    subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    operations: await ctx.db.query("organizationStripeOperations").collect(),
    events: await ctx.db.query("stripeWebhookEvents").collect(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => ({
      name: job.name,
      args: job.args,
    })),
  }));
}

async function expectStripeStateEmpty(t: TestConvex<typeof schema>) {
  const state = await stripeState(t);
  expect(state.customers).toEqual([]);
  expect(state.subscriptions).toEqual([]);
  expect(state.operations).toEqual([]);
  expect(state.events).toEqual([]);
  expect(state.scheduled).toEqual([]);
  expect(externalFetchMock).not.toHaveBeenCalled();
}
