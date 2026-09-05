import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONVEX_FUNCTION_ERROR_MARKER } from "../_lib/errorObservability";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  ANALYTICS_DASHBOARD_MAX_BODY_BYTES,
  ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES,
  type AnalyticsDashboardRequest,
} from "./schemas";

const PATH = "/analytics-dashboard/query";
const SECRET_HEADER = "x-shiftori-internal-api-secret";
const SERVICE_SECRET = "analytics-dashboard-test-secret";

async function post(
  t: TestConvex<typeof schema>,
  body: unknown,
  options: { headers?: Record<string, string>; rawBody?: string } = {},
) {
  return await t.fetch(PATH, {
    method: "POST",
    headers: {
      [SECRET_HEADER]: SERVICE_SECRET,
      "content-type": "application/json; charset=utf-8",
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function expectJsonResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

async function rateLimitRows(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("rateLimits").collect()).map(({ name, key, value, ts }) => ({ name, key, value, ts })),
  );
}

describe("analyticsDashboard/httpActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00+09:00"));
    vi.stubEnv("SHIFTORI_INTERNAL_API_SECRET", SERVICE_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "%sではrouteを公開せずrate limitを消費しない",
    async (method) => {
      const t = convexTest(schema, modules);

      const response = await t.fetch(PATH, { method });

      expect(response.status).toBe(404);
      await expect(rateLimitRows(t)).resolves.toEqual([]);
    },
  );

  it.each([
    ["環境secret未設定", "", undefined, 503, { error: "service_unavailable" }],
    ["credential欠落", SERVICE_SECRET, undefined, 401, { error: "unauthorized" }],
    ["credential不一致", SERVICE_SECRET, "wrong-secret", 401, { error: "unauthorized" }],
    ["credential上限超過", SERVICE_SECRET, "x".repeat(513), 401, { error: "unauthorized" }],
    ["環境secret上限超過", "x".repeat(513), "x".repeat(513), 401, { error: "unauthorized" }],
  ] as const)(
    "%sは入力を読む前に安全なresponseで拒否する",
    async (_label, expectedSecret, actualSecret, status, body) => {
      vi.stubEnv("SHIFTORI_INTERNAL_API_SECRET", expectedSecret);
      const t = convexTest(schema, modules);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (actualSecret !== undefined) headers[SECRET_HEADER] = actualSecret;

      const response = await t.fetch(PATH, {
        method: "POST",
        headers,
        body: "{invalid-json-that-must-not-be-read",
      });

      await expectJsonResponse(response, status, body);
      await expect(rateLimitRows(t)).resolves.toEqual([]);
    },
  );

  it.each([
    [
      "content-type欠落",
      {},
      JSON.stringify({ endpoint: "requests", cursor: null, limit: 1 }),
      415,
      "invalid_content_type",
    ],
    [
      "JSON以外のcontent-type",
      { "content-type": "text/plain" },
      JSON.stringify({ endpoint: "requests", cursor: null, limit: 1 }),
      415,
      "invalid_content_type",
    ],
    [
      "Content-Length上限超過",
      { "content-type": "application/json", "content-length": String(ANALYTICS_DASHBOARD_MAX_BODY_BYTES + 1) },
      JSON.stringify({ endpoint: "requests", cursor: null, limit: 1 }),
      413,
      "request_too_large",
    ],
    [
      "実body上限超過",
      { "content-type": "application/json" },
      JSON.stringify({ padding: "x".repeat(ANALYTICS_DASHBOARD_MAX_BODY_BYTES) }),
      413,
      "request_too_large",
    ],
    ["不正JSON", { "content-type": "application/json" }, "{", 400, "invalid_request"],
    [
      "schema外field",
      { "content-type": "application/json" },
      JSON.stringify({ endpoint: "requests", cursor: null, limit: 1, includeSecrets: true }),
      400,
      "invalid_request",
    ],
  ] as const)("%sは分析queryへdispatchしない", async (_label, requestHeaders, body, status, error) => {
    const t = convexTest(schema, modules);

    const response = await t.fetch(PATH, {
      method: "POST",
      headers: { [SECRET_HEADER]: SERVICE_SECRET, ...requestHeaders },
      body,
    });

    await expectJsonResponse(response, status, { error });
    await expect(rateLimitRows(t)).resolves.toEqual([
      { name: "analyticsDashboardService", key: "service", value: 119, ts: Date.now() },
    ]);
  });

  it("service全体のrate limitを超えたrequestはRetry-After付きで拒否する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", {
        name: "analyticsDashboardService",
        key: "service",
        value: 0,
        ts: Date.now(),
      });
    });

    const response = await post(t, { endpoint: "requests", cursor: null, limit: 1 });

    await expectJsonResponse(response, 429, { error: "rate_limited" });
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(rateLimitRows(t)).resolves.toEqual([
      { name: "analyticsDashboardService", key: "service", value: 0, ts: Date.now() },
    ]);
  });

  it("rate limitの状態を安全に読めない場合はqueryを実行せず503へ変換する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const value of [120, 119]) {
        await ctx.db.insert("rateLimits", {
          name: "analyticsDashboardService",
          key: "service",
          value,
          ts: Date.now(),
        });
      }
    });

    const response = await post(t, { endpoint: "requests", cursor: null, limit: 1 });

    await expectJsonResponse(response, 503, { error: "service_unavailable" });
    expect(await rateLimitRows(t)).toHaveLength(2);
  });

  it("固定されたread queryだけをdispatchし、集計未開始でも問い合わせを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "Analytics HTTP店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "HTTPスタッフ", email: "http-staff@example.com" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, staffId, recruitmentId };
    });
    const cases: AnalyticsDashboardRequest[] = [
      { endpoint: "overview", rangeDays: 7 },
      { endpoint: "shops", cursor: null, limit: 1, search: "", date: null, metric: null },
      { endpoint: "shop", shopId: ids.shopId, cursor: null, limit: 1 },
      { endpoint: "staff", shopId: ids.shopId, staffId: ids.staffId, cursor: null, limit: 1 },
      { endpoint: "cycle", shopId: ids.shopId, recruitmentId: ids.recruitmentId },
      { endpoint: "requests", cursor: null, limit: 1 },
    ];
    for (const request of cases) {
      const response = await post(t, request);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.kind).toBe(request.endpoint);
      expect(body.asOf).toBe(Date.now());
      if (request.endpoint !== "staff") expect(JSON.stringify(body)).not.toContain("http-staff@example.com");
    }
  });

  it("要望更新は専用routeに限定し、本人credentialとbooleanを必須にする", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(
      async (ctx) => await ctx.db.insert("featureRequests", { comment: "本文", requestId: "request" }),
    );
    const body = { endpoint: "setFeatureRequestDeleted", id, isDeleted: true };
    const deniedRead = await post(t, body);
    await expectJsonResponse(deniedRead, 400, { error: "invalid_request" });
    const unauthorized = await t.fetch("/analytics-dashboard/mutation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await expectJsonResponse(unauthorized, 401, { error: "unauthorized" });
    expect(await t.run(async (ctx) => (await ctx.db.get(id))?.isDeleted)).toBeUndefined();
    const headers = { [SECRET_HEADER]: SERVICE_SECRET, "content-type": "application/json" };
    const malformed = await t.fetch("/analytics-dashboard/mutation", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, isDeleted: "true" }),
    });
    await expectJsonResponse(malformed, 400, { error: "invalid_request" });
    const success = await t.fetch("/analytics-dashboard/mutation", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    await expectJsonResponse(success, 200, { kind: "requestUpdated", id, isDeleted: true });
    const read = await post(t, { endpoint: "requests", cursor: null, limit: 1 });
    expect(((await read.json()) as { rows: Array<{ id: string; isDeleted: boolean }> }).rows).toMatchObject([
      { id, isDeleted: true },
    ]);
    const missing = await t.fetch("/analytics-dashboard/mutation", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, id: "missing" }),
    });
    await expectJsonResponse(missing, 404, { error: "not_found" });
  });

  it("schema上有効でも存在しないIDは内部情報を含まない404へ揃える", async () => {
    const t = convexTest(schema, modules);

    const response = await post(t, {
      endpoint: "shop",
      shopId: "missing-shop",
      cursor: null,
      limit: 50,
    });

    await expectJsonResponse(response, 404, { error: "not_found" });
  });

  it("response上限以上のquery結果を返さず502へ変換する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "Analytics response上限店舗");
      await ctx.db.insert("featureRequests", {
        shopId,
        comment: "x".repeat(ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES),
        requestId: "oversized-response",
      });
    });

    const response = await post(t, { endpoint: "requests", cursor: null, limit: 50 });

    await expectJsonResponse(response, 502, { error: "response_too_large" });
  });

  it("query例外を503へ変換し、functionとHTTP境界へ安全なlogだけを残す", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    const privateCursor = "private-person@example.com";

    const response = await post(
      t,
      { endpoint: "requests", cursor: privateCursor, limit: 1 },
      { headers: { "cf-ray": "analytics-request-1" } },
    );

    await expectJsonResponse(response, 503, { error: "service_unavailable" });
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenNthCalledWith(1, CONVEX_FUNCTION_ERROR_MARKER, {
      schemaVersion: 1,
      functionKind: "query",
      failureKind: "unexpected",
      errorCode: "unexpected_error",
    });
    expect(errorSpy).toHaveBeenNthCalledWith(2, "analytics_dashboard_request_failed", {
      endpoint: "requests",
      requestId: "analytics-request-1",
      status: "internal_error",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(SERVICE_SECRET);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(privateCursor);
  });

  it("安全でないrequest IDをlogへ残さない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = convexTest(schema, modules);

    const response = await post(
      t,
      { endpoint: "requests", cursor: "not-a-convex-cursor", limit: 1 },
      { headers: { "cf-ray": "staff@example.com unsafe" } },
    );

    await expectJsonResponse(response, 503, { error: "service_unavailable" });
    expect(errorSpy).toHaveBeenCalledWith("analytics_dashboard_request_failed", {
      endpoint: "requests",
      requestId: null,
      status: "internal_error",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("staff@example.com");
  });
});
