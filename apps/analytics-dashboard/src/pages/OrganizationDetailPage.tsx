import { useQuery } from "@tanstack/react-query";
import { fetchOrganization } from "@/api/analyticsClient";
import {
  organizationExpansionKpis,
  organizationKpis,
  organizationTrendChartData,
  RATE_TREND_LABELS,
  shopRowModel,
} from "@/features/analytics/adapters";
import { OrganizationDetailView } from "@/features/analytics/OrganizationDetailView";
import {
  AnalyticsEntityPending,
  AnalyticsPageError,
  AnalyticsPageLoading,
  analyticsErrorMessage,
} from "@/features/analytics/PageState";
import { organizationDetailParams, useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function OrganizationDetailPage({
  navigate,
  organizationId,
}: {
  navigate: (href: string) => void;
  organizationId: string;
}) {
  const { search, update } = useAnalyticsSearch();
  const request = organizationDetailParams(search);
  const query = useQuery({
    queryFn: () => fetchOrganization(organizationId, request),
    queryKey: ["analytics", "organization", organizationId, request],
  });
  if (query.isLoading)
    return <AnalyticsPageLoading description="グループ詳細を読み込んでいます。" title="グループ詳細" />;
  if (query.error) {
    return (
      <AnalyticsPageError
        description="グループ内の店舗構成とKPI推移を確認します。"
        message={analyticsErrorMessage(query.error)}
        title="グループ詳細"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  if (!response.organization) {
    return (
      <AnalyticsEntityPending
        description="グループ内の店舗構成とKPI推移を確認します。"
        envLabel={query.data.env.label}
        metadata={response.metadata}
        title="グループ詳細"
      />
    );
  }
  const currentKpis = response.organization.kpis;
  return (
    <OrganizationDetailView
      model={{
        displayName: response.organization.displayName,
        envLabel: query.data.env.label,
        expansionKpis: organizationExpansionKpis(response.organization),
        kpis: organizationKpis(currentKpis, response.metadata.completeness),
        metadata: response.metadata,
        organizationId: response.organization.organizationId,
        plan: response.organization.currentPlan ?? "未設定",
        registeredAt: response.organization.registeredAt,
        shops: response.shops.map(shopRowModel),
        trend: organizationTrendChartData(response.series),
        trendKeys: [...RATE_TREND_LABELS],
      }}
      navigate={navigate}
      pageInfo={response.metadata.pageInfo}
      search={search}
      updateSearch={update}
    />
  );
}
