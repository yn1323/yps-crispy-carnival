import { useQuery } from "@tanstack/react-query";
import { fetchOrganizations } from "@/api/analyticsClient";
import { organizationRowModel } from "@/features/analytics/adapters";
import { OrganizationsView } from "@/features/analytics/OrganizationsView";
import { AnalyticsPageError, AnalyticsPageLoading, analyticsErrorMessage } from "@/features/analytics/PageState";
import { organizationsParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function OrganizationsPage({ navigate }: { navigate: (href: string) => void }) {
  const { search, update } = useAnalyticsSearch();
  const request = organizationsParams(search);
  const query = useQuery({
    queryFn: () => fetchOrganizations(request),
    queryKey: ["analytics", "organizations", request],
  });
  if (query.isLoading) {
    return <AnalyticsPageLoading description="グループの集計値を読み込んでいます。" title="グループ比較" />;
  }
  if (query.error) {
    return (
      <AnalyticsPageError
        description="グループごとの規模、人員構成、KPI、health signalを比較します。"
        message={analyticsErrorMessage(query.error)}
        title="グループ比較"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  return (
    <OrganizationsView
      envLabel={query.data.env.label}
      metadata={response.metadata}
      navigate={navigate}
      pageInfo={response.metadata.pageInfo}
      rows={response.rows.map(organizationRowModel)}
      search={search}
      updateSearch={update}
    />
  );
}
