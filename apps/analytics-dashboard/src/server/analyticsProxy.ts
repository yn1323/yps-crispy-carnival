export type AnalyticsProxyEnv = {
  ANALYTICS_ENV_LABEL?: string;
  CF_PAGES_BRANCH?: string;
  SHIFTORI_INTERNAL_API_SECRET?: string;
  VITE_CONVEX_SITE_URL?: string;
  VITE_CONVEX_URL?: string;
};

const robotsHeaderValue = "noindex, nofollow";
const ANALYTICS_API_BODY_MAX_BYTES = 16 * 1024;

type BoundedBodyResult =
  | { ok: true; body: string }
  | { ok: false; error: "unsupported_media_type" | "body_too_large" | "invalid_body" };

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

function getEnvLabel(env: AnalyticsProxyEnv, fallback: string) {
  return env.ANALYTICS_ENV_LABEL ?? env.CF_PAGES_BRANCH ?? fallback;
}

async function readBoundedJsonBody(request: Request): Promise<BoundedBodyResult> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false, error: "unsupported_media_type" };

  const contentLength = request.headers.get("content-length");
  const normalizedContentLength = contentLength?.replace(/^0+/, "") || "0";
  const maxBytesText = String(ANALYTICS_API_BODY_MAX_BYTES);
  if (
    /^\d+$/.test(contentLength ?? "") &&
    (normalizedContentLength.length > maxBytesText.length ||
      (normalizedContentLength.length === maxBytesText.length && normalizedContentLength > maxBytesText))
  ) {
    return { ok: false, error: "body_too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, body: "" };

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > ANALYTICS_API_BODY_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // 上限超過の判定をstreamのcancel失敗で上書きしない。
        }
        return { ok: false, error: "body_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid_body" };
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
    return { ok: true, body: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "invalid_body" };
  }
}

export async function handleAnalyticsApi(request: Request, env: AnalyticsProxyEnv, fallbackEnvLabel: string) {
  if (request.method !== "POST") {
    return jsonResponse({ error: { message: "POSTでリクエストしてください" } }, { status: 405 });
  }

  const bodyResult = await readBoundedJsonBody(request);
  if (!bodyResult.ok) {
    if (bodyResult.error === "unsupported_media_type") {
      return jsonResponse({ error: { message: "JSONでリクエストしてください" } }, { status: 415 });
    }
    if (bodyResult.error === "body_too_large") {
      return jsonResponse({ error: { message: "リクエストが大きすぎます" } }, { status: 413 });
    }
    return jsonResponse({ error: { message: "リクエストを読み込めませんでした" } }, { status: 400 });
  }

  const convexHttpUrl = env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL);
  if (!convexHttpUrl || !env.SHIFTORI_INTERNAL_API_SECRET) {
    return jsonResponse({ error: { message: "分析データの接続先が設定されていません" } }, { status: 503 });
  }

  const upstream = await fetch(getConvexEndpoint(convexHttpUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shiftori-internal-api-secret": env.SHIFTORI_INTERNAL_API_SECRET,
    },
    body: bodyResult.body,
  });

  const responseText = await upstream.text();
  if (!upstream.ok) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return jsonResponse({ error: { message: "分析データを読み込めませんでした" } }, { status });
  }

  try {
    return jsonResponse({
      env: {
        label: getEnvLabel(env, fallbackEnvLabel),
        convexHost: getConvexHost(convexHttpUrl),
      },
      data: JSON.parse(responseText) as unknown,
    });
  } catch {
    return jsonResponse({ error: { message: "分析データの形式が正しくありません" } }, { status: 502 });
  }
}
