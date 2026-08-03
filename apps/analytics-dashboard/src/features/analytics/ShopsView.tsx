import { Stack } from "@chakra-ui/react";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { AnalysisControls } from "./AnalysisControls";
import { ShopsTable } from "./AnalyticsTables";
import { type AnalyticsMetadata, analyticsEmptyText, DataStatus } from "./DataStatus";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { ShopRowViewModel } from "./viewModels";

export function ShopsView({
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
  rows: ShopRowViewModel[];
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description="要確認状態と利用状況から、次に見る店舗を選びます。" title="店舗" />
      <DataStatus metadata={metadata} />
      <AnalysisControls
        advancedFilterKeys={["organizationId", "plan", "shopSize", "cadence", "lineUsage", "health"]}
        dataStartDate={metadata.dataStartDate}
        helperText="期間、グループ、利用状況、要確認状態、並び順を変更できます。"
        search={search}
        showComparison={false}
        showGranularity={false}
        sortOptions={[
          { label: "登録日", value: "registeredAt" },
          { label: "プラン", value: "currentPlan" },
          { label: "最終活動日", value: "latestActivityAt" },
        ]}
        update={updateSearch}
        warnings={metadata.warnings}
      />
      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading description="導入到達は履歴、要確認状態は現在の状態として表示しています。" title="店舗一覧" />
        <ShopsTable
          emptyText={analyticsEmptyText(metadata, "この条件に一致する店舗はありません", pageInfo)}
          navigate={navigate}
          rows={rows}
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}
