import { Stack } from "@chakra-ui/react";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { AnalysisControls } from "./AnalysisControls";
import { ShopsTable } from "./AnalyticsTables";
import { type AnalyticsMetadata, analyticsEmptyText, DataStatus } from "./DataStatus";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { ShopRowViewModel } from "./viewModels";

export function ShopsView({
  envLabel,
  metadata,
  navigate,
  pageInfo,
  rows,
  search,
  updateSearch,
}: {
  envLabel?: string;
  metadata: AnalyticsMetadata;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  rows: ShopRowViewModel[];
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description="店舗の導入到達度、現在のhealth、提出傾向を横断して比較します。" title="店舗比較" />
      <DataStatus envLabel={envLabel} metadata={metadata} />
      <AnalysisControls
        advancedFilterKeys={[
          "organizationId",
          "cohort",
          "plan",
          "shopSize",
          "cadence",
          "lineUsage",
          "health",
          "completeness",
        ]}
        search={search}
        sortOptions={[
          { label: "登録日", value: "registeredAt" },
          { label: "プラン", value: "currentPlan" },
          { label: "最終活動日", value: "latestActivityAt" },
        ]}
        update={updateSearch}
      />
      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading
          description="導入到達度は履歴、health signalは現在状態として別々に表示しています。"
          title="店舗一覧"
        />
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
