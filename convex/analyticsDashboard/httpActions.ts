import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { readBoundedJsonBody } from "../_lib/httpBody";
import {
  consumeServiceRequestRef,
  getCycleRef,
  getFeatureRequestsRef,
  getHealthRef,
  getMilestonesRef,
  getOrganizationRef,
  getOrganizationsRef,
  getOverviewRef,
  getSegmentsRef,
  getShopCyclesRef,
  getShopRef,
  getShopsRef,
  getTrendsRef,
} from "./refs";
import {
  ANALYTICS_DASHBOARD_MAX_BODY_BYTES,
  ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES,
  type AnalyticsDashboardRequest,
  parseAnalyticsDashboardRequest,
} from "./schemas";

const SECRET_HEADER = "x-shiftori-internal-api-secret";
const MAX_SECRET_LENGTH = 512;
const MAX_REQUEST_ID_LENGTH = 64;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

function secretMatches(actual: string | null, expected: string): boolean {
  const left = actual ?? "";
  let difference = left.length ^ expected.length;
  for (let index = 0; index < MAX_SECRET_LENGTH; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return left.length <= MAX_SECRET_LENGTH && expected.length <= MAX_SECRET_LENGTH && difference === 0;
}

function safeRequestId(request: Request): string | null {
  const value = request.headers.get("cf-ray");
  if (!value || value.length > MAX_REQUEST_ID_LENGTH || !SAFE_REQUEST_ID_PATTERN.test(value)) return null;
  return value;
}

function boundedJsonResponse(body: unknown): Response {
  const serialized = JSON.stringify(body);
  if (
    serialized === undefined ||
    new TextEncoder().encode(serialized).byteLength >= ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES
  ) {
    return jsonResponse({ error: "response_too_large" }, { status: 502 });
  }
  return new Response(serialized, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function notFoundResponse(): Response {
  return jsonResponse({ error: "not_found" }, { status: 404 });
}

function retryAfterSeconds(retryAt: number | null): string {
  if (retryAt === null) return "60";
  return String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000)));
}

async function dispatchQuery(
  ctx: Pick<ActionCtx, "runQuery">,
  input: AnalyticsDashboardRequest,
): Promise<unknown | null> {
  switch (input.endpoint) {
    case "overview":
      return await ctx.runQuery(getOverviewRef, {
        from: input.from,
        to: input.to,
        compareFrom: input.compareFrom,
        compareTo: input.compareTo,
        organizationId: input.organizationId,
        shopId: input.shopId,
      });
    case "trends":
      return await ctx.runQuery(getTrendsRef, {
        from: input.from,
        to: input.to,
        granularity: input.granularity,
        metrics: input.metrics,
        organizationId: input.organizationId,
        shopId: input.shopId,
      });
    case "milestones":
      return await ctx.runQuery(getMilestonesRef, {
        from: input.from,
        to: input.to,
        granularity: input.granularity,
        organizationId: input.organizationId,
        shopId: input.shopId,
      });
    case "health":
      return await ctx.runQuery(getHealthRef, {
        from: input.from,
        to: input.to,
        granularity: input.granularity,
        organizationId: input.organizationId,
        shopId: input.shopId,
      });
    case "organizations":
      return await ctx.runQuery(getOrganizationsRef, {
        from: input.from,
        to: input.to,
        cursor: input.cursor,
        limit: input.limit,
        sort: input.sort,
        direction: input.direction,
        plan: input.plan,
        completeness: input.completeness,
      });
    case "organization":
      return await ctx.runQuery(getOrganizationRef, {
        organizationId: input.organizationId,
        from: input.from,
        to: input.to,
        granularity: input.granularity,
        cursor: input.cursor,
        limit: input.limit,
      });
    case "shops":
      return await ctx.runQuery(getShopsRef, {
        from: input.from,
        to: input.to,
        cursor: input.cursor,
        limit: input.limit,
        sort: input.sort,
        direction: input.direction,
        organizationId: input.organizationId,
        plan: input.plan,
        shopSize: input.shopSize,
        cohort: input.cohort,
        cadence: input.cadence,
        lineUsage: input.lineUsage,
        health: input.health,
        usage: input.usage,
        completeness: input.completeness,
      });
    case "shop":
      return await ctx.runQuery(getShopRef, {
        shopId: input.shopId,
        from: input.from,
        to: input.to,
        granularity: input.granularity,
      });
    case "shopCycles":
      return await ctx.runQuery(getShopCyclesRef, {
        shopId: input.shopId,
        from: input.from,
        to: input.to,
        cursor: input.cursor,
        limit: input.limit,
        sort: input.sort,
        direction: input.direction,
        completeness: input.completeness,
      });
    case "cycle":
      return await ctx.runQuery(getCycleRef, {
        shopId: input.shopId,
        recruitmentId: input.recruitmentId,
      });
    case "segments":
      return await ctx.runQuery(getSegmentsRef, {
        from: input.from,
        to: input.to,
        cursor: input.cursor,
        limit: input.limit,
        sort: input.sort,
        direction: input.direction,
        dimension: input.dimension,
        completeness: input.completeness,
      });
    case "requests":
      return await ctx.runQuery(getFeatureRequestsRef, {
        cursor: input.cursor,
        limit: input.limit,
      });
  }
}

export const query = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "invalid_request" }, { status: 405, headers: { allow: "POST" } });
  }

  const expectedSecret = process.env.SHIFTORI_INTERNAL_API_SECRET;
  if (!expectedSecret) {
    return jsonResponse({ error: "service_unavailable" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get(SECRET_HEADER), expectedSecret)) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  let rateLimit: { allowed: boolean; retryAt: number | null };
  try {
    rateLimit = await ctx.runMutation(consumeServiceRequestRef, {});
  } catch {
    return jsonResponse({ error: "service_unavailable" }, { status: 503 });
  }
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": retryAfterSeconds(rateLimit.retryAt) } },
    );
  }

  const body = await readBoundedJsonBody(request, ANALYTICS_DASHBOARD_MAX_BODY_BYTES);
  if (!body.ok && body.error === "unsupported_media_type") {
    return jsonResponse({ error: "invalid_content_type" }, { status: 415 });
  }
  if (!body.ok && body.error === "body_too_large") {
    return jsonResponse({ error: "request_too_large" }, { status: 413 });
  }
  if (!body.ok) return jsonResponse({ error: "invalid_request" }, { status: 400 });

  let value: unknown;
  try {
    value = JSON.parse(body.rawBody) as unknown;
  } catch {
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseAnalyticsDashboardRequest(value);
  if (!parsed.ok) return jsonResponse({ error: "invalid_request" }, { status: 400 });

  try {
    const result = await dispatchQuery(ctx, parsed.value);
    if (result === null) return notFoundResponse();
    return boundedJsonResponse(result);
  } catch {
    console.error("analytics_dashboard_request_failed", {
      endpoint: parsed.value.endpoint,
      requestId: safeRequestId(request),
      status: "internal_error",
    });
    return jsonResponse({ error: "service_unavailable" }, { status: 503 });
  }
});
