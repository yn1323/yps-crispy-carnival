import { Badge, Grid, HStack, Stack } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { CyclesTable } from "./AnalyticsTables";
import { analyticsEmptyText, DataStatus } from "./DataStatus";
import { formatDate } from "./format";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import { HealthSignals, MilestoneTimeline } from "./Presentation";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { ShopDetailViewModel } from "./viewModels";

export function ShopDetailView({
  model,
  navigate,
  pageInfo,
  search,
  updateSearch,
}: {
  model: ShopDetailViewModel;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        breadcrumbs={[
          { href: withCurrentSearch(routePath({ name: "shops" })), label: "店舗比較" },
          { label: model.displayName },
        ]}
        description="店舗の現在値、後戻りしない導入履歴、運用health、シフト周期を確認します。"
        title={model.displayName}
      />
      <DataStatus envLabel={model.envLabel} metadata={model.metadata} />
      <AnalysisControls advancedFilterKeys={["completeness"]} search={search} update={updateSearch} />
      <HStack gap={2} wrap="wrap">
        <Badge variant="surface">{model.organizationName}</Badge>
        <Badge variant="surface">{model.plan}</Badge>
        <Badge variant="surface">登録 {formatDate(model.registeredAt)}</Badge>
      </HStack>

      <Stack gap={4}>
        <SectionHeading
          description="スタッフ数、person未接続staff、対象人数、person、管理者兼スタッフ、LINE連携を同じ基準日時で表示します。"
          title="店舗の現在値"
        />
        <KpiGrid items={model.kpis} />
      </Stack>

      <Grid gap={5} templateColumns={{ base: "1fr", lg: "minmax(300px, 0.75fr) minmax(0, 1.25fr)" }}>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一度到達した日付は現在の不調で巻き戻りません。" title="導入到達履歴" />
          <MilestoneTimeline items={model.milestones} />
        </Stack>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="現在成立しているsignalと開始日を表示します。" title="現在のhealth signal" />
          <HealthSignals completeness={model.healthCompleteness} signals={model.healthSignals} />
        </Stack>
      </Grid>

      <ChartPanel
        contentHeight={{ base: "280px", md: "360px" }}
        description="欠損値や算出不可の区間は0として描画しません。"
        title="KPI推移"
      >
        <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
      </ChartPanel>

      <Stack gap={4}>
        <SectionHeading
          description={`${model.snapshotDate ?? "未集計"}時点までのcycle、提出、通知、確定lead timeを累積表示します。`}
          title="累積KPI"
        />
        <KpiGrid items={model.cumulativeKpis} />
      </Stack>

      <Stack gap={4}>
        <SectionHeading
          description={`${model.rateRange ? `${model.rateRange.from} 〜 ${model.rateRange.to}` : "未集計"}に開始する完全な周期だけを率へ含めています。`}
          title="期間KPI"
        />
        <KpiGrid items={model.periodRateKpis} />
      </Stack>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading
          description="提出人数 / 対象人数、期限内・最終提出率、通知結果、完全性を周期ごとに確認します。"
          title="シフト周期"
        />
        <CyclesTable
          emptyText={analyticsEmptyText(model.metadata, "この条件に一致するシフト周期はありません", pageInfo)}
          navigate={navigate}
          rows={model.cycles}
          shopId={model.shopId}
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}
