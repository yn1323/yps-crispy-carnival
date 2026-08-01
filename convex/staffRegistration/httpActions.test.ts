import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  STAFF_REGISTRATION_EMAIL_SHORT_LIMIT,
  STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT,
  STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES,
  STAFF_REGISTRATION_IP_SHORT_LIMIT,
  STAFF_REGISTRATION_LINK_SHORT_LIMIT,
  STAFF_REGISTRATION_PENDING_LIMIT,
} from "../constants";

const ORIGIN = "https://shiftori.app";
const PATH = "/staff-registration/submit";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function validBody(token: string, index = 1, overrides: Record<string, unknown> = {}) {
  return {
    token,
    name: `申請スタッフ${index}`,
    email: `staff-${index}@example.com`,
    acceptedLegal: true,
    requestId: uuid(10_000 + index),
    turnstileToken: `turnstile-token-${index}`,
    ...overrides,
  };
}

function turnstileSuccess() {
  return new Response(JSON.stringify({ success: true, action: "staff_registration", hostname: "shiftori.app" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function createRegistrationLink(
  t: TestConvex<typeof schema>,
  suffix: string,
): Promise<{ shopId: Id<"shops">; token: string }> {
  const subject = `staff_registration_http_${suffix}`;
  const shopId = await t.run(async (ctx) => {
    const seeded = await seedManagerShop(ctx, { subject, email: `${suffix}@example.com` });
    return seeded.shopId;
  });
  const link = await t
    .withIdentity({ subject })
    .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });
  return { shopId, token: link.token };
}

async function businessSideEffects(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    requests: await ctx.db.query("staffRegistrationRequests").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

async function post(t: TestConvex<typeof schema>, body: unknown, headers: Record<string, string> = {}) {
  return await t.fetch(PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("staffRegistration/httpActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00+09:00"));
    vi.stubEnv("APP_URL", ORIGIN);
    vi.stubEnv("STAFF_REGISTRATION_ALLOWED_ORIGINS", "");
    vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("Turnstile検証後にHTTP Actionからだけ参加申請を作成する", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => turnstileSuccess());
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { shopId, token } = await createRegistrationLink(t, "success");

    const response = await post(t, validBody(token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const turnstileRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((turnstileRequest.body as FormData).get("response")).toBe("turnstile-token-1");
    expect((turnstileRequest.body as FormData).get("idempotency_key")).toBeNull();

    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toMatchObject([
      { shopId, name: "申請スタッフ1", email: "staff-1@example.com", status: "pending" },
    ]);
  });

  it.each(["GET", "PUT", "PATCH", "DELETE"])("%sではrouteを公開せず副作用を作らない", async (method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch(PATH, { method, headers: { origin: ORIGIN } });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(businessSideEffects(t)).resolves.toEqual({ requests: [], audits: [], outbox: [], scheduled: [] });
  });

  it("許可Originだけへ最小限のCORSを返す", async () => {
    const t = convexTest(schema, modules);
    const allowed = await t.fetch(PATH, { method: "OPTIONS", headers: { origin: ORIGIN } });
    const denied = await t.fetch(PATH, { method: "OPTIONS", headers: { origin: "https://evil.example" } });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(allowed.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(allowed.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([null, "https://evil.example"])("不許可Origin %s はbody読取とTurnstile前に拒否する", async (origin) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { token } = await createRegistrationLink(t, `origin_${origin ?? "missing"}`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (origin) headers.origin = origin;

    const before = await businessSideEffects(t);
    const response = await t.fetch(PATH, { method: "POST", headers, body: JSON.stringify(validBody(token)) });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(businessSideEffects(t)).resolves.toEqual(before);
  });

  it.each([
    ["content-typeなし", {}, JSON.stringify(validBody(uuid(1))), 415],
    ["JSON以外", { "content-type": "text/plain" }, JSON.stringify(validBody(uuid(1))), 415],
    ["不正JSON", { "content-type": "application/json" }, "{", 400],
    [
      "Content-Length上限超過",
      {
        "content-type": "application/json",
        "content-length": String(STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES + 1),
      },
      JSON.stringify(validBody(uuid(1))),
      413,
    ],
    [
      "body上限超過",
      { "content-type": "application/json" },
      JSON.stringify({ padding: "x".repeat(STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES) }),
      413,
    ],
    [
      "schema外field",
      { "content-type": "application/json" },
      JSON.stringify({ ...validBody(uuid(1)), privilege: "manager" }),
      400,
    ],
  ] as const)("%sはTurnstileとDB前に拒否する", async (_label, extraHeaders, body, status) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const before = await businessSideEffects(t);

    const response = await t.fetch(PATH, {
      method: "POST",
      headers: { origin: ORIGIN, ...extraHeaders },
      body,
    });

    expect(response.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(businessSideEffects(t)).resolves.toEqual(before);
  });

  it.each([
    ["失敗", { success: false }],
    ["別action", { success: true, action: "contact", hostname: "shiftori.app" }],
    ["別hostname", { success: true, action: "staff_registration", hostname: "evil.example" }],
    ["action欠落", { success: true, hostname: "shiftori.app" }],
  ] as const)("Turnstileの%sは業務mutationを呼ばず安全に拒否する", async (_label, result) => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { token } = await createRegistrationLink(t, `turnstile_${_label}`);
    const before = await businessSideEffects(t);

    const response = await post(t, validBody(token));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "セキュリティ確認をやり直してください。" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(businessSideEffects(t)).resolves.toEqual(before);
  });

  it("Turnstile失敗を固定global budgetで止め、上限後はSiteverifyを呼ばない", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { token } = await createRegistrationLink(t, "turnstile_flood");
    const statuses: number[] = [];

    for (let index = 0; index <= STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT; index += 1) {
      statuses.push((await post(t, validBody(token, index + 1))).status);
    }

    expect(statuses.slice(0, STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT)).toEqual(
      Array.from({ length: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT }, () => 400),
    );
    expect(statuses.at(-1)).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT);
    const rateLimitRows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
    expect(rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
    expect(rateLimitRows).toHaveLength(1);
    await expect(businessSideEffects(t)).resolves.toEqual({ requests: [], audits: [], outbox: [], scheduled: [] });
  });

  it("new・pending・登録済み・pending上限を同じ受付DTOにし、不要な副作用を作らない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const { shopId, token } = await createRegistrationLink(t, "generic");
    await t.run(async (ctx) => {
      await ctx.db.insert("staffs", {
        shopId,
        name: "登録済みスタッフ",
        email: "existing@example.com",
        emailNormalized: "existing@example.com",
        isDeleted: false,
      });
      for (let index = 0; index < STAFF_REGISTRATION_PENDING_LIMIT - 1; index += 1) {
        const email = `seeded-${index}@example.com`;
        await ctx.db.insert("staffRegistrationRequests", {
          shopId,
          name: `既存申請${index}`,
          email,
          emailNormalized: email,
          status: "pending",
          termsConsentVersion: "2026-01-01",
          privacyConsentVersion: "2026-01-01",
          termsDocumentVersion: "2026-01-01",
          privacyDocumentVersion: "2026-01-01",
          consentedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
    });

    const responses = await Promise.all([
      post(t, validBody(token, 1, { email: "new@example.com" })),
      post(t, validBody(token, 2, { email: "NEW@example.com" })),
      post(t, validBody(token, 3, { email: "existing@example.com" })),
      post(t, validBody(token, 4, { email: "over-cap@example.com" })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    await expect(Promise.all(responses.map(async (response) => await response.json()))).resolves.toEqual(
      Array.from({ length: 4 }, () => ({ status: "accepted" })),
    );
    const state = await businessSideEffects(t);
    expect(state.requests).toHaveLength(STAFF_REGISTRATION_PENDING_LIMIT);
    expect(state.requests.filter((request) => request.emailNormalized === "new@example.com")).toHaveLength(1);
    expect(state.requests.some((request) => request.emailNormalized === "over-cap@example.com")).toBe(false);
    expect(state.audits).toEqual([]);
    expect(state.outbox).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("メール表記を変えても同じhash budgetへ集約し、拒否試行でlink予算を消費しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const { token } = await createRegistrationLink(t, "email_budget");
    const statuses: number[] = [];

    for (let index = 0; index < STAFF_REGISTRATION_EMAIL_SHORT_LIMIT + 1; index += 1) {
      const response = await post(
        t,
        validBody(token, index + 1, { email: index % 2 === 0 ? " Same@Example.com " : "same@example.com" }),
      );
      statuses.push(response.status);
    }
    for (
      let index = 0;
      index < STAFF_REGISTRATION_LINK_SHORT_LIMIT - STAFF_REGISTRATION_EMAIL_SHORT_LIMIT;
      index += 1
    ) {
      const response = await post(t, validBody(token, 100 + index));
      statuses.push(response.status);
    }
    statuses.push((await post(t, validBody(token, 200))).status);

    expect(statuses).toEqual([
      ...Array.from({ length: STAFF_REGISTRATION_EMAIL_SHORT_LIMIT }, () => 200),
      429,
      ...Array.from({ length: STAFF_REGISTRATION_LINK_SHORT_LIMIT - STAFF_REGISTRATION_EMAIL_SHORT_LIMIT }, () => 200),
      429,
    ]);
    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toHaveLength(1 + STAFF_REGISTRATION_LINK_SHORT_LIMIT - STAFF_REGISTRATION_EMAIL_SHORT_LIMIT);
  });

  it("同じメールでも登録linkが異なれば別budgetになり、別店舗の申請を妨げない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const first = await createRegistrationLink(t, "email_scope_first");
    const second = await createRegistrationLink(t, "email_scope_second");
    const statuses: number[] = [];

    for (const token of [first.token, second.token]) {
      for (let index = 0; index <= STAFF_REGISTRATION_EMAIL_SHORT_LIMIT; index += 1) {
        statuses.push(
          (
            await post(
              t,
              validBody(token, 300 + statuses.length, {
                email: "same-person@example.com",
              }),
            )
          ).status,
        );
      }
    }

    expect(statuses).toEqual([
      ...Array.from({ length: STAFF_REGISTRATION_EMAIL_SHORT_LIMIT }, () => 200),
      429,
      ...Array.from({ length: STAFF_REGISTRATION_EMAIL_SHORT_LIMIT }, () => 200),
      429,
    ]);
    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((request) => request.shopId))).toEqual(new Set([first.shopId, second.shopId]));
  });

  it("同じ登録linkへメールを替える攻撃をlink budgetで止める", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const { token } = await createRegistrationLink(t, "link_budget");
    const statuses: number[] = [];

    for (let index = 0; index <= STAFF_REGISTRATION_LINK_SHORT_LIMIT; index += 1) {
      statuses.push((await post(t, validBody(token, index + 1))).status);
    }

    expect(statuses).toEqual([...Array.from({ length: STAFF_REGISTRATION_LINK_SHORT_LIMIT }, () => 200), 429]);
    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toHaveLength(STAFF_REGISTRATION_LINK_SHORT_LIMIT);
  });

  it("重複tokenはlink・email固有のrate rowを作らず一般化したエラーで止める", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const duplicateToken = uuid(25_000);
    await t.run(async (ctx) => {
      for (const index of [1, 2]) {
        const shopId = await seedShop(ctx, `重複HTTP token店舗${index}`);
        await ctx.db.insert("shopRegistrationLinks", { shopId, token: duplicateToken, createdAt: Date.now() });
      }
    });

    const response = await post(t, validBody(duplicateToken));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "登録リンクの有効期限が切れています。" });
    const state = await t.run(async (ctx) => ({
      requests: await ctx.db.query("staffRegistrationRequests").collect(),
      rateLimitRows: await ctx.db.query("rateLimits").collect(),
    }));
    expect(state.requests).toEqual([]);
    expect(state.rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
    expect(state.rateLimitRows).toHaveLength(1);
  });

  it("Turnstile後に店舗状態が利用不能なら安全なlink errorへ変換し、申請を作らない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const { shopId, token } = await createRegistrationLink(t, "archived_after_verification");
    await t.run(async (ctx) => await ctx.db.patch(shopId, { operatingStatus: "archived" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(t, validBody(token));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "登録リンクの有効期限が切れています。" });
    expect(errorSpy).not.toHaveBeenCalled();
    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toEqual([]);
  });

  it("信頼する設定の送信元IPはlinkとメールを替えても共通budgetへ集約する", async () => {
    vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "cf-connecting-ip");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const tokens = await t.run(async (ctx) => {
      const values: string[] = [];
      for (let index = 0; index <= STAFF_REGISTRATION_IP_SHORT_LIMIT; index += 1) {
        const shopId = await seedShop(ctx, `IP budget店舗${index}`);
        const token = uuid(20_000 + index);
        await ctx.db.insert("shopRegistrationLinks", { shopId, token, createdAt: Date.now() });
        values.push(token);
      }
      return values;
    });
    const statuses: number[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      statuses.push(
        (
          await post(t, validBody(tokens[index] ?? "", index + 1), {
            "cf-connecting-ip": "203.0.113.10",
            "x-forwarded-for": `198.51.100.${index + 1}`,
          })
        ).status,
      );
    }

    expect(statuses).toEqual([...Array.from({ length: STAFF_REGISTRATION_IP_SHORT_LIMIT }, () => 200), 429]);
    const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
    expect(requests).toHaveLength(STAFF_REGISTRATION_IP_SHORT_LIMIT);
  });

  it("無効tokenを替える攻撃もglobal budgetで止め、token固有の業務状態を作らない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => turnstileSuccess()),
    );
    const t = convexTest(schema, modules);
    const statuses: number[] = [];

    for (let index = 0; index <= STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT; index += 1) {
      const response = await post(t, validBody(uuid(30_000 + index), index + 1));
      statuses.push(response.status);
    }

    expect(statuses.slice(0, STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT)).toEqual(
      Array.from({ length: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT }, () => 400),
    );
    expect(statuses.at(-1)).toBe(429);
    await expect(businessSideEffects(t)).resolves.toEqual({ requests: [], audits: [], outbox: [], scheduled: [] });
    const rateLimitRows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
    expect(rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
    expect(rateLimitRows).toHaveLength(1);
  });
});
