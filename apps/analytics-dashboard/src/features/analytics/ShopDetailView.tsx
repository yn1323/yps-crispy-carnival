import { Badge, Box, Flex, Grid, HStack, NativeSelect, Skeleton, Stack, Text } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { hasPlottableTrendData, TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { CyclesTable } from "./AnalyticsTables";
import { CycleListCharts } from "./CycleCharts";
import { type AnalyticsMetadata, analyticsEmptyText, CompletenessBadge, DataStatus, QueryError } from "./DataStatus";
import { formatCount, formatDate } from "./format";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import { DonutChart, hasPlottableKpis, KpiComparisonChart, partitionRemainder } from "./MetricVisualizations";
import { HealthSignals, MilestoneTimeline } from "./Presentation";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { KpiViewModel, ShopDetailViewModel } from "./viewModels";

const PRIMARY_CURRENT_KPI_KEYS = new Set(["staff", "targets"]);
const PRIMARY_CUMULATIVE_KPI_KEYS = new Set(["cycles", "confirmed", "beforeStart", "cumulativeFinalSubmission"]);

function ExpandableKpis({ description, items, label }: { description: string; items: KpiViewModel[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <Box as="details" bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
      <Box as="summary" cursor="pointer" fontSize="sm" fontWeight="bold">
        {label}
      </Box>
      <Text color="gray.500" fontSize="xs" mt={2}>
        {description}
      </Text>
      <Box mt={4}>
        <KpiGrid items={items} />
      </Box>
    </Box>
  );
}

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

export function ShopDetailView({
  cyclesErrorMessage,
  cyclesLoading,
  cyclesMetadata,
  model,
  navigate,
  pageInfo,
  search,
  updateSearch,
}: {
  cyclesErrorMessage: string | null;
  cyclesLoading: boolean;
  cyclesMetadata?: AnalyticsMetadata;
  model: ShopDetailViewModel;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  const primaryCurrentKpis = model.kpis.filter((item) => PRIMARY_CURRENT_KPI_KEYS.has(item.key));
  const currentDetails = model.kpis.filter((item) => !PRIMARY_CURRENT_KPI_KEYS.has(item.key));
  const primaryCumulativeKpis = model.cumulativeKpis.filter((item) => PRIMARY_CUMULATIVE_KPI_KEYS.has(item.key));
  const cumulativeDetails = model.cumulativeKpis.filter((item) => !PRIMARY_CUMULATIVE_KPI_KEYS.has(item.key));
  const cumulativeStageKpis = model.cumulativeKpis.filter((item) =>
    ["cycles", "confirmed", "beforeStart"].includes(item.key),
  );
  const cumulativeRateKpis = model.cumulativeKpis.filter((item) =>
    ["cumulativeDeadlineSubmission", "cumulativeFinalSubmission"].includes(item.key),
  );
  const notificationKpis = model.cumulativeKpis.filter((item) =>
    ["cumulativeNotificationSent", "cumulativeNotificationFailed"].includes(item.key),
  );
  const leadTimeKpis = model.cumulativeKpis.filter((item) =>
    ["confirmationLeadTimeMedian", "confirmationLeadTimeP90"].includes(item.key),
  );
  const cumulativeCompleteness = model.cumulativeKpis[0]?.completeness;
  const periodCompleteness = model.periodRateKpis[0]?.completeness;
  const hasNoCycles = model.cycleCount === 0 && cumulativeCompleteness === "complete";
  const canPlotTrend = hasPlottableTrendData(model.trend, model.trendKeys);
  const targetKpi = model.kpis.find((item) => item.key === "targets");
  const lineLinkedKpi = model.kpis.find((item) => item.key === "lineLinked");
  const lineCompleteness = lineLinkedKpi?.completeness ?? "unavailable";
  const lineUnlinkedCount = partitionRemainder(
    targetKpi?.numericValue ?? null,
    lineLinkedKpi?.numericValue ?? null,
    lineCompleteness,
  );

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        breadcrumbs={[
          { href: withCurrentSearch(routePath({ name: "shops" })), label: "店舗" },
          { label: model.displayName },
        ]}
        description="現在の要確認状態、導入到達、次回シフトを起点に運用状況を確認します。"
        title={model.displayName}
      />
      <DataStatus metadata={model.metadata} />
      <AnalysisControls
        advancedFilterKeys={[]}
        dataStartDate={model.metadata.dataStartDate}
        helperText="期間と集計単位を変更できます。周期の集計状態は周期一覧で指定します。"
        search={search}
        showComparison={false}
        update={updateSearch}
        warnings={model.metadata.warnings}
      />
      <HStack gap={2} wrap="wrap">
        <Badge variant="surface">{model.organizationName}</Badge>
        <Badge variant="surface">{model.plan}</Badge>
        <Badge variant="surface">登録 {formatDate(model.registeredAt)}</Badge>
      </HStack>

      <Grid gap={5} templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(300px, 0.8fr)" }}>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={5}>
          <SectionHeading
            description="現在成立している状態と、次回シフトの有無を表示します。"
            title="現在の要確認状態"
          />
          <HealthSignals completeness={model.healthCompleteness} signals={model.healthSignals} />
          <Box borderTop="1px solid" borderColor="gray.100" pt={3}>
            <Text color="gray.500" fontSize="xs">
              次回シフト
            </Text>
            <Text fontSize="lg" fontWeight="bold" mt={1}>
              {model.healthCompleteness === "complete"
                ? model.nextCycleDate
                  ? formatDate(model.nextCycleDate)
                  : "未作成"
                : formatCount(undefined, model.healthCompleteness)}
            </Text>
          </Box>
        </Stack>
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={5}>
          <SectionHeading description="一度到達した日付は、現在の状態によって巻き戻りません。" title="導入到達履歴" />
          <MilestoneTimeline items={model.milestones} />
        </Stack>
      </Grid>

      <Stack gap={4}>
        <SectionHeading description="スタッフ所属数と、シフト提出対象人数を表示します。" title="店舗の現在" />
        <KpiGrid items={primaryCurrentKpis} />
        <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
          {hasPlottableKpis(primaryCurrentKpis) ? (
            <ChartPanel
              contentHeight="auto"
              description="スタッフ所属数とシフト対象人数を同じ人数尺度で比較します。"
              title="スタッフとシフト対象"
            >
              <KpiComparisonChart ariaLabel="スタッフ所属数とシフト対象人数" items={primaryCurrentKpis} />
            </ChartPanel>
          ) : null}
          {targetKpi?.numericValue !== null &&
          targetKpi?.numericValue !== undefined &&
          targetKpi.numericValue > 0 &&
          lineUnlinkedCount !== null ? (
            <ChartPanel
              contentHeight="auto"
              description="シフト対象者を、LINE連携済みと未連携に分けています。"
              title="LINE連携構成"
            >
              <DonutChart
                ariaLabel="シフト対象者のLINE連携済みと未連携の構成比"
                centerLabel="シフト対象"
                centerValue={`${formatCount(targetKpi.numericValue, lineCompleteness)}人`}
                items={[
                  {
                    color: "green.500",
                    completeness: lineCompleteness,
                    displayValue: `${formatCount(lineLinkedKpi?.numericValue, lineCompleteness)}人`,
                    key: "linked",
                    label: "連携済み",
                    value: lineLinkedKpi?.numericValue ?? null,
                  },
                  {
                    color: "gray.500",
                    completeness: lineCompleteness,
                    displayValue: `${formatCount(lineUnlinkedCount, lineCompleteness)}人`,
                    key: "unlinked",
                    label: "未連携",
                    value: lineUnlinkedCount,
                  },
                ]}
              />
            </ChartPanel>
          ) : null}
        </Grid>
        <ExpandableKpis
          description="LINE連携、重複を除いた利用者、重複判定できないスタッフ、管理者の内訳です。"
          items={currentDetails}
          label="人物・連携の内訳を見る"
        />
      </Stack>

      {hasNoCycles ? (
        <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="lg" p={5}>
          <Text color="gray.800" fontWeight="bold">
            集計対象となるシフト周期がまだありません
          </Text>
          <Text color="gray.500" fontSize="sm" mt={1}>
            初回募集または初回確定に到達すると、推移、累積値、期間値、周期一覧を表示します。
          </Text>
        </Box>
      ) : (
        <>
          {canPlotTrend ? (
            <ChartPanel
              contentHeight={{ base: "240px", md: "320px" }}
              description="欠損値や算出できない区間は0として描画しません。"
              title="KPI推移"
            >
              <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
            </ChartPanel>
          ) : (
            <TrendUnavailable />
          )}

          <Stack gap={4}>
            <SectionHeading
              description={`${model.snapshotDate ?? "未集計"}時点までの作成、確定、開始前確定、最終提出率です。`}
              title="累積KPI"
            />
            <KpiGrid items={primaryCumulativeKpis} />
            <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
              {hasPlottableKpis(cumulativeStageKpis) ? (
                <ChartPanel
                  contentHeight="auto"
                  description="作成済み、確定済み、開始前確定済みを同じ周期数の尺度で比較します。"
                  title="周期の確定段階"
                >
                  <KpiComparisonChart ariaLabel="周期の確定段階" items={cumulativeStageKpis} />
                </ChartPanel>
              ) : null}
              {hasPlottableKpis(cumulativeRateKpis) ? (
                <ChartPanel
                  contentHeight="auto"
                  description="期限時点と周期終了時点を同じ0〜100%の尺度で比較します。"
                  title="累積提出率"
                >
                  <KpiComparisonChart
                    ariaLabel="累積期限内提出率と累積最終提出率"
                    items={cumulativeRateKpis}
                    maxValue={1}
                  />
                </ChartPanel>
              ) : null}
              {hasPlottableKpis(notificationKpis) ? (
                <ChartPanel
                  contentHeight="auto"
                  description="送信数と最終失敗数は積み上げず、個別の件数として表示します。"
                  title="累積通知結果"
                >
                  <KpiComparisonChart ariaLabel="累積通知送信数と最終失敗数" items={notificationKpis} />
                </ChartPanel>
              ) : null}
              {hasPlottableKpis(leadTimeKpis) ? (
                <ChartPanel
                  contentHeight="auto"
                  description="中央値とP90を同じ時間尺度で比較し、遅い周期の影響を確認します。"
                  title="確定までの時間"
                >
                  <KpiComparisonChart
                    ariaLabel="確定までの時間の中央値とP90"
                    items={leadTimeKpis}
                    valueKind="duration"
                  />
                </ChartPanel>
              ) : null}
            </Grid>
            <ExpandableKpis
              description="期限内提出率、通知送信と失敗、作成から確定までの時間です。"
              items={cumulativeDetails}
              label="累積KPIの詳細を見る"
            />
          </Stack>

          <Stack gap={4}>
            <SectionHeading
              description={`${model.rateRange ? `${model.rateRange.from} 〜 ${model.rateRange.to}` : "未集計"}に開始する完全なシフト周期を対象にしています。`}
              title="期間KPI"
            />
            {model.periodRateTargetCount === 0 && periodCompleteness === "complete" ? (
              <Box bg="gray.50" borderRadius="lg" p={4}>
                <Text color="gray.600" fontSize="sm">
                  対象期間に提出率を算出できる対象人数がありません。
                </Text>
              </Box>
            ) : (
              <Stack gap={4}>
                <KpiGrid items={model.periodRateKpis} />
                {hasPlottableKpis(model.periodRateKpis) ? (
                  <ChartPanel
                    contentHeight="auto"
                    description="期限時点と周期終了時点を同じ0〜100%の尺度で比較します。"
                    title="期間内の提出率"
                  >
                    <KpiComparisonChart
                      ariaLabel="期間内の期限内提出率と最終提出率"
                      items={model.periodRateKpis}
                      maxValue={1}
                    />
                  </ChartPanel>
                ) : null}
              </Stack>
            )}
          </Stack>

          <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
            <Flex
              align={{ base: "start", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap={3}
              justify="space-between"
            >
              <SectionHeading description="提出率、通知、確定結果をシフト周期ごとに確認します。" title="シフト周期" />
              <HStack gap={2} wrap="wrap">
                {cyclesMetadata && cyclesMetadata.completeness !== "complete" ? (
                  <HStack gap={1}>
                    <Text color="gray.500" fontSize="xs">
                      周期一覧の集計:
                    </Text>
                    <CompletenessBadge value={cyclesMetadata.completeness} />
                  </HStack>
                ) : null}
                <NativeSelect.Root minW="180px" size="sm">
                  <NativeSelect.Field
                    aria-label="周期の集計状態"
                    onChange={(event) =>
                      updateSearch({ completeness: event.currentTarget.value || undefined, cursor: undefined })
                    }
                    value={search.completeness ?? ""}
                  >
                    <option value="">すべての集計状態</option>
                    <option value="complete">集計済み</option>
                    <option value="partial">一部のみ集計</option>
                    <option value="unavailable">算出できない</option>
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </HStack>
            </Flex>
            {!cyclesErrorMessage && !cyclesLoading ? <CycleListCharts rows={model.cycles} /> : null}
            {cyclesErrorMessage ? (
              <QueryError message={cyclesErrorMessage} />
            ) : cyclesLoading ? (
              <Skeleton h="180px" />
            ) : (
              <CyclesTable
                emptyText={analyticsEmptyText(
                  cyclesMetadata ?? model.metadata,
                  "この条件に一致するシフト周期はありません",
                  pageInfo,
                )}
                navigate={navigate}
                rows={model.cycles}
                shopId={model.shopId}
              />
            )}
            {!cyclesErrorMessage && !cyclesLoading ? (
              <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
            ) : null}
          </Stack>
        </>
      )}
    </Stack>
  );
}
