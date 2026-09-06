import type {
  AnalyticsApiEnvelope,
  AnalyticsMetric,
  AnalyticsRangeDays,
  CycleDetailResponse,
  FeatureRequestsResponse,
  FeatureRequestUpdateResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopsResponse,
  StaffDetailResponse,
} from "./analyticsTypes";

type SearchValue = string | number | null | undefined;
type PaginationParams = { cursor?: string | null; limit?: number };
export const ANALYTICS_AUTH_EXPIRED_EVENT = "analytics-auth-expired";
export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AnalyticsApiError";
  }
}
async function fetchEndpoint<T>(
  path: string,
  params: Record<string, SearchValue>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<AnalyticsApiEnvelope<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") search.set(key, String(value));
  const response = await fetch(search.size ? `${path}?${search}` : path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    redirect: "manual",
    signal,
    headers:
      body === undefined
        ? { accept: "application/json" }
        : { accept: "application/json", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (
    response.type === "opaqueredirect" ||
    response.status === 401 ||
    response.status === 403 ||
    (response.ok && !response.headers.get("content-type")?.includes("application/json"))
  ) {
    window.dispatchEvent(new Event(ANALYTICS_AUTH_EXPIRED_EVENT));
    throw new AnalyticsApiError("本人認証を確認してください。ページを再読み込みすると認証画面へ進めます。", 401);
  }
  const parsed = (await response.json().catch(() => null)) as {
    data?: T;
    env?: { label: string };
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new AnalyticsApiError(
      parsed?.error?.message ?? "読み込めませんでした。もう一度お試しください。",
      response.status,
      response.status === 429 ? Math.max(1, Number(response.headers.get("retry-after")) || 60) * 1000 : undefined,
    );
  if (!parsed || !("data" in parsed) || !parsed.env) throw new AnalyticsApiError("応答を読み取れませんでした。", 502);
  return parsed as AnalyticsApiEnvelope<T>;
}
export function fetchOverview(rangeDays: AnalyticsRangeDays, signal?: AbortSignal) {
  return fetchEndpoint<OverviewResponse>("/api/analytics/overview", { rangeDays }, undefined, signal);
}
export async function fetchShops(
  params: PaginationParams & { search?: string; date?: string | null; metric?: AnalyticsMetric | null },
  signal?: AbortSignal,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchEndpoint<ShopsResponse>("/api/analytics/shops", params, undefined, signal);
    } catch (error) {
      if (!(error instanceof AnalyticsApiError) || error.status !== 429 || attempt >= 3) throw error;
      // 全ページ取得中にrate limitへ達しても、取得済みのページを捨てず同じcursorから再開する。
      await new Promise<void>((resolve, reject) => {
        signal?.throwIfAborted();
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, error.retryAfterMs ?? 60_000);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}
export function fetchShop(shopId: string, params: PaginationParams = {}, signal?: AbortSignal) {
  return fetchEndpoint<ShopDetailResponse>(
    `/api/analytics/shops/${encodeURIComponent(shopId)}`,
    params,
    undefined,
    signal,
  );
}
export function fetchStaff(shopId: string, staffId: string, params: PaginationParams = {}, signal?: AbortSignal) {
  return fetchEndpoint<StaffDetailResponse>(
    `/api/analytics/shops/${encodeURIComponent(shopId)}/staff/${encodeURIComponent(staffId)}`,
    params,
    undefined,
    signal,
  );
}
export function fetchCycle(shopId: string, recruitmentId: string, signal?: AbortSignal) {
  return fetchEndpoint<CycleDetailResponse>(
    `/api/analytics/shops/${encodeURIComponent(shopId)}/cycles/${encodeURIComponent(recruitmentId)}`,
    {},
    undefined,
    signal,
  );
}
export function fetchFeatureRequests(params: PaginationParams = {}, signal?: AbortSignal) {
  return fetchEndpoint<FeatureRequestsResponse>("/api/requests", params, undefined, signal);
}
export function setFeatureRequestDeleted(id: string, isDeleted: boolean) {
  return fetchEndpoint<FeatureRequestUpdateResponse>(
    "/api/requests/update",
    {},
    { endpoint: "setFeatureRequestDeleted", id, isDeleted },
  );
}
