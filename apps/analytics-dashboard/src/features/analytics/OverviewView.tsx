import { Box, Grid, Link, Skeleton, Stack } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch, withSearchPatch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { AnalyticsExportButton } from "./AnalyticsExportButton";
import { OrganizationsTable, SegmentsTable, ShopsTable } from "./AnalyticsTables";
import { analyticsEmptyText, DataStatus, QueryError } from "./DataStatus";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import { HealthSignals, MilestoneTimeline } from "./Presentation";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { OverviewViewModel } from "./viewModels";

export function OverviewView({
  attentionShopsPageInfo,
  errors = {},
  loading = [],
  model,
  navigate,
  organizationsPageInfo,
  search,
  segmentPageInfo,
  updateSearch,
}: {
  attentionShopsPageInfo: PageInfoViewModel;
  errors?: Partial<Record<OverviewSection, string>>;
  loading?: OverviewSection[];
  model: OverviewViewModel;
  navigate: (href: string) => void;
  organizationsPageInfo: PageInfoViewModel;
  search: AnalyticsSearchState;
  segmentPageInfo: PageInfoViewModel;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  const isLoading = (section: OverviewSection) => loading.includes(section);
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        action={<AnalyticsExportButton search={search} />}
        description="主要KPIの推移から、導入到達度と現在の運用課題を掘り下げます。"
        title="全体サマリー"
      />
      <DataStatus envLabel={model.envLabel} metadata={model.metadata} />
      <AnalysisControls
        advancedFilterKeys={["organizationId", "shopId", "dimension"]}
        helperText="グループ・店舗は主要KPI、推移、導入到達度、healthに適用します。比較軸はセグメント表だけに適用し、下部の比較一覧は各一覧画面で絞り込みます。"
        search={search}
        update={updateSearch}
      />

      <Stack gap={4}>
        <SectionHeading description="率は完全な周期の分子・分母だけを合算しています。" title="主要KPI" />
        <KpiGrid items={model.kpis} />
      </Stack>

      {errors.trend ? (
        <QueryError message={errors.trend} />
      ) : (
        <ChartPanel
          contentHeight={{ base: "280px", md: "360px" }}
          description="日次・週次・月次を切り替えて長期傾向を確認できます。欠損区間は0として結びません。"
          isLoading={isLoading("trend")}
          title="KPI推移"
        >
          <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
        </ChartPanel>
      )}

      <Grid gap={5} templateColumns={{ base: "1fr", xl: "minmax(320px, 0.8fr) minmax(0, 1.2fr)" }}>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一度到達した履歴は、現在のhealthによって後戻りしません。" title="導入到達度" />
          {errors.milestones ? (
            <QueryError message={errors.milestones} />
          ) : isLoading("milestones") ? (
            <Skeleton h="240px" />
          ) : (
            <MilestoneTimeline items={model.milestones} />
          )}
        </Stack>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一つの店舗に複数のsignalが同時に成立します。" title="現在のhealth signal" />
          {errors.health ? (
            <QueryError message={errors.health} />
          ) : isLoading("health") ? (
            <Skeleton h="120px" />
          ) : (
            <Box>
              <HealthSignals completeness={model.healthCompleteness} signals={model.healthSignals} />
            </Box>
          )}
        </Stack>
      </Grid>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading
          description="登録cohort、プラン、規模、周期、LINE利用、提出傾向ごとに分子・分母を合算して比較します。"
          title="セグメント比較"
        />
        {errors.segments ? (
          <QueryError message={errors.segments} />
        ) : isLoading("segments") ? (
          <Skeleton h="240px" />
        ) : (
          <SegmentsTable
            emptyText={analyticsEmptyText(model.metadata, "この条件に一致するセグメントはありません", segmentPageInfo)}
            rows={model.segments}
          />
        )}
        {!errors.segments && !isLoading("segments") ? (
          <ListPagination pageInfo={segmentPageInfo} onNext={(segmentCursor) => updateSearch({ segmentCursor })} />
        ) : null}
      </Stack>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading description="店舗数だけでなく、人員構成と開始前確定周期率を比較します。" title="グループ比較" />
        {errors.organizations ? (
          <QueryError message={errors.organizations} />
        ) : isLoading("organizations") ? (
          <Skeleton h="240px" />
        ) : (
          <OrganizationsTable
            emptyText={analyticsEmptyText(
              model.metadata,
              "この条件に一致するグループはありません",
              organizationsPageInfo,
            )}
            navigate={navigate}
            rows={model.organizations}
          />
        )}
        <Link
          alignSelf="end"
          color="blue.600"
          fontSize="sm"
          href={withCurrentSearch(routePath({ name: "organizations" }))}
        >
          グループ一覧をすべて見る
        </Link>
      </Stack>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading description="次回未作成、通知失敗、提出低下など、確認が必要な店舗です。" title="要確認店舗" />
        {errors.attentionShops ? (
          <QueryError message={errors.attentionShops} />
        ) : isLoading("attentionShops") ? (
          <Skeleton h="240px" />
        ) : (
          <ShopsTable
            emptyText={analyticsEmptyText(
              model.metadata,
              "この条件に一致する要確認店舗はありません",
              attentionShopsPageInfo,
            )}
            navigate={navigate}
            rows={model.attentionShops}
          />
        )}
        <Link
          alignSelf="end"
          color="blue.600"
          fontSize="sm"
          href={withSearchPatch(routePath({ name: "shops" }), { health: "needsAttention" }, { dropSort: true })}
        >
          要確認店舗をすべて見る
        </Link>
      </Stack>
    </Stack>
  );
}

export type OverviewSection = "trend" | "milestones" | "health" | "segments" | "organizations" | "attentionShops";
