import { type AnalyticsProxyEnv, handleAnalyticsApi, jsonResponse, withNoindexResponse } from "./server/analyticsProxy";

type StaticAssetBinding = {
  fetch: (request: Request) => Promise<Response>;
};

type AnalyticsWorkerEnv = AnalyticsProxyEnv & {
  ASSETS: StaticAssetBinding;
};

export default {
  async fetch(request: Request, env: AnalyticsWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname.startsWith("/api/analytics/") ||
      url.pathname === "/api/requests" ||
      url.pathname === "/api/requests/update"
    ) {
      return handleAnalyticsApi(request, env, "worker");
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: { message: "APIが見つかりません" } }, { status: 404 });
    }

    return withNoindexResponse(await env.ASSETS.fetch(request));
  },
};
