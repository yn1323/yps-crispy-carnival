import { useQuery } from "@tanstack/react-query";
import { fetchShops } from "@/api/analyticsClient";
import { shopRowModel } from "@/features/analytics/adapters";
import { AnalyticsPageError, AnalyticsPageLoading, analyticsErrorMessage } from "@/features/analytics/PageState";
import { ShopsView } from "@/features/analytics/ShopsView";
import { shopsParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function ShopsPage({ navigate }: { navigate: (href: string) => void }) {
  const { search, update } = useAnalyticsSearch();
  const request = shopsParams(search);
  const query = useQuery({
    queryFn: () => fetchShops(request),
    queryKey: ["analytics", "shops", request],
  });
  if (query.isLoading) return <AnalyticsPageLoading description="店舗の集計値を読み込んでいます。" title="店舗比較" />;
  if (query.error) {
    return (
      <AnalyticsPageError
        description="店舗の導入到達度、現在のhealth、提出傾向を横断して比較します。"
        message={analyticsErrorMessage(query.error)}
        title="店舗比較"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  return (
    <ShopsView
      envLabel={query.data.env.label}
      metadata={response.metadata}
      navigate={navigate}
      pageInfo={response.metadata.pageInfo}
      rows={response.rows.map(shopRowModel)}
      search={search}
      updateSearch={update}
    />
  );
}
