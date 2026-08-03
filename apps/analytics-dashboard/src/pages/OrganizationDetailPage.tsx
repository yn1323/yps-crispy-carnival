import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchOrganization } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import {
  healthCountItems,
  organizationExpansionKpis,
  organizationKpis,
  organizationTrendChartData,
  RATE_TREND_LABELS,
  shopRowModel,
} from "@/features/analytics/adapters";
import { formatPlan } from "@/features/analytics/format";
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
  const { applyMetadataDefaults, search, update } = useAnalyticsSearch();
  const request = organizationDetailParams(search);
  const query = useQuery({
    queryFn: () => fetchOrganization(organizationId, request),
    queryKey: ["analytics", "organization", organizationId, request],
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  const metadata = query.data?.data.metadata;
  useEffect(() => {
    applyMetadataDefaults(metadata);
  }, [applyMetadataDefaults, metadata]);
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
        expansionKpis: organizationExpansionKpis(response.organization),
        healthCompleteness: currentKpis?.completeness ?? response.metadata.completeness,
        healthSignals: healthCountItems(currentKpis?.healthSignalCounts ?? null),
        kpis: organizationKpis(currentKpis, response.metadata.completeness),
        metadata: response.metadata,
        organizationId: response.organization.organizationId,
        plan: formatPlan(response.organization.currentPlan),
        registeredAt: response.organization.registeredAt,
        shopCount: currentKpis?.shopCount ?? null,
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
