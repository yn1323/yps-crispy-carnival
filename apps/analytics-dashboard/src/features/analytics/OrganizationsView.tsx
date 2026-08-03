import { Stack } from "@chakra-ui/react";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { AnalysisControls } from "./AnalysisControls";
import { OrganizationsTable } from "./AnalyticsTables";
import { type AnalyticsMetadata, analyticsEmptyText, DataStatus } from "./DataStatus";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { OrganizationRowViewModel } from "./viewModels";

export function OrganizationsView({
  metadata,
  navigate,
  pageInfo,
  rows,
  search,
  updateSearch,
}: {
  metadata: AnalyticsMetadata;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  rows: OrganizationRowViewModel[];
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description="グループごとの利用状況と要確認状態を比較します。" title="グループ" />
      <DataStatus metadata={metadata} />
      <AnalysisControls
        advancedFilterKeys={["plan"]}
        dataStartDate={metadata.dataStartDate}
        helperText="期間、プラン、並び順を変更できます。"
        search={search}
        showComparison={false}
        showGranularity={false}
        sortOptions={[
          { label: "登録日", value: "registeredAt" },
          { label: "プラン", value: "currentPlan" },
        ]}
        update={updateSearch}
        warnings={metadata.warnings}
      />
      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading description="行を選ぶとグループ内の店舗とKPI推移を確認できます。" title="グループ一覧" />
        <OrganizationsTable
          emptyText={analyticsEmptyText(metadata, "この条件に一致するグループはありません", pageInfo)}
          navigate={navigate}
          rows={rows}
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}
