import {
  type AnalyticsDashboardEndpoint,
  type AnalyticsDashboardRequest,
  normalizeBrowserRequestInput,
} from "../../../../convex/analyticsDashboard/schemas";

export type AnalyticsRouteMatch =
  | { ok: true; request: AnalyticsDashboardRequest }
  | { ok: false; status: 400 | 404; message: string };

function decodePathId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseRoute(
  endpoint: AnalyticsDashboardEndpoint,
  url: URL,
  pathIds: { organizationId?: string; shopId?: string; recruitmentId?: string } = {},
): AnalyticsRouteMatch {
  const parsed = normalizeBrowserRequestInput(endpoint, url.searchParams, pathIds);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  return { ok: true, request: parsed.value };
}

export function matchAnalyticsRoute(url: URL): AnalyticsRouteMatch {
  const fixedEndpoint = new Map<string, AnalyticsDashboardEndpoint>([
    ["/api/analytics/overview", "overview"],
    ["/api/analytics/trends", "trends"],
    ["/api/analytics/milestones", "milestones"],
    ["/api/analytics/health", "health"],
    ["/api/analytics/organizations", "organizations"],
    ["/api/analytics/shops", "shops"],
    ["/api/analytics/segments", "segments"],
    ["/api/requests", "requests"],
  ]).get(url.pathname);
  if (fixedEndpoint) return parseRoute(fixedEndpoint, url);

  const organizationMatch = /^\/api\/analytics\/organizations\/([^/]+)$/.exec(url.pathname);
  if (organizationMatch) {
    const organizationId = decodePathId(organizationMatch[1]);
    if (organizationId === null) return { ok: false, status: 400, message: "organizationIdが正しくありません" };
    return parseRoute("organization", url, { organizationId });
  }

  const cycleMatch = /^\/api\/analytics\/shops\/([^/]+)\/cycles\/([^/]+)$/.exec(url.pathname);
  if (cycleMatch) {
    const shopId = decodePathId(cycleMatch[1]);
    const recruitmentId = decodePathId(cycleMatch[2]);
    if (shopId === null || recruitmentId === null) {
      return { ok: false, status: 400, message: "IDが正しくありません" };
    }
    return parseRoute("cycle", url, { shopId, recruitmentId });
  }

  const cyclesMatch = /^\/api\/analytics\/shops\/([^/]+)\/cycles$/.exec(url.pathname);
  if (cyclesMatch) {
    const shopId = decodePathId(cyclesMatch[1]);
    if (shopId === null) return { ok: false, status: 400, message: "shopIdが正しくありません" };
    return parseRoute("shopCycles", url, { shopId });
  }

  const shopMatch = /^\/api\/analytics\/shops\/([^/]+)$/.exec(url.pathname);
  if (shopMatch) {
    const shopId = decodePathId(shopMatch[1]);
    if (shopId === null) return { ok: false, status: 400, message: "shopIdが正しくありません" };
    return parseRoute("shop", url, { shopId });
  }

  return { ok: false, status: 404, message: "APIが見つかりません" };
}
