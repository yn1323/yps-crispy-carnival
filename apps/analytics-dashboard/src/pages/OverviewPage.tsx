import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchMilestones,
  fetchOverview,
  fetchSegments,
  fetchShops,
  fetchTrends,
} from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import {
  availabilityCompleteness,
  COUNT_TREND_LABELS,
  COUNT_TREND_METRICS,
  healthCountItems,
  milestoneItems,
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
  const { applyMetadataDefaults, search, update } = useAnalyticsSearch();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const overviewRequest = overviewParams(search);
  const scopedSeriesRequest = trendsParams(search);
  const trendsRequest = {
    ...scopedSeriesRequest,
    metrics: [...RATE_TREND_METRICS, ...COUNT_TREND_METRICS],
  };
  const attentionShopsRequest = {
    direction: "asc" as const,
    from: search.from,
    health: "needsAttention" as const,
    limit: 5,
    planIdVersion: search.planIdVersion,
    sort: "latestActivityAt" as const,
    to: search.to,
  };
  const segmentsRequest = {
    ...segmentsParams({ ...search, dimension: search.dimension ?? "registrationCohort" }),
    completeness: undefined,
  };
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
  const attentionShopsQuery = useQuery({
    queryFn: () => fetchShops(attentionShopsRequest),
    queryKey: ["analytics", "shops", "attention", attentionShopsRequest],
  });
  const segmentsQuery = useQuery({
    enabled: detailsOpen,
    queryFn: () => fetchSegments(segmentsRequest),
    queryKey: ["analytics", "segments", segmentsRequest],
  });
  useReportAnalyticsEnvironment(overviewQuery.data?.env.label);
  const metadata = overviewQuery.data?.data.metadata;
  useEffect(() => {
    applyMetadataDefaults(metadata);
  }, [applyMetadataDefaults, metadata]);

  if (overviewQuery.isLoading) {
    return <AnalyticsPageLoading description="利用状況と要確認店舗を読み込んでいます。" title="サマリー" />;
  }
  if (overviewQuery.error) {
    return (
      <AnalyticsPageError
        description="主要KPIの推移から、導入到達度と現在の運用課題を掘り下げます。"
        message={analyticsErrorMessage(overviewQuery.error)}
        title="サマリー"
      />
    );
  }
  if (!overviewQuery.data) {
    return (
      <AnalyticsPageError
        description="主要KPIの推移から、導入到達度と現在の運用課題を掘り下げます。"
        message="分析データの形式が正しくありません。"
        title="サマリー"
      />
    );
  }

  const overview = overviewQuery.data.data;
  const milestones = milestonesQuery.data?.data;
  const healthPoints = healthQuery.data?.data.series ?? [];
  const completeHealthPoints = healthPoints.filter((point) => point.completeness === "complete");
  const latestHealthPoint = healthPoints.at(-1);
  const previousHealthCounts =
    healthQuery.data?.data.metadata.availability === "available" && latestHealthPoint?.completeness === "complete"
      ? (completeHealthPoints.at(-2)?.counts ?? null)
      : null;
  const extraMetadata = [
    trendsQuery.data?.data.metadata,
    milestones?.metadata,
    healthQuery.data?.data.metadata,
    attentionShopsQuery.data?.data.metadata,
    detailsOpen ? segmentsQuery.data?.data.metadata : undefined,
  ].flatMap((metadata) => (metadata ? [metadata] : []));
  const errors: Partial<Record<OverviewSection, string>> = {
    attentionShops: attentionShopsQuery.error ? analyticsErrorMessage(attentionShopsQuery.error) : undefined,
    health: healthQuery.error ? analyticsErrorMessage(healthQuery.error) : undefined,
    milestones: milestonesQuery.error ? analyticsErrorMessage(milestonesQuery.error) : undefined,
    segments: segmentsQuery.error ? analyticsErrorMessage(segmentsQuery.error) : undefined,
    trend: trendsQuery.error ? analyticsErrorMessage(trendsQuery.error) : undefined,
  };
  const loading = [
    trendsQuery.isLoading ? "trend" : null,
    milestonesQuery.isLoading ? "milestones" : null,
    healthQuery.isLoading ? "health" : null,
    attentionShopsQuery.isLoading ? "attentionShops" : null,
    detailsOpen && segmentsQuery.isLoading ? "segments" : null,
  ].filter((section): section is OverviewSection => section !== null);
  const model: OverviewViewModel = {
    attentionShops: attentionShopsQuery.data?.data.rows.map(shopRowModel) ?? [],
    countTrend: trendChartData(trendsQuery.data?.data.series ?? [], [...COUNT_TREND_METRICS]),
    countTrendKeys: [...COUNT_TREND_LABELS],
    healthCompleteness:
      latestHealthPoint?.completeness ??
      availabilityCompleteness(healthQuery.data?.data.metadata.availability ?? "unavailable"),
    healthSignals: healthCountItems(healthQuery.data?.data.current ?? null, previousHealthCounts),
    kpis: serviceKpis(overview.current, overview.comparison, overview.metadata.availability),
    metadata: mergeMetadata(overview.metadata, ...extraMetadata),
    milestones: milestoneItems(
      milestones?.current ?? null,
      milestones?.currentRates ?? null,
      milestones?.series.at(-1)?.completeness ??
        availabilityCompleteness(milestones?.metadata.availability ?? "unavailable"),
    ),
    segments: segmentsQuery.data?.data.rows.map(segmentRowModel) ?? [],
    shopCounts: {
      active: overview.current?.counts.activeShopCount ?? null,
      completeness: overview.current?.completeness ?? availabilityCompleteness(overview.metadata.availability),
      kpiEligible: overview.current?.counts.kpiEligibleShopCount ?? null,
      total: overview.current?.counts.shopCount ?? null,
    },
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
      detailsOpen={detailsOpen}
      errors={errors}
      loading={loading}
      model={model}
      navigate={navigate}
      onToggleDetails={() => setDetailsOpen((current) => !current)}
      search={search}
      segmentPageInfo={segmentsQuery.data?.data.metadata.pageInfo ?? emptyPageInfo}
      updateSearch={update}
    />
  );
}
