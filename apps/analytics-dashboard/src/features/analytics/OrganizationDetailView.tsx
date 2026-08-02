import { Badge, Box, HStack, Stack } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { ShopsTable } from "./AnalyticsTables";
import { analyticsEmptyText, DataStatus } from "./DataStatus";
import { formatDate } from "./format";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { OrganizationDetailViewModel } from "./viewModels";

export function OrganizationDetailView({
  model,
  navigate,
  pageInfo,
  search,
  updateSearch,
}: {
  model: OrganizationDetailViewModel;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        breadcrumbs={[
          { href: withCurrentSearch(routePath({ name: "organizations" })), label: "グループ比較" },
          { label: model.displayName },
        ]}
        description="グループ内の店舗構成とKPI推移から、差が生まれている店舗を確認します。"
        title={model.displayName}
      />
      <DataStatus envLabel={model.envLabel} metadata={model.metadata} />
      <AnalysisControls advancedFilterKeys={[]} search={search} update={updateSearch} />
      <HStack gap={2} wrap="wrap">
        <Badge variant="surface">{model.plan}</Badge>
        <Badge variant="surface">登録 {formatDate(model.registeredAt)}</Badge>
      </HStack>
      <Stack gap={4}>
        <SectionHeading
          description="所属・person・person未接続staff・管理者兼スタッフを、PIIを含まない集計で表示します。"
          title="グループの現在値"
        />
        <KpiGrid items={model.kpis} />
      </Stack>
      <Stack gap={4}>
        <SectionHeading
          description="初店舗またはグループ登録からの展開と、2店舗目での初回シフト確定までを表示します。"
          title="多店舗展開"
        />
        <KpiGrid items={model.expansionKpis} />
      </Stack>
      <ChartPanel
        contentHeight={{ base: "280px", md: "360px" }}
        description="店舗別率の平均ではなく、完全な周期の分子・分母を合算しています。"
        title="KPI推移"
      >
        <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
      </ChartPanel>
      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <Box>
          <SectionHeading
            description="店舗ごとの到達度、提出率、health signalを比較します。"
            title="グループ内の店舗"
          />
        </Box>
        <ShopsTable
          emptyText={analyticsEmptyText(model.metadata, "このグループに店舗はありません", pageInfo)}
          navigate={navigate}
          rows={model.shops}
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}
