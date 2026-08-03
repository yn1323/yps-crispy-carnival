import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchShop, fetchShopCycles } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import {
  cycleRowModel,
  milestoneDateItems,
  RATE_TREND_LABELS,
  shopCadenceKpi,
  shopCumulativeKpis,
  shopCurrentKpis,
  shopPeriodRateKpis,
  shopTrendChartData,
} from "@/features/analytics/adapters";
import { formatPlan } from "@/features/analytics/format";
import {
  AnalyticsEntityPending,
  AnalyticsPageError,
  AnalyticsPageLoading,
  analyticsErrorMessage,
} from "@/features/analytics/PageState";
import { ShopDetailView } from "@/features/analytics/ShopDetailView";
import { seriesParams, shopCyclesParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function ShopDetailPage({ navigate, shopId }: { navigate: (href: string) => void; shopId: string }) {
  const { applyMetadataDefaults, search, update } = useAnalyticsSearch();
  const shopRequest = seriesParams(search);
  const cyclesRequest = shopCyclesParams(search);
  const shopQuery = useQuery({
    queryFn: () => fetchShop(shopId, shopRequest),
    queryKey: ["analytics", "shop", shopId, shopRequest],
  });
  const cyclesQuery = useQuery({
    queryFn: () => fetchShopCycles(shopId, cyclesRequest),
    queryKey: ["analytics", "shopCycles", shopId, cyclesRequest],
  });
  useReportAnalyticsEnvironment(shopQuery.data?.env.label);
  const metadata = shopQuery.data?.data.metadata;
  useEffect(() => {
    applyMetadataDefaults(metadata);
  }, [applyMetadataDefaults, metadata]);
  if (shopQuery.isLoading) {
    return <AnalyticsPageLoading description="店舗の現在値を読み込んでいます。" title="店舗詳細" />;
  }
  if (shopQuery.error) {
    return (
      <AnalyticsPageError
        description="店舗の現在値、導入履歴、要確認状態、シフト周期を確認します。"
        message={analyticsErrorMessage(shopQuery.error)}
        title="店舗詳細"
      />
    );
  }
  if (!shopQuery.data) return null;
  const response = shopQuery.data.data;
  if (!response.shop) {
    return (
      <AnalyticsEntityPending
        description="店舗の現在値、導入履歴、要確認状態、シフト周期を確認します。"
        metadata={response.metadata}
        title="店舗詳細"
      />
    );
  }
  const shop = response.shop;
  const organizationName = shop.organizationDisplayName;
  const cyclesResponse = cyclesQuery.data?.data;
  const emptyPageInfo = { continueCursor: null, isDone: true, returnedCount: 0 };
  return (
    <ShopDetailView
      cyclesErrorMessage={cyclesQuery.error ? analyticsErrorMessage(cyclesQuery.error) : null}
      cyclesLoading={cyclesQuery.isLoading}
      cyclesMetadata={cyclesResponse?.metadata}
      model={{
        cumulativeKpis: shopCumulativeKpis(shop.kpis, response.metadata.completeness),
        cycleCount: shop.kpis?.cycleCountAsOfSnapshot ?? null,
        cycles: cyclesResponse?.rows.map(cycleRowModel) ?? [],
        displayName: shop.displayName,
        healthCompleteness: shop.kpis?.completeness ?? response.metadata.completeness,
        healthSignals:
          shop.kpis?.healthSignals.map((signal) => ({ key: signal.signal, startedAt: signal.startedAt })) ?? [],
        kpis: [
          ...shopCurrentKpis(shop.kpis, response.metadata.completeness),
          shopCadenceKpi(shop.cadence, shop.kpis?.completeness ?? response.metadata.completeness),
        ],
        metadata: response.metadata,
        milestones: milestoneDateItems(shop.milestoneDates),
        nextCycleDate: shop.kpis?.nextCyclePeriodStart ?? null,
        organizationId: shop.organizationId,
        organizationName,
        plan: formatPlan(shop.currentPlan),
        periodRateKpis: shopPeriodRateKpis(shop.kpis, response.metadata.completeness),
        periodRateTargetCount: shop.kpis
          ? Math.max(shop.kpis.deadlineSubmission.denominator, shop.kpis.finalSubmission.denominator)
          : null,
        rateRange: shop.kpis?.rateRange ?? null,
        registeredAt: shop.registeredAt,
        shopId: shop.shopId,
        snapshotDate: shop.kpis?.snapshotDate ?? null,
        trend: shopTrendChartData(response.series),
        trendKeys: [...RATE_TREND_LABELS],
      }}
      navigate={navigate}
      pageInfo={cyclesResponse?.metadata.pageInfo ?? emptyPageInfo}
      search={search}
      updateSearch={update}
    />
  );
}
