type AnalyticsApiEnv = {
  CF_PAGES_BRANCH?: string;
  SHIFTORI_INTERNAL_API_SECRET?: string;
  VITE_CONVEX_SITE_URL?: string;
  VITE_CONVEX_URL?: string;
};

type PagesApiContext = {
  request: Request;
  env: AnalyticsApiEnv;
};

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

function getConvexEndpoint(baseUrl: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("analytics-dashboard/query", normalized).toString();
}

function getConvexHttpUrl(convexUrl?: string) {
  if (!convexUrl) return undefined;
  try {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function getConvexHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

export const onRequest = async ({ request, env }: PagesApiContext) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: { message: "POSTでリクエストしてください" } }, { status: 405 });
  }

  const convexHttpUrl = env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL);
  if (!convexHttpUrl || !env.SHIFTORI_INTERNAL_API_SECRET) {
    return jsonResponse({ error: { message: "分析データの接続先が設定されていません" } }, { status: 503 });
  }

  const body = await request.text();
  const upstream = await fetch(getConvexEndpoint(convexHttpUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shiftori-internal-api-secret": env.SHIFTORI_INTERNAL_API_SECRET,
    },
    body,
  });

  const responseText = await upstream.text();
  if (!upstream.ok) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return jsonResponse({ error: { message: "分析データを読み込めませんでした" } }, { status });
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    return jsonResponse({ error: { message: "分析データの形式が正しくありません" } }, { status: 502 });
  }

  return jsonResponse({
    env: {
      label: env.CF_PAGES_BRANCH ?? "unknown",
      convexHost: getConvexHost(convexHttpUrl),
    },
    data,
  });
};
