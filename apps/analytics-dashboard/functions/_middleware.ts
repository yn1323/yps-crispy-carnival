type AnalyticsBasicAuthEnv = {
  ANALYTICS_BASIC_USER?: string;
  ANALYTICS_BASIC_PASSWORD?: string;
};

type PagesMiddlewareContext = {
  request: Request;
  env: AnalyticsBasicAuthEnv;
  next: () => Promise<Response>;
};

const robotsHeaderValue = "noindex, nofollow";

function withNoindexHeader(headersInit?: HeadersInit) {
  const headers = new Headers(headersInit);
  headers.set("X-Robots-Tag", robotsHeaderValue);
  return headers;
}

function unauthorizedResponse(status = 401) {
  return new Response("Authentication required", {
    status,
    headers: withNoindexHeader({
      "www-authenticate": 'Basic realm="Shiftori Analytics", charset="UTF-8"',
      "cache-control": "no-store",
    }),
  });
}

function withNoindexResponse(response: Response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withNoindexHeader(response.headers),
  });
}

function decodeBasicCredential(value: string) {
  if (!value.startsWith("Basic ")) return null;
  try {
    const decoded = atob(value.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export const onRequest = async ({ request, env, next }: PagesMiddlewareContext) => {
  if (!env.ANALYTICS_BASIC_USER || !env.ANALYTICS_BASIC_PASSWORD) {
    return new Response("Analytics basic auth is not configured", {
      status: 503,
      headers: withNoindexHeader({ "cache-control": "no-store" }),
    });
  }

  const credential = decodeBasicCredential(request.headers.get("authorization") ?? "");
  if (!credential) return unauthorizedResponse();
  if (credential.user !== env.ANALYTICS_BASIC_USER || credential.password !== env.ANALYTICS_BASIC_PASSWORD) {
    return unauthorizedResponse();
  }

  return withNoindexResponse(await next());
};
