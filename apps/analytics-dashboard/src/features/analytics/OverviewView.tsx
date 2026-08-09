import { Box, Button, Flex, Grid, Link, NativeSelect, Skeleton, Stack, Text } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { hasPlottableTrendData, TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch, withSearchPatch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { AnalyticsExportButton } from "./AnalyticsExportButton";
import { SegmentsTable, ShopsTable } from "./AnalyticsTables";
import { analyticsEmptyText, DataStatus, QueryError } from "./DataStatus";
import { formatCount } from "./format";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import {
  DonutChart,
  HealthDistributionChart,
  KpiComparisonChart,
  MilestoneConversionChart,
  partitionRemainder,
} from "./MetricVisualizations";
import { HealthSignals, MilestoneTimeline } from "./Presentation";
import { SegmentComparisonCharts } from "./SegmentCharts";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { OverviewViewModel } from "./viewModels";

const SEGMENT_DIMENSIONS = [
  ["registrationCohort", "登録時期"],
  ["plan", "プラン"],
  ["organizationShopCount", "グループ店舗数"],
  ["shopStaffSize", "店舗スタッフ規模"],
  ["cadence", "通常周期"],
  ["lineUsage", "LINE利用"],
  ["submissionTrend", "最近の提出傾向"],
  ["adoptionAge", "導入時期"],
] as const;

function TrendUnavailable() {
  return (
    <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
      <Text color="gray.700" fontSize="sm" fontWeight="bold">
        この期間には推移を描ける値がありません
      </Text>
      <Text color="gray.500" fontSize="xs" mt={1}>
        分母が0または欠損している値は、0として描画しません。
      </Text>
    </Box>
  );
}

export function OverviewView({
  attentionShopsPageInfo,
  detailsOpen,
  errors = {},
  loading = [],
  model,
  navigate,
  onToggleDetails,
  search,
  segmentPageInfo,
  updateSearch,
}: {
  attentionShopsPageInfo: PageInfoViewModel;
  detailsOpen: boolean;
  errors?: Partial<Record<OverviewSection, string>>;
  loading?: OverviewSection[];
  model: OverviewViewModel;
  navigate: (href: string) => void;
  onToggleDetails: () => void;
  search: AnalyticsSearchState;
  segmentPageInfo: PageInfoViewModel;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  const isLoading = (section: OverviewSection) => loading.includes(section);
  const canPlotTrend = hasPlottableTrendData(model.trend, model.trendKeys);
  const canPlotCountTrend = hasPlottableTrendData(model.countTrend, model.countTrendKeys);
  const currentRateKpis = model.kpis.filter((item) =>
    ["northStar", "deadlineSubmission", "finalSubmission"].includes(item.key),
  );
  const hasCurrentRates = currentRateKpis.some(
    (item) => item.completeness === "complete" && item.numericValue !== null,
  );
  const inactiveShopCount = partitionRemainder(
    model.shopCounts.total,
    model.shopCounts.active,
    model.shopCounts.completeness,
  );

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        action={<AnalyticsExportButton search={search} />}
        description="現在の要確認対象を起点に、利用状況と導入到達を確認します。"
        title="サマリー"
      />
      <DataStatus metadata={model.metadata} />

      <Stack bg="white" border="1px solid" borderColor="orange.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading
          description="次回未作成、通知失敗、提出低下など、現在確認が必要な店舗を最大5件表示します。"
          title="今見るべき店舗"
        />
        {errors.attentionShops ? (
          <QueryError message={errors.attentionShops} />
        ) : isLoading("attentionShops") ? (
          <Skeleton h="140px" />
        ) : (
          <ShopsTable
            emptyText={analyticsEmptyText(model.metadata, "現在、要確認の店舗はありません", attentionShopsPageInfo)}
            navigate={navigate}
            rows={model.attentionShops}
            variant="attention"
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

      <Stack gap={4}>
        <SectionHeading
          description="率は完全なシフト周期だけを合算し、店舗数は期間内の最新集計日時点を表示します。"
          title="現在の利用状況"
        />
        <KpiGrid items={model.kpis} />
        <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
          {hasCurrentRates ? (
            <ChartPanel
              contentHeight="auto"
              description="現在の3つの率を同じ0〜100%の尺度で比較します。"
              title="現在の運用KPI"
            >
              <KpiComparisonChart ariaLabel="現在の運用KPI" items={currentRateKpis} maxValue={1} />
            </ChartPanel>
          ) : null}
          <ChartPanel
            contentHeight="auto"
            description="現在の全店舗を、最近の活動がある店舗とそれ以外に分けています。"
            title="店舗の稼働構成"
          >
            <DonutChart
              ariaLabel="稼働店舗と非稼働店舗の構成比"
              centerLabel="全店舗"
              centerValue={`${formatCount(model.shopCounts.total, model.shopCounts.completeness)}店舗`}
              items={[
                {
                  color: "green.500",
                  completeness: model.shopCounts.completeness,
                  displayValue: `${formatCount(model.shopCounts.active, model.shopCounts.completeness)}店舗`,
                  key: "active",
                  label: "稼働中",
                  value: model.shopCounts.active,
                },
                {
                  color: "gray.500",
                  completeness: model.shopCounts.completeness,
                  displayValue: `${formatCount(inactiveShopCount, model.shopCounts.completeness)}店舗`,
                  key: "inactive",
                  label: "非稼働",
                  value: inactiveShopCount,
                },
              ]}
            />
          </ChartPanel>
        </Grid>
      </Stack>

      <AnalysisControls
        advancedFilterKeys={["organizationId", "shopId"]}
        dataStartDate={model.metadata.dataStartDate}
        helperText="期間、比較、集計単位、対象グループまたは店舗を変更できます。"
        search={search}
        update={updateSearch}
        warnings={model.metadata.warnings}
      />

      {errors.trend ? (
        <QueryError message={errors.trend} />
      ) : isLoading("trend") ? (
        <ChartPanel
          contentHeight={{ base: "240px", md: "320px" }}
          description="欠損区間は0として結びません。"
          isLoading
          title="KPI推移"
        >
          <Box />
        </ChartPanel>
      ) : canPlotTrend || canPlotCountTrend ? (
        <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
          {canPlotTrend ? (
            <ChartPanel
              contentHeight={{ base: "240px", md: "320px" }}
              description="単一時点の場合は棒で示し、複数時点の欠損区間は0として結びません。"
              title="運用KPIの推移"
            >
              <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
            </ChartPanel>
          ) : null}
          {canPlotCountTrend ? (
            <ChartPanel
              contentHeight={{ base: "240px", md: "320px" }}
              description="全店舗、稼働店舗、到達度対象店舗を比較します。1日分だけでも現在値として表示します。"
              title="店舗基盤の推移"
            >
              <TrendChart data={model.countTrend} keys={model.countTrendKeys} valueKind="count" />
            </ChartPanel>
          ) : null}
        </Grid>
      ) : (
        <TrendUnavailable />
      )}

      <Grid gap={5} templateColumns={{ base: "1fr", xl: "minmax(320px, 0.8fr) minmax(0, 1.2fr)" }}>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一度到達した履歴は、現在の状態によって後戻りしません。" title="導入到達度" />
          {errors.milestones ? (
            <QueryError message={errors.milestones} />
          ) : isLoading("milestones") ? (
            <Skeleton h="240px" />
          ) : (
            <Stack gap={5}>
              <MilestoneConversionChart items={model.milestones} />
              <Box borderTop="1px solid" borderColor="gray.100" pt={5}>
                <MilestoneTimeline items={model.milestones} />
              </Box>
            </Stack>
          )}
        </Stack>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一つの店舗に複数の状態が同時に成立します。" title="現在の要確認状態" />
          {errors.health ? (
            <QueryError message={errors.health} />
          ) : isLoading("health") ? (
            <Skeleton h="120px" />
          ) : (
            <Stack gap={5}>
              <HealthDistributionChart
                completeness={model.healthCompleteness}
                signals={model.healthSignals}
                totalCount={model.shopCounts.total}
              />
              <Box
                borderTop={model.healthSignals.length > 0 ? "1px solid" : undefined}
                borderColor="gray.100"
                pt={model.healthSignals.length > 0 ? 4 : 0}
              >
                <HealthSignals completeness={model.healthCompleteness} signals={model.healthSignals} />
              </Box>
            </Stack>
          )}
        </Stack>
      </Grid>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <Flex
          align={{ base: "start", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          justify="space-between"
        >
          <SectionHeading
            description="登録時期、プラン、規模、通常周期など、一つの比較軸を選んで確認します。"
            title="詳細分析"
          />
          <Button onClick={onToggleDetails} size="sm" variant="outline">
            {detailsOpen ? "詳細分析を閉じる" : "詳細分析を開く"}
          </Button>
        </Flex>
        {detailsOpen ? (
          <Stack gap={4}>
            <NativeSelect.Root maxW={{ md: "320px" }} size="sm">
              <NativeSelect.Field
                aria-label="比較軸"
                onChange={(event) => updateSearch({ dimension: event.currentTarget.value, segmentCursor: undefined })}
                value={search.dimension ?? "registrationCohort"}
              >
                {SEGMENT_DIMENSIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            {errors.segments ? (
              <QueryError message={errors.segments} />
            ) : isLoading("segments") ? (
              <Skeleton h="200px" />
            ) : (
              <Stack gap={5}>
                <SegmentComparisonCharts dimension={search.dimension ?? "registrationCohort"} rows={model.segments} />
                <Box>
                  <Text color="gray.700" fontSize="sm" fontWeight="bold" mb={3}>
                    正確な値
                  </Text>
                  <SegmentsTable
                    emptyText={analyticsEmptyText(
                      model.metadata,
                      "この条件に一致する比較結果はありません",
                      segmentPageInfo,
                    )}
                    rows={model.segments}
                  />
                </Box>
              </Stack>
            )}
            {!errors.segments && !isLoading("segments") ? (
              <ListPagination pageInfo={segmentPageInfo} onNext={(segmentCursor) => updateSearch({ segmentCursor })} />
            ) : null}
          </Stack>
        ) : null}
      </Stack>

      <Grid gap={4} templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }}>
        <Link
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="lg"
          href={withCurrentSearch(routePath({ name: "organizations" }))}
          p={5}
          _hover={{ borderColor: "blue.300", textDecoration: "none" }}
        >
          <Text fontWeight="bold">グループを比較する →</Text>
          <Text color="gray.500" fontSize="sm" mt={1}>
            店舗数、スタッフ数、開始前確定率、要確認状態を比べます。
          </Text>
        </Link>
        <Link
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="lg"
          href={withCurrentSearch(routePath({ name: "shops" }))}
          p={5}
          _hover={{ borderColor: "blue.300", textDecoration: "none" }}
        >
          <Text fontWeight="bold">店舗を探す →</Text>
          <Text color="gray.500" fontSize="sm" mt={1}>
            導入到達、次回シフト、提出率、要確認状態から対象を選びます。
          </Text>
        </Link>
      </Grid>
    </Stack>
  );
}

export type OverviewSection = "trend" | "milestones" | "health" | "segments" | "attentionShops";
