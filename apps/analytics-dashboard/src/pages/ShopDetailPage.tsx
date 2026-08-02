import { useQuery } from "@tanstack/react-query";
import { fetchShop, fetchShopCycles } from "@/api/analyticsClient";
import {
  cycleRowModel,
  milestoneDateItems,
  RATE_TREND_LABELS,
  shopCumulativeKpis,
  shopCurrentKpis,
  shopPeriodRateKpis,
  shopTrendChartData,
} from "@/features/analytics/adapters";
import { mergeMetadata } from "@/features/analytics/DataStatus";
import {
  AnalyticsEntityPending,
  AnalyticsPageError,
  AnalyticsPageLoading,
  analyticsErrorMessage,
} from "@/features/analytics/PageState";
import { ShopDetailView } from "@/features/analytics/ShopDetailView";
import { seriesParams, shopCyclesParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function ShopDetailPage({ navigate, shopId }: { navigate: (href: string) => void; shopId: string }) {
  const { search, update } = useAnalyticsSearch();
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
  if (shopQuery.isLoading || cyclesQuery.isLoading) {
    return <AnalyticsPageLoading description="店舗とシフト周期を読み込んでいます。" title="店舗詳細" />;
  }
  const error = shopQuery.error ?? cyclesQuery.error;
  if (error) {
    return (
      <AnalyticsPageError
        description="店舗の現在値、導入履歴、health、周期を確認します。"
        message={analyticsErrorMessage(error)}
        title="店舗詳細"
      />
    );
  }
  if (!shopQuery.data || !cyclesQuery.data) return null;
  const response = shopQuery.data.data;
  if (!response.shop) {
    return (
      <AnalyticsEntityPending
        description="店舗の現在値、導入履歴、health、周期を確認します。"
        envLabel={shopQuery.data.env.label}
        metadata={mergeMetadata(response.metadata, cyclesQuery.data.data.metadata)}
        title="店舗詳細"
      />
    );
  }
  const shop = response.shop;
  const organizationName = shop.organizationDisplayName;
  return (
    <ShopDetailView
      model={{
        cumulativeKpis: shopCumulativeKpis(shop.kpis, response.metadata.completeness),
        cycles: cyclesQuery.data.data.rows.map(cycleRowModel),
        displayName: shop.displayName,
        envLabel: shopQuery.data.env.label,
        healthCompleteness: shop.kpis?.completeness ?? response.metadata.completeness,
        healthSignals:
          shop.kpis?.healthSignals.map((signal) => ({ key: signal.signal, startedAt: signal.startedAt })) ?? [],
        kpis: shopCurrentKpis(shop.kpis, response.metadata.completeness),
        metadata: mergeMetadata(response.metadata, cyclesQuery.data.data.metadata),
        milestones: milestoneDateItems(shop.milestoneDates),
        organizationId: shop.organizationId,
        organizationName,
        plan: shop.currentPlan ?? "未設定",
        periodRateKpis: shopPeriodRateKpis(shop.kpis, response.metadata.completeness),
        rateRange: shop.kpis?.rateRange ?? null,
        registeredAt: shop.registeredAt,
        shopId: shop.shopId,
        snapshotDate: shop.kpis?.snapshotDate ?? null,
        trend: shopTrendChartData(response.series),
        trendKeys: [...RATE_TREND_LABELS],
      }}
      navigate={navigate}
      pageInfo={cyclesQuery.data.data.metadata.pageInfo}
      search={search}
      updateSearch={update}
    />
  );
}
