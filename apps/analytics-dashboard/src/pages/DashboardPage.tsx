import { Alert, Badge, Box, Button, Container, Flex, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsApiError, fetchAnalytics } from "@/api/analyticsClient";
import type {
  NotificationBreakdownRow,
  ShopSnapshotDto,
  ShopStageRowDto,
  ShopStagesResponse,
  StageTransitionMetricDto,
  StageTransitionSummaryDto,
} from "@/api/analyticsTypes";
import { ChartPanel } from "@/components/ChartPanel";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { FilterBar, type PeriodPreset } from "@/components/FilterBar";
import { KpiCard } from "@/components/KpiCard";
import { TrendChart } from "@/components/TrendChart";
import { eventLineSeries, serviceSnapshotLineSeries } from "@/domains/analytics/chartSeries";
import {
  eventTotal,
  eventValueSum,
  latestLineFollowingRate,
  latestLineLinkedRate,
  ratio,
} from "@/domains/analytics/derivedKpis";
import { formatDateTime, formatLeadTimeMs, formatNumber, formatPercent } from "@/domains/analytics/format";
import {
  LINE_TREND_METRICS,
  metricLabel,
  RECRUITMENT_TREND_METRICS,
  SERVICE_TREND_METRICS,
} from "@/domains/analytics/metrics";
import {
  filterStageRows,
  nextOnboardingGap,
  onboardingProgressItems,
  STAGE_COLORS,
  STAGE_FILTERS,
  STAGE_LABELS,
  type StageFilter,
  type StageRowsSummary,
  stageCountsLineSeries,
  summarizeStageRows,
} from "@/domains/analytics/stages";

type DashboardTab = "stages" | "service" | "recruitment" | "notification" | "line" | "shops";

const TABS: { value: DashboardTab; label: string }[] = [
  { value: "stages", label: "店舗ステージ" },
  { value: "service", label: "サービス全体" },
  { value: "recruitment", label: "募集・提出" },
  { value: "notification", label: "通知" },
  { value: "line", label: "LINE" },
  { value: "shops", label: "店舗別" },
];

const PERIOD_DAYS: Record<PeriodPreset, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

const TAB_EVENT_METRICS: Record<Exclude<DashboardTab, "stages" | "notification" | "shops">, readonly string[]> = {
  line: LINE_TREND_METRICS,
  recruitment: RECRUITMENT_TREND_METRICS,
  service: SERVICE_TREND_METRICS,
};

function toJstDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rangeForPeriod(period: PeriodPreset) {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (PERIOD_DAYS[period] - 1) * 24 * 60 * 60 * 1000);
  return { from: toJstDateString(fromDate), to: toJstDateString(toDate) };
}

function initialSearchState() {
  const params = new URLSearchParams(window.location.search);
  const period = params.get("period");
  const tab = params.get("tab");
  return {
    period: period && period in PERIOD_DAYS ? (period as PeriodPreset) : "30d",
    tab: TABS.some((item) => item.value === tab) ? (tab as DashboardTab) : "stages",
  };
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Alert.Root status="error" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description>{message}</Alert.Description>
    </Alert.Root>
  );
}

function analyticsErrorMessage(error: unknown) {
  if (error instanceof AnalyticsApiError) {
    return `${error.message}（HTTP ${error.status}）`;
  }
  return "分析データを読み込めませんでした。期間を変えるか、少し時間をおいて再読み込みしてください";
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <Button
      colorPalette={active ? "teal" : "gray"}
      minW={0}
      onClick={onClick}
      px={{ base: 2, md: 3 }}
      size="sm"
      variant={active ? "solid" : "ghost"}
      w={{ base: "full", md: "auto" }}
      whiteSpace="nowrap"
    >
      {children}
    </Button>
  );
}

function notificationSummary(rows: NotificationBreakdownRow[]) {
  const summary = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.channel === "line" ? "LINE" : "メール"}${row.outcome === "failed" ? "失敗" : "送信"}`;
    summary.set(key, (summary.get(key) ?? 0) + row.count);
  }
  return [{ date: "合計", ...Object.fromEntries(summary.entries()) }];
}

export const DashboardPage = () => {
  const initial = useMemo(() => initialSearchState(), []);
  const [period, setPeriod] = useState<PeriodPreset>(initial.period);
  const [activeTab, setActiveTab] = useState<DashboardTab>(initial.tab);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("attention");
  const range = useMemo(() => rangeForPeriod(period), [period]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("period", period);
    params.set("tab", activeTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, period]);

  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview", range.from, range.to],
    queryFn: () => fetchAnalytics({ kind: "overview", from: range.from, to: range.to }),
  });

  const tabMetrics =
    activeTab === "stages" || activeTab === "notification" || activeTab === "shops" ? [] : TAB_EVENT_METRICS[activeTab];
  const eventTrendsQuery = useQuery({
    enabled: tabMetrics.length > 0,
    queryKey: ["analytics", "eventTrends", range.from, range.to, tabMetrics],
    queryFn: () => fetchAnalytics({ kind: "eventTrends", from: range.from, to: range.to, metrics: [...tabMetrics] }),
  });

  const notificationQuery = useQuery({
    enabled: activeTab === "notification",
    queryKey: ["analytics", "notificationBreakdown", range.from, range.to],
    queryFn: () => fetchAnalytics({ kind: "notificationBreakdown", from: range.from, to: range.to }),
  });

  const latestDate = overviewQuery.data?.data.latestServiceSnapshot?.date ?? range.to;
  const shopStagesQuery = useQuery({
    enabled: activeTab === "stages",
    queryKey: ["analytics", "shopStages", latestDate],
    queryFn: () => fetchAnalytics({ date: latestDate, kind: "shopStages" }),
  });

  const shopRankingQuery = useQuery({
    enabled: activeTab === "shops",
    queryKey: ["analytics", "shopRanking", latestDate],
    queryFn: () =>
      fetchAnalytics({
        date: latestDate,
        kind: "shopRanking",
        limit: 50,
        sort: "lineLinkedRate",
      }),
  });

  const shopDetailQuery = useQuery({
    enabled: activeTab === "shops" && selectedShopId !== null,
    queryKey: ["analytics", "shopDetail", selectedShopId, range.from, range.to],
    queryFn: () =>
      fetchAnalytics({
        from: range.from,
        kind: "shopDetail",
        shopId: selectedShopId ?? "",
        to: range.to,
      }),
  });

  const overview = overviewQuery.data?.data;
  const latest = overview?.latestServiceSnapshot ?? null;
  const env = overviewQuery.data?.env;
  const submissionRate = ratio(
    eventValueSum(overview?.eventTotals ?? [], "recruitment.confirmed.submittedTotal"),
    eventValueSum(overview?.eventTotals ?? [], "recruitment.confirmed.expectedStaffTotal"),
  );
  const confirmedCount = eventTotal(overview?.eventTotals ?? [], "recruitment.confirmed");
  const averageLeadTime =
    confirmedCount > 0
      ? (eventValueSum(overview?.eventTotals ?? [], "recruitment.confirmed") ?? 0) / confirmedCount
      : null;

  return (
    <Box bg="gray.50" minH="100vh">
      <Container maxW="1440px" px={{ base: 4, md: 6 }} py={6}>
        <Stack gap={5}>
          <Flex
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={3}
            justify="space-between"
          >
            <Box>
              <Heading color="gray.950" fontSize={{ base: "xl", sm: "2xl", md: "3xl" }}>
                Shiftori Analytics
              </Heading>
              <Text color="gray.600" fontSize="sm" mt={1}>
                日次KPIから、利用状況と詰まりを確認します
              </Text>
            </Box>
            <Badge colorPalette="teal" size="lg" variant="subtle">
              private dashboard
            </Badge>
          </Flex>

          <FilterBar
            convexHost={env?.convexHost}
            envLabel={env?.label}
            from={range.from}
            latestDate={latest?.date}
            onPeriodChange={setPeriod}
            period={period}
            to={range.to}
          />

          {overviewQuery.error ? <ErrorPanel message={analyticsErrorMessage(overviewQuery.error)} /> : null}

          {activeTab === "stages" ? (
            <StageSummaryCards
              isLoading={shopStagesQuery.isLoading}
              latestComputedAt={latest?.computedAt}
              stages={shopStagesQuery.data?.data ?? null}
              transitions={overview?.stageTransitions ?? null}
            />
          ) : (
            <Grid gap={3} templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
              <KpiCard
                accent="teal"
                helper={`最終更新 ${formatDateTime(latest?.computedAt)}`}
                isLoading={overviewQuery.isLoading}
                label="店舗数"
                value={formatNumber(latest?.shopCount)}
              />
              <KpiCard
                accent="blue"
                helper={`対象スタッフ ${formatNumber(latest?.shiftTargetStaffCount)}`}
                isLoading={overviewQuery.isLoading}
                label="スタッフ数"
                value={formatNumber(latest?.staffCount)}
              />
              <KpiCard
                accent="green"
                helper={`follow率 ${formatPercent(latestLineFollowingRate(latest))}`}
                isLoading={overviewQuery.isLoading}
                label="LINE連携率"
                value={formatPercent(latestLineLinkedRate(latest))}
              />
              <KpiCard
                accent="orange"
                helper={`登録申請 ${formatNumber(latest?.pendingRegistrationRequestCount)}`}
                isLoading={overviewQuery.isLoading}
                label="募集中"
                value={formatNumber(latest?.openRecruitmentCount)}
              />
            </Grid>
          )}

          <Grid
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            gap={1}
            p={2}
            templateColumns={{ base: "repeat(3, minmax(0, 1fr))", md: "repeat(6, max-content)" }}
          >
            {TABS.map((tab) => (
              <TabButton key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
                {tab.label}
              </TabButton>
            ))}
          </Grid>

          {activeTab === "stages" ? (
            <StagesSection
              errorMessage={shopStagesQuery.error ? analyticsErrorMessage(shopStagesQuery.error) : null}
              isLoading={shopStagesQuery.isLoading}
              latestDate={latestDate}
              onStageFilterChange={setStageFilter}
              stageChartData={stageCountsLineSeries(overview?.serviceSnapshots ?? [])}
              stageFilter={stageFilter}
              stages={shopStagesQuery.data?.data ?? null}
            />
          ) : null}

          {activeTab === "service" ? (
            <Grid gap={4} templateColumns={{ base: "1fr", xl: "1.2fr 1fr" }}>
              <ChartPanel
                description="店舗数、スタッフ数、募集中の推移です"
                isLoading={overviewQuery.isLoading}
                title="サービス状態"
              >
                <TrendChart
                  data={serviceSnapshotLineSeries(overview?.serviceSnapshots ?? [])}
                  keys={["店舗数", "スタッフ数", "募集中"]}
                />
              </ChartPanel>
              <ChartPanel
                description="店舗作成、スタッフ作成、登録申請の発生数です"
                isLoading={eventTrendsQuery.isLoading}
                title="イベント推移"
              >
                <TrendChart
                  data={eventLineSeries(eventTrendsQuery.data?.data.series ?? [], SERVICE_TREND_METRICS)}
                  keys={SERVICE_TREND_METRICS.map(metricLabel)}
                  kind="bar"
                />
              </ChartPanel>
            </Grid>
          ) : null}

          {activeTab === "recruitment" ? (
            <Stack gap={4}>
              <Grid gap={3} templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}>
                <KpiCard
                  label="募集作成"
                  value={formatNumber(eventTotal(overview?.eventTotals ?? [], "recruitment.created"))}
                />
                <KpiCard label="提出率" value={formatPercent(submissionRate)} />
                <KpiCard label="平均確定リードタイム" value={formatLeadTimeMs(averageLeadTime)} />
              </Grid>
              <ChartPanel
                description="募集作成、初回提出、確定の推移です"
                isLoading={eventTrendsQuery.isLoading}
                title="募集・提出の推移"
              >
                <TrendChart
                  data={eventLineSeries(eventTrendsQuery.data?.data.series ?? [], RECRUITMENT_TREND_METRICS)}
                  keys={RECRUITMENT_TREND_METRICS.map(metricLabel)}
                />
              </ChartPanel>
            </Stack>
          ) : null}

          {activeTab === "notification" ? (
            <Grid gap={4} templateColumns={{ base: "1fr", xl: "1fr 1fr" }}>
              <ChartPanel
                description="メールとLINEの送信・失敗を合計で確認します"
                isLoading={notificationQuery.isLoading}
                title="通知内訳"
              >
                <TrendChart
                  data={notificationSummary(notificationQuery.data?.data.rows ?? [])}
                  keys={["メール送信", "メール失敗", "LINE送信", "LINE失敗"]}
                  kind="bar"
                />
              </ChartPanel>
              <ChartPanel description="通知種別ごとの件数です" isLoading={notificationQuery.isLoading} title="通知種別">
                <DataTable
                  columns={[
                    {
                      header: "チャネル",
                      key: "channel",
                      render: (row) => (row.channel === "line" ? "LINE" : "メール"),
                    },
                    { header: "結果", key: "outcome", render: (row) => (row.outcome === "failed" ? "失敗" : "送信") },
                    { header: "通知種別", key: "kind", render: (row) => metricLabel(row.metric) },
                    { align: "right", header: "件数", key: "count", render: (row) => formatNumber(row.count) },
                  ]}
                  getRowKey={(row) => row.metric}
                  rows={(notificationQuery.data?.data.rows ?? []).filter((row) => row.count > 0)}
                />
              </ChartPanel>
            </Grid>
          ) : null}

          {activeTab === "line" ? (
            <Stack gap={4}>
              <Grid gap={3} templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}>
                <KpiCard label="LINE連携スタッフ" value={formatNumber(latest?.lineLinkedStaffCount)} />
                <KpiCard label="LINE follow中" value={formatNumber(latest?.lineFollowingStaffCount)} />
                <KpiCard
                  label="新規LINE連携"
                  value={formatNumber(eventTotal(overview?.eventTotals ?? [], "line.linked"))}
                />
              </Grid>
              <ChartPanel
                description="新規LINE連携数の推移です"
                isLoading={eventTrendsQuery.isLoading}
                title="LINE連携"
              >
                <TrendChart
                  data={eventLineSeries(eventTrendsQuery.data?.data.series ?? [], LINE_TREND_METRICS)}
                  keys={LINE_TREND_METRICS.map(metricLabel)}
                  kind="bar"
                />
              </ChartPanel>
            </Stack>
          ) : null}

          {activeTab === "shops" ? (
            <Grid gap={4} templateColumns={{ base: "1fr", xl: "1.1fr 0.9fr" }}>
              <ChartPanel
                description={`${latestDate} の店舗別LINE連携率です`}
                isLoading={shopRankingQuery.isLoading}
                title="店舗別ランキング"
              >
                <DataTable
                  columns={shopRankingColumns(setSelectedShopId)}
                  getRowKey={(row) => row.shopId}
                  rows={shopRankingQuery.data?.data.rows ?? []}
                />
              </ChartPanel>
              <ChartPanel
                description="店舗行の詳細から、店舗別の状態推移を確認できます"
                isLoading={shopDetailQuery.isLoading}
                title="店舗詳細"
              >
                {selectedShopId ? (
                  <TrendChart
                    data={(shopDetailQuery.data?.data.series ?? []).map((row) => ({
                      date: row.date,
                      LINE連携率: row.lineLinkedRate === null ? null : row.lineLinkedRate * 100,
                      募集中: row.openRecruitmentCount,
                      対象スタッフ: row.shiftTargetStaffCount,
                    }))}
                    keys={["LINE連携率", "募集中", "対象スタッフ"]}
                  />
                ) : (
                  <Flex align="center" bg="gray.50" borderRadius="md" h="full" justify="center">
                    <Text color="gray.500" fontSize="sm">
                      店舗を選ぶと詳細を表示します
                    </Text>
                  </Flex>
                )}
              </ChartPanel>
            </Grid>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
};

type StagesSectionProps = {
  stages: ShopStagesResponse | null;
  isLoading: boolean;
  latestDate: string;
  errorMessage: string | null;
  stageFilter: StageFilter;
  onStageFilterChange: (filter: StageFilter) => void;
  stageChartData: ReturnType<typeof stageCountsLineSeries>;
};

function StageSummaryCards({
  stages,
  isLoading,
  latestComputedAt,
  transitions,
}: {
  stages: ShopStagesResponse | null;
  isLoading: boolean;
  latestComputedAt?: number;
  transitions: StageTransitionSummaryDto | null;
}) {
  const counts = stages?.stageCounts ?? null;
  const summary = summarizeStageRows(stages?.rows ?? []);
  const retainedHelper =
    summary.retainedAverageRecruitmentCreatedLast30Days !== null ||
    summary.retainedAverageConfirmationLeadTimeMs !== null
      ? `作成頻度 ${formatNumber(summary.retainedAverageRecruitmentCreatedLast30Days)}件/30日 / 確定 ${formatLeadTimeMs(summary.retainedAverageConfirmationLeadTimeMs)}`
      : `平均 ${formatNumber(summary.retainedAverageStaffCount)}人 / LINE ${formatPercent(summary.retainedLineLinkedRate)}`;
  const dormantHelper = summary.dormantTopStoppedStep
    ? `停止 ${summary.dormantTopStoppedStep.label} ${summary.dormantTopStoppedStep.count}店`
    : `停止 - / 立ち上がり後 ${formatNumber(summary.activeTrialDormantCount)}店`;
  return (
    <Stack gap={3}>
      <Grid gap={3} templateColumns={{ base: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }}>
        <KpiCard
          accent="gray"
          helper={
            summary.beforeStartTopStep
              ? `最多: ${summary.beforeStartTopStep.label} ${summary.beforeStartTopStep.count}店`
              : `最終更新 ${formatDateTime(latestComputedAt)}`
          }
          isLoading={isLoading}
          label="開始前"
          value={formatNumber(counts?.beforeStart)}
        />
        <KpiCard
          accent="blue"
          helper={`要確認 ${formatNumber(summary.activeTrialAttentionCount)} / 順調 ${formatNumber(summary.activeTrialOkCount)}`}
          isLoading={isLoading}
          label="立ち上がり中"
          value={formatNumber(counts?.activeTrial)}
        />
        <KpiCard
          accent="green"
          helper={retainedHelper}
          isLoading={isLoading}
          label="継続中"
          value={formatNumber(counts?.retained)}
        />
        <KpiCard
          accent="orange"
          helper={dormantHelper}
          isLoading={isLoading}
          label="休眠中"
          value={formatNumber(counts ? counts.activeTrialDormant + counts.retainedDormant : undefined)}
        />
      </Grid>
      <StageTransitionKpis isLoading={isLoading} transitions={transitions} />
    </Stack>
  );
}

function metricFraction(metric: StageTransitionMetricDto | null | undefined) {
  if (!metric) return "読み込み中";
  if (metric.denominator === 0) return "対象なし";
  return `${formatNumber(metric.numerator)}/${formatNumber(metric.denominator)}店舗`;
}

function StageKpiTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Box bg="gray.50" borderRadius="md" minH="72px" minW={0} p={3}>
      <Text color="gray.500" fontSize="xs" fontWeight="bold">
        {label}
      </Text>
      <Text color="gray.950" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" lineHeight="1.1" mt={1}>
        {value}
      </Text>
      <Text color="gray.500" fontSize="xs" mt={1} overflowWrap="anywhere">
        {helper}
      </Text>
    </Box>
  );
}

function StageTransitionKpis({
  transitions,
  isLoading,
}: {
  transitions: StageTransitionSummaryDto | null;
  isLoading: boolean;
}) {
  const transitionLabel = transitions
    ? `${transitions.fromDate} → ${transitions.toDate}`
    : isLoading
      ? "期間内の遷移を読み込み中"
      : "期間内の遷移データは未取得";
  const metricHelper = (metric: StageTransitionMetricDto | null | undefined) =>
    isLoading ? "読み込み中" : transitions ? metricFraction(metric) : "未取得";
  const metricValue = (metric: StageTransitionMetricDto | null | undefined) =>
    isLoading || !transitions ? "-" : formatPercent(metric?.rate);

  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}>
      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={1}
        justify="space-between"
      >
        <Text color="gray.950" fontSize="sm" fontWeight="bold">
          期間内ステージ遷移
        </Text>
        <Text color="gray.500" fontSize="xs">
          {transitionLabel}
        </Text>
      </Flex>
      <Grid gap={2} mt={3} templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}>
        <StageKpiTile
          helper={metricHelper(transitions?.beforeStartToActiveTrial)}
          label="開始前→立ち上がり"
          value={metricValue(transitions?.beforeStartToActiveTrial)}
        />
        <StageKpiTile
          helper={metricHelper(transitions?.activeTrialToRetained)}
          label="立ち上がり→継続"
          value={metricValue(transitions?.activeTrialToRetained)}
        />
        <StageKpiTile
          helper={metricHelper(transitions?.retainedToDormant)}
          label="継続→休眠"
          value={metricValue(transitions?.retainedToDormant)}
        />
        <StageKpiTile
          helper={metricHelper(transitions?.dormantToRecovered)}
          label="休眠→復帰"
          value={metricValue(transitions?.dormantToRecovered)}
        />
      </Grid>
    </Box>
  );
}

function StagesSection({
  stages,
  isLoading,
  latestDate,
  errorMessage,
  stageFilter,
  onStageFilterChange,
  stageChartData,
}: StagesSectionProps) {
  const rows = stages?.rows ?? [];
  const attentionCount = rows.filter((row) => row.alerts.length > 0).length;
  const filteredRows = filterStageRows(rows, stageFilter);
  const summary = summarizeStageRows(rows);

  return (
    <Stack gap={4}>
      {errorMessage ? <ErrorPanel message={errorMessage} /> : null}
      <ChartPanel
        contentHeight="auto"
        description={`${latestDate} 時点のステージ判定です。要確認 → 停止日数が長い順に並びます`}
        isLoading={isLoading}
        title="店舗一覧"
      >
        <Stack gap={3}>
          <Grid gap={1} templateColumns={{ base: "repeat(3, minmax(0, 1fr))", md: "repeat(6, max-content)" }}>
            {STAGE_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                colorPalette={stageFilter === filter.value ? "teal" : "gray"}
                minW={0}
                onClick={() => onStageFilterChange(filter.value)}
                px={{ base: 1, md: 3 }}
                size="xs"
                variant={stageFilter === filter.value ? "solid" : "outline"}
                w={{ base: "full", md: "auto" }}
                whiteSpace="nowrap"
              >
                {filter.value === "attention" && attentionCount > 0
                  ? `${filter.label} ${attentionCount}`
                  : filter.label}
              </Button>
            ))}
          </Grid>
          <Box display={{ base: "block", lg: "none" }} h="full" minH={0}>
            <StageRowList
              emptyText={stageFilter === "attention" ? "要確認の店舗はありません" : "該当する店舗はありません"}
              rows={filteredRows}
              summary={summary}
            />
          </Box>
          <Box display={{ base: "none", lg: "block" }} h="full" minH={0}>
            <DataTable
              columns={stageColumns(summary)}
              emptyText={stageFilter === "attention" ? "要確認の店舗はありません" : "該当する店舗はありません"}
              getRowKey={(row) => row.shopId}
              rows={filteredRows}
            />
          </Box>
          {stages && stages.unclassifiedCount > 0 ? (
            <Text color="gray.500" fontSize="xs">
              ステージ未集計 {stages.unclassifiedCount}店舗（次回の日次集計で反映されます）
            </Text>
          ) : null}
        </Stack>
      </ChartPanel>

      <ChartPanel description="ステージ別店舗数の日次推移です。日ごとの構成変化を見ます" title="ステージ推移">
        <TrendChart data={stageChartData} keys={["開始前", "立ち上がり中", "継続中", "休眠中"]} />
      </ChartPanel>
    </Stack>
  );
}

function StageBadge({ row }: { row: ShopStageRowDto }) {
  return row.stage ? (
    <Badge colorPalette={STAGE_COLORS[row.stage]} variant="subtle">
      {STAGE_LABELS[row.stage]}
    </Badge>
  ) : (
    <Badge colorPalette="gray" variant="outline">
      未集計
    </Badge>
  );
}

function stageReasonLabels(row: ShopStageRowDto): string[] {
  if (row.stage === null) return ["ステージ未集計"];
  const isDormant = row.stage === "activeTrialDormant" || row.stage === "retainedDormant";
  const nextGap = nextOnboardingGap(row);
  const activationSignal = row.hasNotificationSent === true || row.hasSubmission === true ? "あり" : "なし";
  const labels = [
    `スタッフ ${formatNumber(row.shiftTargetStaffCount)}人 / 条件3人以上`,
    `本番シフト ${formatNumber(row.recruitmentCount)}件 / 条件2件以上`,
    `通知または提出 ${activationSignal}`,
  ];
  if (row.stage === "beforeStart" && nextGap) labels.push(`未達 ${nextGap.label}`);
  if (row.stage !== "beforeStart") {
    labels.push(`確定 ${formatNumber(row.confirmedRecruitmentCount)}件 / 継続条件3件以上`);
    if (row.hasCurrentOrFutureConfirmedShift) labels.push("現在/未来シフトあり");
    else if (row.openRecruitmentCount > 0) labels.push("進行中の募集あり");
    else labels.push("現在/未来シフト・進行中募集なし");
  }
  if (isDormant) {
    labels.push(`停止ステップ ${row.onboardingStepLabel ?? "-"}`);
    labels.push(`最終活動 ${formatDateTime(row.lastActivityAt)}`);
    labels.push(`最後のシフト作成 ${formatDateTime(row.lastRecruitmentCreatedAt)}`);
    labels.push(`最後の確定 ${formatDateTime(row.lastRecruitmentConfirmedAt)}`);
  }
  return labels;
}

function stageRowLineLinkedRate(row: ShopStageRowDto) {
  if (row.shiftTargetStaffCount === 0) return null;
  return row.lineLinkedStaffCount / row.shiftTargetStaffCount;
}

function stageRowNotificationLineHelper(row: ShopStageRowDto) {
  if (row.emailNotificationSentCount === null || row.lineNotificationSentCount === null) return undefined;
  const total = row.emailNotificationSentCount + row.lineNotificationSentCount;
  return `${formatNumber(row.lineNotificationSentCount)}/${formatNumber(total)}件`;
}

function formatPresence(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value ? "あり" : "なし";
}

function formatNumberWithUnit(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)}${unit}`;
}

function formatRecruitmentFrequency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)}件/30日`;
}

function formatPercentPointDelta(delta: number) {
  return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}pt`;
}

function formatLeadTimeDelta(deltaMs: number) {
  const sign = deltaMs >= 0 ? "+" : "-";
  return `${sign}${formatLeadTimeMs(Math.abs(deltaMs))}`;
}

function formatNumberDelta(delta: number, unit = "") {
  const sign = delta >= 0 ? "+" : "";
  const value = Number.isInteger(delta) ? formatNumber(delta) : delta.toFixed(1);
  return `${sign}${value}${unit}`;
}

function isDormantStage(row: ShopStageRowDto) {
  return row.stage === "activeTrialDormant" || row.stage === "retainedDormant";
}

function dormantDifferenceLabels(row: ShopStageRowDto, summary: StageRowsSummary) {
  if (!isDormantStage(row)) return [];
  const labels: string[] = [];
  if (row.submissionRate !== null && summary.retainedSubmissionRate !== null) {
    const delta = row.submissionRate - summary.retainedSubmissionRate;
    if (delta <= -0.1) labels.push(`提出率 ${formatPercentPointDelta(delta)}`);
  }
  if (row.averageConfirmationLeadTimeMs !== null && summary.retainedAverageConfirmationLeadTimeMs !== null) {
    const delta = row.averageConfirmationLeadTimeMs - summary.retainedAverageConfirmationLeadTimeMs;
    if (delta >= 24 * 60 * 60 * 1000) labels.push(`確定 ${formatLeadTimeDelta(delta)}`);
  }
  if (row.notificationLineSentRate !== null && summary.retainedNotificationLineSentRate !== null) {
    const delta = row.notificationLineSentRate - summary.retainedNotificationLineSentRate;
    if (delta <= -0.1) labels.push(`LINE比率 ${formatPercentPointDelta(delta)}`);
  }
  if (summary.retainedAverageStaffCount !== null) {
    const delta = row.shiftTargetStaffCount - summary.retainedAverageStaffCount;
    if (delta <= -1) labels.push(`スタッフ ${formatNumberDelta(delta, "人")}`);
  }
  if (row.openNotificationFailureCount !== null && summary.retainedAverageNotificationFailureCount !== null) {
    const delta = row.openNotificationFailureCount - summary.retainedAverageNotificationFailureCount;
    if (delta >= 1) labels.push(`通知失敗 ${formatNumberDelta(delta, "件")}`);
  }
  return labels;
}

function StageMetricItem({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Box minW={0}>
      <Text color="gray.500" fontSize="xs" fontWeight="bold">
        {label}
      </Text>
      <Text color="gray.900" fontSize="sm" fontWeight="semibold" lineHeight="1.3">
        {value}
      </Text>
      {helper ? (
        <Text color="gray.500" fontSize="xs" lineHeight="1.3">
          {helper}
        </Text>
      ) : null}
    </Box>
  );
}

function StageMetricChip({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Box bg="gray.50" borderRadius="sm" minW={0} px={2} py={1}>
      <Text color="gray.500" fontSize="xs" lineHeight="1.35" whiteSpace="nowrap">
        {label}{" "}
        <Text as="span" color="gray.900" fontWeight="semibold">
          {value}
        </Text>
        {helper ? (
          <Text as="span" color="gray.500">
            {" "}
            {helper}
          </Text>
        ) : null}
      </Text>
    </Box>
  );
}

function stageMetricItems(row: ShopStageRowDto) {
  return [
    { label: "スタッフ", value: formatNumber(row.shiftTargetStaffCount) },
    { label: "募集", value: formatNumber(row.recruitmentCount) },
    { helper: "募集", label: "提出あり", value: formatNumberWithUnit(row.submittedRecruitmentCount, "件") },
    { label: "提出率", value: formatPercent(row.submissionRate) },
    { label: "確定", value: formatNumber(row.confirmedRecruitmentCount) },
    { label: "作成頻度", value: formatRecruitmentFrequency(row.recruitmentCreatedLast30Days) },
    { label: "確定日数", value: formatLeadTimeMs(row.averageConfirmationLeadTimeMs) },
    {
      helper: `${formatNumber(row.lineLinkedStaffCount)}/${formatNumber(row.shiftTargetStaffCount)}人`,
      label: "LINE",
      value: formatPercent(stageRowLineLinkedRate(row)),
    },
    { label: "通知失敗", value: formatNumber(row.openNotificationFailureCount) },
    { label: "初回提出", value: formatLeadTimeMs(row.averageFirstSubmissionLeadTimeMs) },
    {
      helper: stageRowNotificationLineHelper(row),
      label: "LINE比率",
      value: formatPercent(row.notificationLineSentRate),
    },
    { label: "再提出", value: formatPercent(row.resubmissionRate) },
    { label: "催促後", value: formatPercent(row.postReminderSubmissionRate) },
    { label: "最終提出率", value: formatPercent(row.lastRecruitmentSubmissionRate) },
    { label: "最終確定日数", value: formatLeadTimeMs(row.lastConfirmedRecruitmentLeadTimeMs) },
    { label: "進行中提出", value: formatNumber(row.openRecruitmentSubmittedCount) },
    { label: "現在/未来", value: formatPresence(row.hasCurrentOrFutureConfirmedShift) },
  ];
}

function StageRowMetrics({ row, compact = false }: { row: ShopStageRowDto; compact?: boolean }) {
  if (compact) {
    return (
      <HStack align="start" gap={1} maxW="460px" wrap="wrap">
        {stageMetricItems(row).map((item) => (
          <StageMetricChip key={item.label} {...item} />
        ))}
      </HStack>
    );
  }

  return (
    <Stack gap={2} minW={{ base: 0, lg: "300px" }}>
      <Grid gap={2} templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" }}>
        <StageMetricItem label="スタッフ" value={formatNumber(row.shiftTargetStaffCount)} />
        <StageMetricItem label="募集" value={formatNumber(row.recruitmentCount)} />
        <StageMetricItem
          helper="募集"
          label="提出あり"
          value={formatNumberWithUnit(row.submittedRecruitmentCount, "件")}
        />
        <StageMetricItem label="提出率" value={formatPercent(row.submissionRate)} />
        <StageMetricItem label="確定" value={formatNumber(row.confirmedRecruitmentCount)} />
        <StageMetricItem label="作成頻度" value={formatRecruitmentFrequency(row.recruitmentCreatedLast30Days)} />
        <StageMetricItem label="確定日数" value={formatLeadTimeMs(row.averageConfirmationLeadTimeMs)} />
        <StageMetricItem
          helper={`${formatNumber(row.lineLinkedStaffCount)}/${formatNumber(row.shiftTargetStaffCount)}人`}
          label="LINE"
          value={formatPercent(stageRowLineLinkedRate(row))}
        />
        <StageMetricItem label="通知失敗" value={formatNumber(row.openNotificationFailureCount)} />
      </Grid>
      <Grid
        borderTop="1px solid"
        borderColor="gray.100"
        gap={2}
        pt={2}
        templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" }}
      >
        <StageMetricItem label="初回提出" value={formatLeadTimeMs(row.averageFirstSubmissionLeadTimeMs)} />
        <StageMetricItem
          helper={stageRowNotificationLineHelper(row)}
          label="LINE比率"
          value={formatPercent(row.notificationLineSentRate)}
        />
        <StageMetricItem label="再提出" value={formatPercent(row.resubmissionRate)} />
        <StageMetricItem label="催促後" value={formatPercent(row.postReminderSubmissionRate)} />
        <StageMetricItem label="最終提出率" value={formatPercent(row.lastRecruitmentSubmissionRate)} />
        <StageMetricItem label="最終確定日数" value={formatLeadTimeMs(row.lastConfirmedRecruitmentLeadTimeMs)} />
        <StageMetricItem label="進行中提出" value={formatNumber(row.openRecruitmentSubmittedCount)} />
        <StageMetricItem label="現在/未来" value={formatPresence(row.hasCurrentOrFutureConfirmedShift)} />
      </Grid>
    </Stack>
  );
}

function StageDifferenceBadges({ row, summary }: { row: ShopStageRowDto; summary: StageRowsSummary }) {
  const labels = dormantDifferenceLabels(row, summary);
  if (labels.length === 0) return null;
  return (
    <Stack gap={1}>
      <Text color="gray.500" fontSize="xs" fontWeight="bold">
        継続平均との差
      </Text>
      <HStack gap={1} wrap="wrap">
        {labels.map((label) => (
          <Badge key={label} colorPalette="purple" variant="subtle">
            {label}
          </Badge>
        ))}
      </HStack>
    </Stack>
  );
}

function StageSignals({ row, summary }: { row: ShopStageRowDto; summary: StageRowsSummary }) {
  if (row.alerts.length === 0 && dormantDifferenceLabels(row, summary).length === 0) {
    return (
      <Text color="gray.400" fontSize="xs">
        -
      </Text>
    );
  }
  return (
    <Stack gap={1}>
      {row.alerts.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          {row.alerts.map((alert) => (
            <Badge key={alert} colorPalette="orange" variant="subtle">
              {alert}
            </Badge>
          ))}
        </HStack>
      ) : null}
      <StageDifferenceBadges row={row} summary={summary} />
    </Stack>
  );
}

function StageProgressBadges({ compact = false, row }: { row: ShopStageRowDto; compact?: boolean }) {
  if (row.stage !== "beforeStart") return null;
  const badgeConfig = (status: "reached" | "unreached" | "unknown") => {
    if (status === "reached") return { colorPalette: "green", prefix: "済", variant: "subtle" as const };
    if (status === "unknown") return { colorPalette: "gray", prefix: "未計測", variant: "surface" as const };
    return { colorPalette: "gray", prefix: "未", variant: "outline" as const };
  };
  return (
    <Stack gap={1} maxW={compact ? "260px" : undefined}>
      {compact ? null : (
        <Text color="gray.500" fontSize="xs" fontWeight="bold">
          オンボーディング進捗
        </Text>
      )}
      <HStack gap={1} wrap="wrap">
        {onboardingProgressItems(row).map((item) => {
          const config = badgeConfig(item.status);
          return (
            <Badge key={item.label} colorPalette={config.colorPalette} variant={config.variant}>
              {config.prefix} {item.label}
            </Badge>
          );
        })}
      </HStack>
    </Stack>
  );
}

function StageStepSummary({ row }: { row: ShopStageRowDto }) {
  const nextGap = nextOnboardingGap(row);
  return (
    <Stack gap={1}>
      <Text color="gray.900" fontSize="sm" fontWeight="semibold">
        {row.onboardingStepLabel ?? "-"}
      </Text>
      {row.stage === "beforeStart" && nextGap ? (
        <Text color="orange.700" fontSize="xs" fontWeight="semibold">
          未達: {nextGap.label}
        </Text>
      ) : null}
      <StageProgressBadges compact row={row} />
    </Stack>
  );
}

function StageRowList({
  rows,
  emptyText,
  summary,
}: {
  rows: ShopStageRowDto[];
  emptyText: string;
  summary: StageRowsSummary;
}) {
  if (rows.length === 0) {
    return (
      <Box bg="gray.50" borderRadius="md" p={5}>
        <Text color="gray.500" fontSize="sm">
          {emptyText}
        </Text>
      </Box>
    );
  }
  return (
    <Stack gap={0} h="full" overflow="auto" pr={1}>
      {rows.map((row) => (
        <Box key={row.shopId} borderBottom="1px solid" borderColor="gray.100" py={3}>
          <Box>
            <Flex align="start" gap={2} justify="space-between">
              <Box minW={0}>
                <Text color="gray.950" fontSize="sm" fontWeight="bold">
                  {row.shopName}
                </Text>
              </Box>
              <HStack flexShrink={0} gap={1} wrap="wrap">
                <StageBadge row={row} />
                {row.stalledDays === null ? null : (
                  <Badge colorPalette={row.stalledDays >= 30 ? "orange" : "gray"} variant="surface">
                    {row.stalledDays}日停止
                  </Badge>
                )}
              </HStack>
            </Flex>
            <Text color="gray.500" fontSize="xs" mt={1}>
              最終到達: {row.onboardingStepLabel ?? "-"}
            </Text>
            {row.stage === "beforeStart" ? (
              <Text color="orange.700" fontSize="xs" fontWeight="semibold" mt={1}>
                未達: {nextOnboardingGap(row)?.label ?? "-"}
              </Text>
            ) : null}
          </Box>
          <Box mt={3}>
            <StageRowMetrics row={row} />
          </Box>
          {row.stage === "beforeStart" ? (
            <Box mt={2}>
              <StageProgressBadges row={row} />
            </Box>
          ) : null}
          {row.alerts.length > 0 ? (
            <HStack gap={1} mt={2} wrap="wrap">
              {row.alerts.map((alert) => (
                <Badge key={alert} colorPalette="orange" variant="subtle">
                  {alert}
                </Badge>
              ))}
            </HStack>
          ) : null}
          <Box mt={2}>
            <StageDifferenceBadges row={row} summary={summary} />
          </Box>
          <Stack gap={1} mt={2}>
            {stageReasonLabels(row).map((label) => (
              <Text key={label} color="gray.500" fontSize="xs">
                {label}
              </Text>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function stageColumns(summary: StageRowsSummary): DataTableColumn<ShopStageRowDto>[] {
  return [
    { header: "店舗", key: "shop", render: (row) => row.shopName },
    {
      header: "ステージ",
      key: "stage",
      render: (row) => <StageBadge row={row} />,
    },
    { header: "最終到達", key: "step", render: (row) => <StageStepSummary row={row} /> },
    {
      align: "right",
      header: "停止日数",
      key: "stalled",
      render: (row) => (row.stalledDays === null ? "-" : `${row.stalledDays}日`),
    },
    { header: "利用KPI", key: "metrics", render: (row) => <StageRowMetrics compact row={row} /> },
    {
      align: "center",
      header: "現在/未来シフト",
      key: "future",
      render: (row) =>
        row.hasCurrentOrFutureConfirmedShift === null ? "-" : row.hasCurrentOrFutureConfirmedShift ? "あり" : "なし",
    },
    {
      header: "気になる点",
      key: "alerts",
      render: (row) => <StageSignals row={row} summary={summary} />,
    },
  ];
}

function shopRankingColumns(onSelect: (shopId: string) => void): DataTableColumn<ShopSnapshotDto>[] {
  return [
    { header: "店舗", key: "shop", render: (row) => row.shopName },
    { header: "plan", key: "plan", render: (row) => row.planKey },
    { align: "right", header: "スタッフ", key: "staff", render: (row) => formatNumber(row.staffCount) },
    { align: "right", header: "LINE連携率", key: "lineRate", render: (row) => formatPercent(row.lineLinkedRate) },
    {
      align: "right",
      header: "募集中",
      key: "openRecruitment",
      render: (row) => formatNumber(row.openRecruitmentCount),
    },
    {
      align: "center",
      header: "詳細",
      key: "detail",
      render: (row) => (
        <Button onClick={() => onSelect(row.shopId)} size="xs" variant="outline">
          見る
        </Button>
      ),
    },
  ];
}
