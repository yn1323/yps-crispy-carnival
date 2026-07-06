import type {
  AnalyticsApiEnvelope,
  AnalyticsDashboardRequest,
  AnalyticsDashboardResponse,
  EventTrendsResponse,
  NotificationBreakdownResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopRankingResponse,
  ShopStagesResponse,
} from "./analyticsTypes";

type ResponseByRequest<T extends AnalyticsDashboardRequest> = T extends { kind: "overview" }
  ? OverviewResponse
  : T extends { kind: "eventTrends" }
    ? EventTrendsResponse
    : T extends { kind: "notificationBreakdown" }
      ? NotificationBreakdownResponse
      : T extends { kind: "shopStages" }
        ? ShopStagesResponse
        : T extends { kind: "shopRanking" }
          ? ShopRankingResponse
          : T extends { kind: "shopDetail" }
            ? ShopDetailResponse
            : AnalyticsDashboardResponse;

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

export class AnalyticsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AnalyticsApiError";
    this.status = status;
  }
}

export async function fetchAnalytics<T extends AnalyticsDashboardRequest>(
  request: T,
): Promise<AnalyticsApiEnvelope<ResponseByRequest<T>>> {
  const response = await fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = (await response.json().catch(() => null)) as
    | (AnalyticsApiEnvelope<ResponseByRequest<T>> & ErrorResponse)
    | null;
  if (!response.ok) {
    throw new AnalyticsApiError(body?.error?.message ?? "分析データを読み込めませんでした", response.status);
  }
  if (!body || !("data" in body)) {
    throw new AnalyticsApiError("分析データの形式が正しくありません", response.status);
  }
  return body;
}
