import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchOrganizations } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { organizationRowModel } from "@/features/analytics/adapters";
import { OrganizationsView } from "@/features/analytics/OrganizationsView";
import { AnalyticsPageError, AnalyticsPageLoading, analyticsErrorMessage } from "@/features/analytics/PageState";
import { organizationsParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function OrganizationsPage({ navigate }: { navigate: (href: string) => void }) {
  const { applyMetadataDefaults, search, update } = useAnalyticsSearch();
  const request = organizationsParams(search);
  const query = useQuery({
    queryFn: () => fetchOrganizations(request),
    queryKey: ["analytics", "organizations", request],
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  const metadata = query.data?.data.metadata;
  useEffect(() => {
    applyMetadataDefaults(metadata);
  }, [applyMetadataDefaults, metadata]);
  if (query.isLoading) {
    return <AnalyticsPageLoading description="グループの集計値を読み込んでいます。" title="グループ" />;
  }
  if (query.error) {
    return (
      <AnalyticsPageError
        description="グループごとの利用状況と要確認状態を比較します。"
        message={analyticsErrorMessage(query.error)}
        title="グループ"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  return (
    <OrganizationsView
      metadata={response.metadata}
      navigate={navigate}
      pageInfo={response.metadata.pageInfo}
      rows={response.rows.map(organizationRowModel)}
      search={search}
      updateSearch={update}
    />
  );
}
