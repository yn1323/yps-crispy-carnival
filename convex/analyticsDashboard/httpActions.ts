import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import {
  getEventTrendsRef,
  getNotificationBreakdownRef,
  getOverviewRef,
  getShopDetailRef,
  getShopRankingRef,
  getShopStagesRef,
} from "./refs";
import { ANALYTICS_DASHBOARD_MAX_BODY_BYTES, parseAnalyticsDashboardRequest } from "./schemas";

const SECRET_HEADER = "x-shiftori-internal-api-secret";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

async function readJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > ANALYTICS_DASHBOARD_MAX_BODY_BYTES) {
    return { ok: false as const, status: 413, message: "リクエストが大きすぎます" };
  }
  const text = await request.text();
  if (text.length > ANALYTICS_DASHBOARD_MAX_BODY_BYTES) {
    return { ok: false as const, status: 413, message: "リクエストが大きすぎます" };
  }
  try {
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const, status: 400, message: "JSONを読み取れませんでした" };
  }
}

export const query = httpAction(async (ctx, request) => {
  const expectedSecret = process.env.SHIFTORI_INTERNAL_API_SECRET;
  if (!expectedSecret) {
    return jsonResponse({ error: "Analytics dashboard is not configured" }, { status: 503 });
  }
  if (request.headers.get(SECRET_HEADER) !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body.ok) return jsonResponse({ error: body.message }, { status: body.status });

  const parsed = parseAnalyticsDashboardRequest(body.value);
  if (!parsed.ok) return jsonResponse({ error: parsed.message }, { status: 400 });

  const input = parsed.value;
  if (input.kind === "overview") {
    return jsonResponse(await ctx.runQuery(getOverviewRef, { from: input.from, to: input.to }));
  }
  if (input.kind === "eventTrends") {
    return jsonResponse(
      await ctx.runQuery(getEventTrendsRef, { from: input.from, to: input.to, metrics: input.metrics }),
    );
  }
  if (input.kind === "notificationBreakdown") {
    return jsonResponse(await ctx.runQuery(getNotificationBreakdownRef, { from: input.from, to: input.to }));
  }
  if (input.kind === "shopStages") {
    return jsonResponse(await ctx.runQuery(getShopStagesRef, { date: input.date }));
  }
  if (input.kind === "shopRanking") {
    return jsonResponse(
      await ctx.runQuery(getShopRankingRef, { date: input.date, sort: input.sort, limit: input.limit }),
    );
  }
  return jsonResponse(
    await ctx.runQuery(getShopDetailRef, {
      shopId: input.shopId as Id<"shops">,
      from: input.from,
      to: input.to,
    }),
  );
});
