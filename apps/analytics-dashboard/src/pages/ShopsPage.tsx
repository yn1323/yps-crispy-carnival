import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchShops } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { shopListRowModel } from "@/features/analytics/adapters";
import { AnalyticsPageError, AnalyticsPageLoading, analyticsErrorMessage } from "@/features/analytics/PageState";
import { ShopsView } from "@/features/analytics/ShopsView";
import { shopsParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function ShopsPage({ navigate }: { navigate: (href: string) => void }) {
  const { applyMetadataDefaults, search, update } = useAnalyticsSearch();
  const request = shopsParams(search);
  const query = useQuery({
    queryFn: () => fetchShops(request),
    queryKey: ["analytics", "shops", request],
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  const metadata = query.data?.data.metadata;
  useEffect(() => {
    applyMetadataDefaults(metadata);
  }, [applyMetadataDefaults, metadata]);
  if (query.isLoading) return <AnalyticsPageLoading description="店舗の集計値を読み込んでいます。" title="店舗" />;
  if (query.error) {
    return (
      <AnalyticsPageError
        description="最新集計の利用の可能性と根拠から、確認する店舗を選びます。"
        message={analyticsErrorMessage(query.error)}
        title="店舗"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  return (
    <ShopsView
      metadata={response.metadata}
      navigate={navigate}
      pageInfo={response.metadata.pageInfo}
      rows={response.rows.map(shopListRowModel)}
      search={search}
      updateSearch={update}
    />
  );
}
