import { useQuery } from "@tanstack/react-query";
import {
  fetchHealth,
  fetchMilestones,
  fetchOrganizations,
  fetchOverview,
  fetchSegments,
  fetchShops,
  fetchTrends,
} from "@/api/analyticsClient";
import {
  healthCountItems,
  milestoneItems,
  organizationRowModel,
  RATE_TREND_LABELS,
  RATE_TREND_METRICS,
  segmentRowModel,
  serviceKpis,
  shopRowModel,
  trendChartData,
} from "@/features/analytics/adapters";
import { mergeMetadata } from "@/features/analytics/DataStatus";
import { type OverviewSection, OverviewView } from "@/features/analytics/OverviewView";
import { AnalyticsPageError, AnalyticsPageLoading, analyticsErrorMessage } from "@/features/analytics/PageState";
import {
  overviewParams,
  segmentsParams,
  trendsParams,
  useAnalyticsSearch,
} from "@/features/analytics/useAnalyticsSearch";
import type { OverviewViewModel } from "@/features/analytics/viewModels";

export function OverviewPage({ navigate }: { navigate: (href: string) => void }) {
  const { search, update } = useAnalyticsSearch();
  const overviewRequest = overviewParams(search);
  const scopedSeriesRequest = trendsParams(search);
  const trendsRequest = { ...scopedSeriesRequest, metrics: [...RATE_TREND_METRICS] };
  const organizationsRequest = {
    direction: "desc" as const,
    from: search.from,
    limit: 8,
    sort: "registeredAt" as const,
    to: search.to,
  };
  const attentionShopsRequest = {
    direction: "asc" as const,
    from: search.from,
    health: "needsAttention" as const,
    limit: 8,
    sort: "latestActivityAt" as const,
    to: search.to,
  };
  const segmentsRequest = { ...segmentsParams(search), completeness: undefined };
  const overviewQuery = useQuery({
    queryFn: () => fetchOverview(overviewRequest),
    queryKey: ["analytics", "overview", overviewRequest],
  });
  const trendsQuery = useQuery({
    queryFn: () => fetchTrends(trendsRequest),
    queryKey: ["analytics", "trends", trendsRequest],
  });
  const milestonesQuery = useQuery({
    queryFn: () => fetchMilestones(scopedSeriesRequest),
    queryKey: ["analytics", "milestones", scopedSeriesRequest],
  });
  const healthQuery = useQuery({
    queryFn: () => fetchHealth(scopedSeriesRequest),
    queryKey: ["analytics", "health", scopedSeriesRequest],
  });
  const organizationsQuery = useQuery({
    queryFn: () => fetchOrganizations(organizationsRequest),
    queryKey: ["analytics", "organizations", "overview", organizationsRequest],
  });
  const attentionShopsQuery = useQuery({
    queryFn: () => fetchShops(attentionShopsRequest),
    queryKey: ["analytics", "shops", "attention", attentionShopsRequest],
  });
  const segmentsQuery = useQuery({
    queryFn: () => fetchSegments(segmentsRequest),
    queryKey: ["analytics", "segments", segmentsRequest],
  });

  if (overviewQuery.isLoading) {
    return (
      <AnalyticsPageLoading description="KPI、導入到達度、health signalを読み込んでいます。" title="全体サマリー" />
    );
  }
  if (overviewQuery.error) {
    return (
      <AnalyticsPageError
        description="主要KPIの推移から、導入到達度と現在の運用課題を掘り下げます。"
        message={analyticsErrorMessage(overviewQuery.error)}
        title="全体サマリー"
      />
    );
  }
  if (!overviewQuery.data) {
    return (
      <AnalyticsPageError
        description="主要KPIの推移から、導入到達度と現在の運用課題を掘り下げます。"
        message="分析データの形式が正しくありません。"
        title="全体サマリー"
      />
    );
  }

  const overview = overviewQuery.data.data;
  const milestones = milestonesQuery.data?.data;
  const completeHealthPoints = healthQuery.data?.data.series.filter((point) => point.completeness === "complete") ?? [];
  const previousHealthCounts =
    healthQuery.data?.data.metadata.completeness === "complete" ? (completeHealthPoints.at(-2)?.counts ?? null) : null;
  const extraMetadata = [
    trendsQuery.data?.data.metadata,
    milestones?.metadata,
    healthQuery.data?.data.metadata,
    organizationsQuery.data?.data.metadata,
    attentionShopsQuery.data?.data.metadata,
    segmentsQuery.data?.data.metadata,
  ].flatMap((metadata) => (metadata ? [metadata] : []));
  const errors: Partial<Record<OverviewSection, string>> = {
    attentionShops: attentionShopsQuery.error ? analyticsErrorMessage(attentionShopsQuery.error) : undefined,
    health: healthQuery.error ? analyticsErrorMessage(healthQuery.error) : undefined,
    milestones: milestonesQuery.error ? analyticsErrorMessage(milestonesQuery.error) : undefined,
    organizations: organizationsQuery.error ? analyticsErrorMessage(organizationsQuery.error) : undefined,
    segments: segmentsQuery.error ? analyticsErrorMessage(segmentsQuery.error) : undefined,
    trend: trendsQuery.error ? analyticsErrorMessage(trendsQuery.error) : undefined,
  };
  const loading = [
    trendsQuery.isLoading ? "trend" : null,
    milestonesQuery.isLoading ? "milestones" : null,
    healthQuery.isLoading ? "health" : null,
    organizationsQuery.isLoading ? "organizations" : null,
    attentionShopsQuery.isLoading ? "attentionShops" : null,
    segmentsQuery.isLoading ? "segments" : null,
  ].filter((section): section is OverviewSection => section !== null);
  const model: OverviewViewModel = {
    attentionShops: attentionShopsQuery.data?.data.rows.map(shopRowModel) ?? [],
    envLabel: overviewQuery.data.env.label,
    healthCompleteness: healthQuery.data?.data.metadata.completeness ?? "pending",
    healthSignals: healthCountItems(healthQuery.data?.data.current ?? null, previousHealthCounts),
    kpis: serviceKpis(overview.current, overview.comparison, overview.metadata.completeness),
    metadata: mergeMetadata(overview.metadata, ...extraMetadata),
    milestones: milestoneItems(
      milestones?.current ?? null,
      milestones?.currentRates ?? null,
      milestones?.metadata.completeness ?? "pending",
    ),
    organizations: organizationsQuery.data?.data.rows.map(organizationRowModel) ?? [],
    segments: segmentsQuery.data?.data.rows.map(segmentRowModel) ?? [],
    trend: trendChartData(trendsQuery.data?.data.series ?? [], [...RATE_TREND_METRICS]),
    trendKeys: [...RATE_TREND_LABELS],
  };
  const emptyPageInfo = {
    continueCursor: null,
    isDone: true,
    returnedCount: 0,
  };
  return (
    <OverviewView
      attentionShopsPageInfo={attentionShopsQuery.data?.data.metadata.pageInfo ?? emptyPageInfo}
      errors={errors}
      loading={loading}
      model={model}
      navigate={navigate}
      organizationsPageInfo={organizationsQuery.data?.data.metadata.pageInfo ?? emptyPageInfo}
      search={search}
      segmentPageInfo={segmentsQuery.data?.data.metadata.pageInfo ?? emptyPageInfo}
      updateSearch={update}
    />
  );
}
