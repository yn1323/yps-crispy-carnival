import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function expectedResponseKeys(endpoint: AnalyticsDashboardRequest["endpoint"]): string[] {
  const keys: Record<AnalyticsDashboardRequest["endpoint"], string[]> = {
    overview: ["comparison", "current", "kind", "metadata"],
    trends: ["granularity", "kind", "metadata", "metrics", "range", "series"],
    milestones: ["current", "currentRates", "granularity", "kind", "metadata", "range", "series"],
    health: ["current", "granularity", "kind", "metadata", "range", "series"],
    organizations: ["kind", "metadata", "rows"],
    organization: ["kind", "metadata", "organization", "series", "shops"],
    shops: ["kind", "metadata", "rows"],
    shop: ["kind", "metadata", "series", "shop"],
    shopCycles: ["kind", "metadata", "rows", "shopId"],
    cycle: ["cycle", "kind", "metadata"],
    segments: ["kind", "metadata", "rows"],
    requests: ["kind", "metadata", "pageInfo", "rows"],
  };
  return keys[endpoint];
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

  it("12種類のrequestを固定internal queryへdispatchし、公開DTOのkey集合を固定する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "Analytics HTTP店舗");
      const shop = await ctx.db.get(shopId);
      if (!shop?.organizationId) throw new Error("organizationId is required");
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
      return { organizationId: shop.organizationId, shopId, recruitmentId };
    });
    const from = "2026-08-01";
    const to = "2026-08-07";
    const cases: Array<{ request: AnalyticsDashboardRequest; expected: Record<string, unknown> }> = [
      {
        request: {
          endpoint: "overview",
          from,
          to,
          compareFrom: null,
          compareTo: null,
          organizationId: null,
          shopId: null,
        },
        expected: { kind: "overview" },
      },
      {
        request: {
          endpoint: "trends",
          from,
          to,
          granularity: "day",
          metrics: ["shopCount"],
          organizationId: null,
          shopId: null,
        },
        expected: { kind: "trends", range: { from, to }, granularity: "day", metrics: ["shopCount"] },
      },
      {
        request: { endpoint: "milestones", from, to, granularity: "day", organizationId: null, shopId: null },
        expected: { kind: "milestones", range: { from, to }, granularity: "day" },
      },
      {
        request: { endpoint: "health", from, to, granularity: "day", organizationId: null, shopId: null },
        expected: { kind: "health", range: { from, to }, granularity: "day" },
      },
      {
        request: {
          endpoint: "organizations",
          from,
          to,
          cursor: null,
          limit: 1,
          sort: "registeredAt",
          direction: "desc",
          plan: "business",
          completeness: "complete",
        },
        expected: { kind: "organizations", metadata: { pageInfo: { cursor: null, pageSize: 1 } }, rows: [] },
      },
      {
        request: {
          endpoint: "organization",
          organizationId: ids.organizationId,
          from,
          to,
          granularity: "day",
          cursor: null,
          limit: 1,
        },
        expected: { kind: "organization", metadata: { pageInfo: { cursor: null, pageSize: 1 } } },
      },
      {
        request: {
          endpoint: "shops",
          from,
          to,
          cursor: null,
          limit: 1,
          sort: "latestActivityAt",
          direction: "desc",
          organizationId: ids.organizationId,
          plan: "business",
          shopSize: "50+",
          cohort: "2026-08",
          cadence: "weekly",
          lineUsage: "high",
          health: "needsAttention",
          usage: "candidate",
          completeness: "complete",
        },
        expected: { kind: "shops", metadata: { pageInfo: { cursor: null, pageSize: 1 } }, rows: [] },
      },
      {
        request: { endpoint: "shop", shopId: ids.shopId, from, to, granularity: "day" },
        expected: { kind: "shop" },
      },
      {
        request: {
          endpoint: "shopCycles",
          shopId: ids.shopId,
          from,
          to,
          cursor: null,
          limit: 1,
          sort: "periodStart",
          direction: "desc",
          completeness: "complete",
        },
        expected: {
          kind: "shopCycles",
          shopId: ids.shopId,
          metadata: { pageInfo: { cursor: null, pageSize: 1 } },
        },
      },
      {
        request: { endpoint: "cycle", shopId: ids.shopId, recruitmentId: ids.recruitmentId },
        expected: { kind: "cycle" },
      },
      {
        request: {
          endpoint: "segments",
          from,
          to,
          cursor: null,
          limit: 1,
          sort: "dimension",
          direction: "asc",
          dimension: "plan",
          completeness: "complete",
        },
        expected: { kind: "segments", metadata: { pageInfo: { cursor: null, pageSize: 1 } }, rows: [] },
      },
      {
        request: { endpoint: "requests", cursor: null, limit: 1 },
        expected: { kind: "requests", pageInfo: { cursor: null, pageSize: 1 } },
      },
    ];

    for (const { request, expected } of cases) {
      const response = await post(t, request);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject(expected);
      expect(Object.keys(body).sort()).toEqual(expectedResponseKeys(request.endpoint));
    }

    await expect(rateLimitRows(t)).resolves.toEqual([
      { name: "analyticsDashboardService", key: "service", value: 108, ts: Date.now() },
    ]);
  });

  it("schema上有効でも存在しないIDは内部情報を含まない404へ揃える", async () => {
    const t = convexTest(schema, modules);

    const response = await post(t, {
      endpoint: "shop",
      shopId: "missing-shop",
      from: "2026-08-01",
      to: "2026-08-07",
      granularity: "day",
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

  it("query例外を503へ変換し、logには安全なrequest metadataだけを残す", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    const privateCursor = "private-person@example.com";

    const response = await post(
      t,
      { endpoint: "requests", cursor: privateCursor, limit: 1 },
      { headers: { "cf-ray": "analytics-request-1" } },
    );

    await expectJsonResponse(response, 503, { error: "service_unavailable" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("analytics_dashboard_request_failed", {
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
