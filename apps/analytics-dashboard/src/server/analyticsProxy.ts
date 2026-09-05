import {
  ANALYTICS_DASHBOARD_MAX_BODY_BYTES,
  ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES,
  type AnalyticsDashboardRequest,
  type FeatureRequestUpdateRequest,
  parseFeatureRequestUpdate,
} from "../../../../convex/analyticsDashboard/schemas";
import { matchAnalyticsRoute } from "./analyticsRoutes";

export type AnalyticsProxyEnv = {
  ANALYTICS_ENV_LABEL?: string;
  CF_PAGES_BRANCH?: string;
  SHIFTORI_INTERNAL_API_SECRET?: string;
  VITE_CONVEX_SITE_URL?: string;
  VITE_CONVEX_URL?: string;
};

const robotsHeaderValue = "noindex, nofollow";
const UPSTREAM_RESPONSE_MAX_BYTES = ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES;
const FETCH_ERROR_MESSAGE_MAX_LENGTH = 500;

function safeFetchError(error: unknown, secret: string) {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError", errorMessage: "Non-Error rejection" };
  }

  const sanitize = (value: string, maxLength: number) =>
    value
      .replaceAll(secret, "[redacted]")
      .replace(/https?:\/\/\S+/gi, "[redacted-url]")
      .replace(/\s+/g, " ")
      .slice(0, maxLength);

  return {
    errorName: sanitize(error.name, 100),
    errorMessage: sanitize(error.message, FETCH_ERROR_MESSAGE_MAX_LENGTH),
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "X-Robots-Tag": robotsHeaderValue,
      ...init.headers,
    },
  });
}

export function withNoindexResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", robotsHeaderValue);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getConvexEndpoint(baseUrl: string, mutation: boolean) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(mutation ? "analytics-dashboard/mutation" : "analytics-dashboard/query", normalized).toString();
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

function getEnvLabel(env: AnalyticsProxyEnv, fallback: string) {
  return env.ANALYTICS_ENV_LABEL ?? env.CF_PAGES_BRANCH ?? fallback;
}

async function readBoundedResponse(response: Response | Request, maxBytes = UPSTREAM_RESPONSE_MAX_BYTES) {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;

  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // 上限超過をstream cancelの失敗で上書きしない。
        }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function safeRetryAfter(value: string | null) {
  if (!value || !/^\d{1,4}$/.test(value)) return "60";
  return String(Math.min(3_600, Math.max(1, Number(value))));
}

function upstreamErrorResponse(response: Response) {
  if (response.status === 404) {
    return jsonResponse({ error: { message: "データが見つかりません" } }, { status: 404 });
  }
  if (response.status === 429) {
    return jsonResponse(
      { error: { message: "アクセスが集中しています。少し待ってから再度お試しください" } },
      { status: 429, headers: { "retry-after": safeRetryAfter(response.headers.get("retry-after")) } },
    );
  }
  if (response.status === 400 || response.status === 413 || response.status === 415) {
    return jsonResponse({ error: { message: "指定内容が正しくありません" } }, { status: 400 });
  }
  if (response.status === 503) {
    return jsonResponse({ error: { message: "分析データを読み込めませんでした" } }, { status: 503 });
  }
  return jsonResponse({ error: { message: "分析データを読み込めませんでした" } }, { status: 502 });
}

export async function handleAnalyticsApi(request: Request, env: AnalyticsProxyEnv, fallbackEnvLabel: string) {
  const url = new URL(request.url);
  const mutation = url.pathname === "/api/requests/update";
  const allowedMethod = mutation ? "POST" : "GET";
  if (request.method !== allowedMethod) {
    return jsonResponse(
      { error: { message: "この操作では利用できない送信方法です" } },
      { status: 405, headers: { allow: allowedMethod } },
    );
  }
  let payload: AnalyticsDashboardRequest | FeatureRequestUpdateRequest;
  if (mutation) {
    if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return jsonResponse({ error: { message: "このページから操作し直してください" } }, { status: 403 });
    }
    if (url.search || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return jsonResponse({ error: { message: "JSONで送信してください" } }, { status: 415 });
    }
    const body = await readBoundedResponse(request, ANALYTICS_DASHBOARD_MAX_BODY_BYTES);
    if (body === null) return jsonResponse({ error: { message: "送信内容が大きすぎます" } }, { status: 413 });
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return jsonResponse({ error: { message: "指定内容が正しくありません" } }, { status: 400 });
    }
    const parsed = parseFeatureRequestUpdate(input);
    if (!parsed.ok) return jsonResponse({ error: { message: "指定内容が正しくありません" } }, { status: 400 });
    payload = parsed.value;
  } else {
    const route = matchAnalyticsRoute(url);
    if (!route.ok) return jsonResponse({ error: { message: route.message } }, { status: route.status });
    payload = route.request;
  }

  const convexHttpUrl = env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL);
  if (!convexHttpUrl || !env.SHIFTORI_INTERNAL_API_SECRET) {
    return jsonResponse({ error: { message: "分析データの接続先が設定されていません" } }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(getConvexEndpoint(convexHttpUrl, mutation), {
      method: "POST",
      // secret付きのservice requestはredirect先へ追従せず、3xxを下で502に変換する。
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "x-shiftori-internal-api-secret": env.SHIFTORI_INTERNAL_API_SECRET,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("analytics_proxy_fetch_failed", {
      endpoint: payload.endpoint,
      ...safeFetchError(error, env.SHIFTORI_INTERNAL_API_SECRET),
    });
    return jsonResponse({ error: { message: "分析データを読み込めませんでした" } }, { status: 502 });
  }

  const responseText = await readBoundedResponse(upstream);
  if (responseText === null) {
    console.error("analytics_proxy_upstream_response_unreadable", {
      endpoint: payload.endpoint,
      status: upstream.status,
    });
    return jsonResponse(
      { error: { message: "分析データの応答が大きすぎるか、読み取れませんでした" } },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    if (![400, 404, 413, 415, 429].includes(upstream.status)) {
      console.error("analytics_proxy_upstream_failed", {
        endpoint: payload.endpoint,
        status: upstream.status,
      });
    }
    return upstreamErrorResponse(upstream);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText) as unknown;
  } catch {
    console.error("analytics_proxy_upstream_invalid_json", {
      endpoint: payload.endpoint,
      status: upstream.status,
    });
    return jsonResponse({ error: { message: "分析データの形式が正しくありません" } }, { status: 502 });
  }

  const envelope = {
    env: {
      label: getEnvLabel(env, fallbackEnvLabel),
    },
    data,
  };
  const serialized = JSON.stringify(envelope);
  if (new TextEncoder().encode(serialized).byteLength >= ANALYTICS_DASHBOARD_MAX_RESPONSE_BYTES) {
    console.error("analytics_proxy_response_too_large", {
      endpoint: payload.endpoint,
    });
    return jsonResponse({ error: { message: "分析データの応答が大きすぎます" } }, { status: 502 });
  }
  return new Response(serialized, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "X-Robots-Tag": robotsHeaderValue,
    },
  });
}
