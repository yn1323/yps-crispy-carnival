import {
  type AnalyticsDashboardEndpoint,
  type AnalyticsDashboardRequest,
  normalizeBrowserRequestInput,
} from "../../../../convex/analyticsDashboard/schemas";
export type AnalyticsRouteMatch =
  | { ok: true; request: AnalyticsDashboardRequest }
  | { ok: false; status: 400 | 404; message: string };
function parseRoute(
  endpoint: AnalyticsDashboardEndpoint,
  url: URL,
  pathIds: { shopId?: string; staffId?: string; recruitmentId?: string } = {},
): AnalyticsRouteMatch {
  const parsed = normalizeBrowserRequestInput(endpoint, url.searchParams, pathIds);
  return parsed.ok
    ? { ok: true, request: parsed.value }
    : { ok: false, status: 400, message: "指定内容が正しくありません" };
}
export function matchAnalyticsRoute(url: URL): AnalyticsRouteMatch {
  const endpoint = new Map<string, AnalyticsDashboardEndpoint>([
    ["/api/analytics/overview", "overview"],
    ["/api/analytics/shops", "shops"],
    ["/api/requests", "requests"],
  ]).get(url.pathname);
  if (endpoint) return parseRoute(endpoint, url);
  try {
    const detail = /^\/api\/analytics\/shops\/([^/]+)(?:\/(staff|cycles)\/([^/]+))?$/.exec(url.pathname);
    if (detail) {
      const shopId = decodeURIComponent(detail[1]);
      if (detail[2] === "staff") return parseRoute("staff", url, { shopId, staffId: decodeURIComponent(detail[3]) });
      if (detail[2] === "cycles")
        return parseRoute("cycle", url, { shopId, recruitmentId: decodeURIComponent(detail[3]) });
      return parseRoute("shop", url, { shopId });
    }
  } catch {
    return { ok: false, status: 400, message: "IDが正しくありません" };
  }
  return { ok: false, status: 404, message: "APIが見つかりません" };
}
