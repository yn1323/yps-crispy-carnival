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
    ["/api/analytics/notifications", "notifications"],
    ["/api/analytics/notifications/summary", "notificationSummary"],
    ["/api/requests", "requests"],
  ]).get(url.pathname);
  if (endpoint) return parseRoute(endpoint, url);
  try {
    const organizationEvents = /^\/api\/analytics\/shops\/([^/]+)\/organization-events$/.exec(url.pathname);
    if (organizationEvents)
      return parseRoute("organizationEvents", url, { shopId: decodeURIComponent(organizationEvents[1]) });
    const detail = /^\/api\/analytics\/shops\/([^/]+)(?:\/(staff|cycles)\/([^/]+)(\/timeline)?)?$/.exec(url.pathname);
    if (detail) {
      const shopId = decodeURIComponent(detail[1]);
      if (detail[2] === "staff")
        return parseRoute(detail[4] ? "staffTimeline" : "staff", url, {
          shopId,
          staffId: decodeURIComponent(detail[3]),
        });
      if (detail[2] === "cycles" && !detail[4])
        return parseRoute("cycle", url, { shopId, recruitmentId: decodeURIComponent(detail[3]) });
      if (!detail[2]) return parseRoute("shop", url, { shopId });
    }
  } catch {
    return { ok: false, status: 400, message: "IDが正しくありません" };
  }
  return { ok: false, status: 404, message: "APIが見つかりません" };
}
