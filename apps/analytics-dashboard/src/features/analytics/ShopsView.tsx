import { Stack } from "@chakra-ui/react";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { AnalysisControls } from "./AnalysisControls";
import { ShopsTable } from "./AnalyticsTables";
import { type AnalyticsMetadata, analyticsEmptyText, DataStatus } from "./DataStatus";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { ShopListRowViewModel } from "./viewModels";

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
  rows: ShopListRowViewModel[];
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        description="利用の可能性は、最新の完全な集計と観測開始後の活動をもとに推定します。状態不明は、未利用を意味しません。"
        title="店舗"
      />
      <DataStatus metadata={metadata} />
      <AnalysisControls
        advancedFilterKeys={["usage", "organizationId", "plan", "shopSize", "cadence", "lineUsage", "health"]}
        dataStartDate={metadata.dataStartDate}
        helperText="利用の可能性、期間、組織、利用状況、要確認状態、並び順を変更できます。"
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
        <SectionHeading
          description="利用の可能性と根拠は最新の完全な集計、ほかのKPI列は選択期間末を基準に表示しています。"
          title="店舗一覧"
        />
        <ShopsTable
          emptyText={analyticsEmptyText(
            metadata,
            search.usage && search.usage !== "unknown"
              ? "この条件に一致する候補を確認できません"
              : "この条件に一致する店舗を確認できません",
            pageInfo,
          )}
          navigate={navigate}
          rows={rows}
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}
