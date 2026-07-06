import { Alert, Badge, Box, Button, Container, Flex, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsApiError, fetchAnalytics } from "@/api/analyticsClient";
import type {
  NotificationBreakdownRow,
  ShopSnapshotDto,
  ShopStageRowDto,
  ShopStagesResponse,
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
  STAGE_COLORS,
  STAGE_FILTERS,
  STAGE_LABELS,
  type StageFilter,
  stageCountsLineSeries,
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
    <Button colorPalette={active ? "teal" : "gray"} onClick={onClick} size="sm" variant={active ? "solid" : "ghost"}>
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
              <Heading color="gray.950" fontSize={{ base: "2xl", md: "3xl" }}>
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

          <HStack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={1} overflowX="auto" p={2}>
            {TABS.map((tab) => (
              <TabButton key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
                {tab.label}
              </TabButton>
            ))}
          </HStack>

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

function StagesSection({
  stages,
  isLoading,
  latestDate,
  errorMessage,
  stageFilter,
  onStageFilterChange,
  stageChartData,
}: StagesSectionProps) {
  const counts = stages?.stageCounts ?? null;
  const rows = stages?.rows ?? [];
  const attentionCount = rows.filter((row) => row.alerts.length > 0).length;
  const filteredRows = filterStageRows(rows, stageFilter);

  return (
    <Stack gap={4}>
      {errorMessage ? <ErrorPanel message={errorMessage} /> : null}
      <Grid gap={3} templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
        <KpiCard
          accent="gray"
          helper="スタッフ3人+募集2件+通知/提出が未達"
          isLoading={isLoading}
          label="開始前"
          value={formatNumber(counts?.beforeStart)}
        />
        <KpiCard
          accent="blue"
          helper="実利用開始済み・確定3件未満"
          isLoading={isLoading}
          label="立ち上がり中"
          value={formatNumber(counts?.activeTrial)}
        />
        <KpiCard
          accent="green"
          helper="確定3件以上+現在も稼働中"
          isLoading={isLoading}
          label="継続中"
          value={formatNumber(counts?.retained)}
        />
        <KpiCard
          accent="orange"
          helper={
            counts ? `立ち上がり後 ${counts.activeTrialDormant} / 継続後 ${counts.retainedDormant}` : "内訳を読み込み中"
          }
          isLoading={isLoading}
          label="休眠中"
          value={formatNumber(counts ? counts.activeTrialDormant + counts.retainedDormant : undefined)}
        />
      </Grid>

      <ChartPanel
        description={`${latestDate} 時点のステージ判定です。要確認 → 停止日数が長い順に並びます`}
        isLoading={isLoading}
        title="店舗一覧"
      >
        <Stack gap={3}>
          <HStack gap={1} overflowX="auto">
            {STAGE_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                colorPalette={stageFilter === filter.value ? "teal" : "gray"}
                onClick={() => onStageFilterChange(filter.value)}
                size="xs"
                variant={stageFilter === filter.value ? "solid" : "outline"}
              >
                {filter.value === "attention" && attentionCount > 0
                  ? `${filter.label} ${attentionCount}`
                  : filter.label}
              </Button>
            ))}
          </HStack>
          <DataTable
            columns={stageColumns()}
            emptyText={stageFilter === "attention" ? "要確認の店舗はありません" : "該当する店舗はありません"}
            getRowKey={(row) => row.shopId}
            rows={filteredRows}
          />
          {stages && stages.unclassifiedCount > 0 ? (
            <Text color="gray.500" fontSize="xs">
              ステージ未集計 {stages.unclassifiedCount}店舗（次回の日次集計で反映されます）
            </Text>
          ) : null}
        </Stack>
      </ChartPanel>

      <ChartPanel
        description="ステージ別店舗数の日次推移です。開始前→立ち上がり率などの遷移KPIはこの推移から読みます"
        title="ステージ推移"
      >
        <TrendChart data={stageChartData} keys={["開始前", "立ち上がり中", "継続中", "休眠中"]} />
      </ChartPanel>
    </Stack>
  );
}

function stageColumns(): DataTableColumn<ShopStageRowDto>[] {
  return [
    { header: "店舗", key: "shop", render: (row) => row.shopName },
    {
      header: "ステージ",
      key: "stage",
      render: (row) =>
        row.stage ? (
          <Badge colorPalette={STAGE_COLORS[row.stage]} variant="subtle">
            {STAGE_LABELS[row.stage]}
          </Badge>
        ) : (
          <Badge colorPalette="gray" variant="outline">
            未集計
          </Badge>
        ),
    },
    { header: "最終到達", key: "step", render: (row) => row.onboardingStepLabel ?? "-" },
    {
      align: "right",
      header: "停止日数",
      key: "stalled",
      render: (row) => (row.stalledDays === null ? "-" : `${row.stalledDays}日`),
    },
    { align: "right", header: "スタッフ", key: "staff", render: (row) => formatNumber(row.shiftTargetStaffCount) },
    { align: "right", header: "募集", key: "recruitment", render: (row) => formatNumber(row.recruitmentCount) },
    { align: "right", header: "確定", key: "confirmed", render: (row) => formatNumber(row.confirmedRecruitmentCount) },
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
      render: (row) =>
        row.alerts.length === 0 ? (
          <Text color="gray.400" fontSize="xs">
            -
          </Text>
        ) : (
          <HStack gap={1} wrap="wrap">
            {row.alerts.map((alert) => (
              <Badge key={alert} colorPalette="orange" variant="subtle">
                {alert}
              </Badge>
            ))}
          </HStack>
        ),
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
