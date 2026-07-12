import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  Icon,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuChartColumnIncreasing, LuFlag, LuMoonStar, LuRocket } from "react-icons/lu";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  FeatureRequestRowDto,
  ServiceSnapshotDto,
  ShopRecruitmentsResponse,
  ShopStageCounts,
  ShopStagesResponse,
  StageTransitionMetricDto,
  StageTransitionSummaryDto,
} from "@/api/analyticsTypes";
import { formatDateTime, formatNumber, formatPercent } from "@/domains/analytics/format";
import { ActivationTabContent } from "./ActivationTabContent";
import { BeforeStartTabContent } from "./BeforeStartTabContent";
import { DormantTabContent } from "./DormantTabContent";
import { FeatureRequestsTabContent } from "./FeatureRequestsTabContent";
import { RetainedTabContent } from "./RetainedTabContent";
import { ShopListTabContent } from "./ShopListTabContent";
import { ShopRecruitmentsDialog } from "./ShopRecruitmentsDialog";

export type DashboardView =
  | "summary"
  | "beforeStart"
  | "activation"
  | "retention"
  | "dormant"
  | "shops"
  | "featureRequests";

type DashboardTopProps = {
  activeView: DashboardView;
  onActiveViewChange: (view: DashboardView) => void;
  env?: {
    label: string;
    convexHost: string | null;
  };
  latest: ServiceSnapshotDto | null;
  previousLatest: ServiceSnapshotDto | null;
  stages: ShopStagesResponse | null;
  previousStages: ShopStagesResponse | null;
  transitions: StageTransitionSummaryDto | null;
  previousTransitions: StageTransitionSummaryDto | null;
  serviceSnapshots: ServiceSnapshotDto[];
  selectedShopId: string | null;
  selectedShopRecruitments: ShopRecruitmentsResponse | null;
  selectedShopRecruitmentsErrorMessage: string | null;
  selectedShopRecruitmentsLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  onCloseShopRecruitments: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  stagesErrorMessage: string | null;
  featureRequests: FeatureRequestRowDto[];
  featureRequestsErrorMessage: string | null;
  featureRequestsLoading: boolean;
  featureRequestsLoadingMore: boolean;
  featureRequestsHasMore: boolean;
  onLoadMoreFeatureRequests: () => void;
};

const VIEW_TABS: { value: DashboardView; label: string }[] = [
  { value: "summary", label: "全体サマリー" },
  { value: "beforeStart", label: "開始前" },
  { value: "activation", label: "立ち上げ" },
  { value: "retention", label: "運用中" },
  { value: "dormant", label: "休眠" },
  { value: "shops", label: "店舗一覧" },
  { value: "featureRequests", label: "要望" },
];

const CARD_TONES = {
  activation: {
    border: "blue.200",
    fg: "blue.600",
    ring: "0 0 0 3px rgba(37, 99, 235, 0.12)",
    soft: "blue.50",
  },
  dormant: {
    border: "purple.200",
    fg: "purple.600",
    ring: "0 0 0 3px rgba(124, 58, 237, 0.12)",
    soft: "purple.50",
  },
  launch: {
    border: "orange.200",
    fg: "orange.600",
    ring: "0 0 0 3px rgba(234, 88, 12, 0.12)",
    soft: "orange.50",
  },
  retained: {
    border: "green.200",
    fg: "green.600",
    ring: "0 0 0 3px rgba(22, 163, 74, 0.12)",
    soft: "green.50",
  },
} as const;

const STAGE_CHART_SERIES = [
  { color: "#2563eb", key: "beforeStart", label: "開始前" },
  { color: "#ea580c", key: "activeTrial", label: "立ち上げ" },
  { color: "#16a34a", key: "retained", label: "運用中" },
  { color: "#7c3aed", key: "dormant", label: "休眠" },
] as const;

function stageTotal(counts: ShopStageCounts | null) {
  if (!counts) return null;
  return counts.beforeStart + counts.activeTrial + counts.retained + counts.activeTrialDormant + counts.retainedDormant;
}

function dormantCount(counts: ShopStageCounts | null) {
  if (!counts) return null;
  return counts.activeTrialDormant + counts.retainedDormant;
}

function numberDelta(current: number | null | undefined, previous: number | null | undefined) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return current - previous;
}

function deltaColor(delta: number) {
  if (delta > 0) return "green.600";
  if (delta < 0) return "red.500";
  return "gray.500";
}

function formatDelta(delta: number) {
  return `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`;
}

function DeltaText({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined) return null;
  return (
    <Text as="span" color={deltaColor(delta)} fontSize="sm" fontWeight="bold" lineHeight="1">
      {formatDelta(delta)}
    </Text>
  );
}

function metricMovementCount(metric: StageTransitionMetricDto | null | undefined) {
  if (!metric) return "未取得";
  return `${formatNumber(metric.numerator)}店舗`;
}

function metricMovementDelta(
  metric: StageTransitionMetricDto | null | undefined,
  previousMetric: StageTransitionMetricDto | null | undefined,
) {
  return numberDelta(metric?.numerator, previousMetric?.numerator);
}

function serviceSummary(latest: ServiceSnapshotDto | null, previousLatest: ServiceSnapshotDto | null) {
  return [
    {
      delta: numberDelta(latest?.shopCount, previousLatest?.shopCount),
      label: "総店舗数",
      value: `${formatNumber(latest?.shopCount)}店舗`,
    },
    {
      delta: numberDelta(latest?.staffCount, previousLatest?.staffCount),
      label: "総スタッフ数",
      value: `${formatNumber(latest?.staffCount)}人`,
    },
  ];
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Alert.Root borderRadius="md" status="error">
      <Alert.Indicator />
      <Alert.Description>{message}</Alert.Description>
    </Alert.Root>
  );
}

function ViewTabs({ activeView, onChange }: { activeView: DashboardView; onChange: (view: DashboardView) => void }) {
  return (
    <Box borderBottom="1px solid" borderColor="gray.200" overflowX="auto">
      <HStack align="end" gap={0} minW="max-content" px={{ base: 4, md: 6 }}>
        {VIEW_TABS.map((tab) => {
          const isActive = tab.value === activeView;
          return (
            <Button
              key={tab.value}
              borderBottom="3px solid"
              borderBottomColor={isActive ? "blue.500" : "transparent"}
              borderRadius={0}
              color={isActive ? "blue.600" : "gray.600"}
              colorPalette="gray"
              fontWeight="bold"
              h="48px"
              minW="fit-content"
              onClick={() => onChange(tab.value)}
              px={{ base: 3, md: 4 }}
              variant="ghost"
            >
              {tab.label}
            </Button>
          );
        })}
      </HStack>
    </Box>
  );
}

type StageIconName = "flag" | "rocket" | "chart" | "sleep";

const STAGE_ICONS: Record<StageIconName, IconType> = {
  chart: LuChartColumnIncreasing,
  flag: LuFlag,
  rocket: LuRocket,
  sleep: LuMoonStar,
};

function StageIcon({ name }: { name: StageIconName }) {
  return <Icon aria-hidden as={STAGE_ICONS[name]} boxSize={{ base: 5, md: 7 }} strokeWidth={2} />;
}

function StageKpiCard({
  delta,
  icon,
  label,
  value,
  tone,
  selected,
  isLoading,
}: {
  delta: number | null | undefined;
  icon: StageIconName;
  label: string;
  value: number | null | undefined;
  tone: keyof typeof CARD_TONES;
  selected: boolean;
  isLoading: boolean;
}) {
  const colors = CARD_TONES[tone];
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor={selected ? colors.border : "gray.200"}
      borderRadius="md"
      boxShadow={selected ? colors.ring : "none"}
      minH={{ base: "124px", md: "136px" }}
      minW={0}
      p={{ base: 4, md: 5 }}
    >
      <Flex align="start" gap={{ base: 3, md: 4 }}>
        <Flex
          align="center"
          bg={colors.soft}
          borderRadius="full"
          color={colors.fg}
          flexShrink={0}
          fontSize={{ base: "lg", md: "2xl" }}
          fontWeight="bold"
          h={{ base: "40px", md: "56px" }}
          justify="center"
          w={{ base: "40px", md: "56px" }}
        >
          <StageIcon name={icon} />
        </Flex>
        <Box minW={0}>
          <Text color={colors.fg} fontSize={{ base: "md", md: "lg" }} fontWeight="bold" lineHeight="1.35">
            {label}
          </Text>
          {isLoading ? (
            <Skeleton h="44px" mt={4} w="112px" />
          ) : (
            <HStack align="baseline" gap={2} mt={4} wrap="wrap">
              <Text
                color="gray.950"
                fontSize={{ base: "4xl", md: "5xl" }}
                fontVariantNumeric="tabular-nums"
                fontWeight="bold"
                letterSpacing="0"
                lineHeight="0.9"
              >
                {formatNumber(value)}
              </Text>
              <Text color="gray.700" fontSize="md" fontWeight="bold">
                店舗
              </Text>
              <DeltaText delta={delta} />
            </HStack>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

function StageCards({
  activeView,
  counts,
  isLoading,
  previousCounts,
}: {
  activeView: DashboardView;
  counts: ShopStageCounts | null;
  isLoading: boolean;
  previousCounts: ShopStageCounts | null;
}) {
  const selected = {
    activation: activeView === "activation",
    beforeStart: activeView === "beforeStart",
    dormant: activeView === "dormant",
    retained: activeView === "retention",
  };
  return (
    <Grid gap={{ base: 3, xl: 5 }} templateColumns={{ base: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
      <StageKpiCard
        delta={numberDelta(counts?.beforeStart, previousCounts?.beforeStart)}
        icon="flag"
        isLoading={isLoading}
        label="開始前"
        selected={selected.beforeStart}
        tone="activation"
        value={counts?.beforeStart}
      />
      <StageKpiCard
        delta={numberDelta(counts?.activeTrial, previousCounts?.activeTrial)}
        icon="rocket"
        isLoading={isLoading}
        label="立ち上げ"
        selected={selected.activation}
        tone="launch"
        value={counts?.activeTrial}
      />
      <StageKpiCard
        delta={numberDelta(counts?.retained, previousCounts?.retained)}
        icon="chart"
        isLoading={isLoading}
        label="運用中"
        selected={selected.retained}
        tone="retained"
        value={counts?.retained}
      />
      <StageKpiCard
        delta={numberDelta(dormantCount(counts), dormantCount(previousCounts))}
        icon="sleep"
        isLoading={isLoading}
        label="休眠"
        selected={selected.dormant}
        tone="dormant"
        value={dormantCount(counts)}
      />
    </Grid>
  );
}

function FlowStage({
  children,
  tone,
  dashed = false,
}: {
  children: ReactNode;
  tone: keyof typeof CARD_TONES;
  dashed?: boolean;
}) {
  const colors = CARD_TONES[tone];
  return (
    <Flex
      align="center"
      bg={dashed ? "white" : colors.soft}
      border="1px solid"
      borderColor={dashed ? colors.border : "transparent"}
      borderStyle={dashed ? "dashed" : "solid"}
      borderRadius="md"
      color={colors.fg}
      fontSize="sm"
      fontWeight="bold"
      h="48px"
      justify="center"
      minW={0}
      px={2}
      textAlign="center"
      w="full"
    >
      {children}
    </Flex>
  );
}

function FlowArrow() {
  return (
    <Text color="gray.500" fontSize="2xl" fontWeight="bold" lineHeight="1">
      →
    </Text>
  );
}

function TransitionRate({
  label,
  metric,
  accent = "gray.900",
  previousMetric,
}: {
  label: string;
  metric: StageTransitionMetricDto | null | undefined;
  accent?: string;
  previousMetric?: StageTransitionMetricDto | null;
}) {
  return (
    <Box minW={0} textAlign="center">
      <HStack align="baseline" gap={1.5} justify="center">
        <Text
          color={accent}
          fontSize={{ base: "lg", md: "xl" }}
          fontVariantNumeric="tabular-nums"
          fontWeight="bold"
          letterSpacing="0"
          whiteSpace="nowrap"
        >
          {metricMovementCount(metric)}
        </Text>
        <DeltaText delta={metricMovementDelta(metric, previousMetric)} />
      </HStack>
      <Text
        color="gray.700"
        display={{ base: "block", lg: "none" }}
        fontSize="xs"
        fontWeight="bold"
        lineHeight="1.45"
        mt={1}
      >
        {label}
      </Text>
    </Box>
  );
}

function FlowConnector({
  label,
  metric,
  accent,
  previousMetric,
}: {
  label: string;
  metric: StageTransitionMetricDto | null | undefined;
  accent: string;
  previousMetric?: StageTransitionMetricDto | null;
}) {
  return (
    <Stack align="center" gap={3} minW={0} w="full">
      <FlowArrow />
      <TransitionRate accent={accent} label={label} metric={metric} previousMetric={previousMetric} />
    </Stack>
  );
}

function TransitionFlow({
  previousTransitions,
  transitions,
}: {
  previousTransitions: StageTransitionSummaryDto | null;
  transitions: StageTransitionSummaryDto | null;
}) {
  return (
    <Stack gap={6}>
      <Box display={{ base: "none", lg: "block" }} pb={1}>
        <Grid alignItems="start" gap={2} templateColumns="1fr 0.72fr 1.15fr 0.72fr 0.9fr 0.72fr 1.25fr 0.72fr 0.85fr">
          <FlowStage tone="activation">開始前</FlowStage>
          <FlowConnector
            accent="blue.600"
            label="開始前 → 立ち上げ率"
            metric={transitions?.beforeStartToActiveTrial}
            previousMetric={previousTransitions?.beforeStartToActiveTrial}
          />
          <FlowStage tone="launch">立ち上げ</FlowStage>
          <FlowConnector
            accent="orange.600"
            label="立ち上げ → 運用中率"
            metric={transitions?.activeTrialToRetained}
            previousMetric={previousTransitions?.activeTrialToRetained}
          />
          <FlowStage tone="retained">運用中</FlowStage>
          <FlowConnector
            accent="green.600"
            label="運用中 → 休眠率"
            metric={transitions?.retainedToDormant}
            previousMetric={previousTransitions?.retainedToDormant}
          />
          <FlowStage tone="dormant">休眠</FlowStage>
          <FlowConnector
            accent="purple.600"
            label="休眠 → 復帰率"
            metric={transitions?.dormantToRecovered}
            previousMetric={previousTransitions?.dormantToRecovered}
          />
          <FlowStage dashed tone="activation">
            復帰
          </FlowStage>
        </Grid>
      </Box>
      <Grid display={{ base: "grid", lg: "none" }} gap={3} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }}>
        <TransitionRate
          accent="blue.600"
          label="開始前 → 立ち上げ率"
          metric={transitions?.beforeStartToActiveTrial}
          previousMetric={previousTransitions?.beforeStartToActiveTrial}
        />
        <TransitionRate
          accent="orange.600"
          label="立ち上げ → 運用中率"
          metric={transitions?.activeTrialToRetained}
          previousMetric={previousTransitions?.activeTrialToRetained}
        />
        <TransitionRate
          accent="green.600"
          label="運用中 → 休眠率"
          metric={transitions?.retainedToDormant}
          previousMetric={previousTransitions?.retainedToDormant}
        />
        <TransitionRate
          accent="purple.600"
          label="休眠 → 復帰率"
          metric={transitions?.dormantToRecovered}
          previousMetric={previousTransitions?.dormantToRecovered}
        />
      </Grid>
    </Stack>
  );
}

function FocusPanel({
  activeView,
  latest,
  counts,
  previousCounts,
  previousLatest,
  previousTransitions,
  transitions,
}: {
  activeView: DashboardView;
  latest: ServiceSnapshotDto | null;
  counts: ShopStageCounts | null;
  previousCounts: ShopStageCounts | null;
  previousLatest: ServiceSnapshotDto | null;
  previousTransitions: StageTransitionSummaryDto | null;
  transitions: StageTransitionSummaryDto | null;
}) {
  const items =
    activeView === "beforeStart"
      ? [
          {
            delta: numberDelta(counts?.beforeStart, previousCounts?.beforeStart),
            label: "開始前",
            value: `${formatNumber(counts?.beforeStart)}店舗`,
          },
          {
            delta: metricMovementDelta(
              transitions?.beforeStartToActiveTrial,
              previousTransitions?.beforeStartToActiveTrial,
            ),
            label: "立ち上げへ移動",
            value: metricMovementCount(transitions?.beforeStartToActiveTrial),
          },
          {
            delta: numberDelta(latest?.shopCount, previousLatest?.shopCount),
            label: "総店舗数",
            value: `${formatNumber(latest?.shopCount)}店舗`,
          },
        ]
      : activeView === "activation"
        ? [
            {
              delta: numberDelta(counts?.activeTrial, previousCounts?.activeTrial),
              label: "立ち上げ",
              value: `${formatNumber(counts?.activeTrial)}店舗`,
            },
            {
              delta: metricMovementDelta(
                transitions?.beforeStartToActiveTrial,
                previousTransitions?.beforeStartToActiveTrial,
              ),
              label: "立ち上げへ移動",
              value: metricMovementCount(transitions?.beforeStartToActiveTrial),
            },
            {
              delta: metricMovementDelta(
                transitions?.activeTrialToRetained,
                previousTransitions?.activeTrialToRetained,
              ),
              label: "運用中へ移動",
              value: metricMovementCount(transitions?.activeTrialToRetained),
            },
          ]
        : activeView === "retention"
          ? [
              {
                delta: numberDelta(counts?.retained, previousCounts?.retained),
                label: "運用中",
                value: `${formatNumber(counts?.retained)}店舗`,
              },
              {
                delta: numberDelta(latest?.openRecruitmentCount, previousLatest?.openRecruitmentCount),
                label: "募集中",
                value: `${formatNumber(latest?.openRecruitmentCount)}件`,
              },
              {
                delta: metricMovementDelta(transitions?.retainedToDormant, previousTransitions?.retainedToDormant),
                label: "休眠へ移動",
                value: metricMovementCount(transitions?.retainedToDormant),
              },
            ]
          : activeView === "dormant"
            ? [
                {
                  delta: numberDelta(dormantCount(counts), dormantCount(previousCounts)),
                  label: "休眠",
                  value: `${formatNumber(dormantCount(counts))}店舗`,
                },
                {
                  delta: metricMovementDelta(transitions?.dormantToRecovered, previousTransitions?.dormantToRecovered),
                  label: "運用中へ復帰",
                  value: metricMovementCount(transitions?.dormantToRecovered),
                },
                {
                  delta: metricMovementDelta(transitions?.retainedToDormant, previousTransitions?.retainedToDormant),
                  label: "休眠へ移動",
                  value: metricMovementCount(transitions?.retainedToDormant),
                },
                {
                  label: "全体比",
                  value: formatPercent(
                    stageTotal(counts) ? (dormantCount(counts) ?? 0) / (stageTotal(counts) ?? 1) : null,
                  ),
                },
              ]
            : serviceSummary(latest, previousLatest);

  return (
    <Grid
      gap={3}
      templateColumns={{
        base: "repeat(2, minmax(0, 1fr))",
        lg: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <Box key={item.label} bg="gray.50" borderRadius="md" minH="72px" p={3}>
          <Text color="gray.500" fontSize="xs" fontWeight="bold">
            {item.label}
          </Text>
          <HStack align="baseline" gap={2} mt={1}>
            <Text color="gray.950" fontSize={{ base: "lg", md: "2xl" }} fontWeight="bold" lineHeight="1.2">
              {item.value}
            </Text>
            <DeltaText delta={item.delta} />
          </HStack>
        </Box>
      ))}
    </Grid>
  );
}

function StageTransitionPanel({
  activeView,
  latest,
  counts,
  previousCounts,
  previousLatest,
  previousTransitions,
  transitions,
  isLoading,
}: {
  activeView: DashboardView;
  latest: ServiceSnapshotDto | null;
  counts: ShopStageCounts | null;
  previousCounts: ShopStageCounts | null;
  previousLatest: ServiceSnapshotDto | null;
  previousTransitions: StageTransitionSummaryDto | null;
  transitions: StageTransitionSummaryDto | null;
  isLoading: boolean;
}) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 6 }}>
      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={2}
        justify="space-between"
      >
        <Box>
          <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
            ステージ遷移率（期間内の推移）
          </Text>
          <Text color="gray.500" fontSize="sm" mt={1}>
            店舗がどのステージへ進んだかを、期間内の移動率で見ます
          </Text>
        </Box>
      </Flex>
      <Box mt={5}>
        {isLoading ? (
          <Skeleton h={{ base: "220px", lg: "168px" }} w="full" />
        ) : (
          <TransitionFlow previousTransitions={previousTransitions} transitions={transitions} />
        )}
      </Box>
      <Box borderTop="1px solid" borderColor="gray.100" mt={6} pt={4}>
        <FocusPanel
          activeView={activeView}
          counts={counts}
          latest={latest}
          previousCounts={previousCounts}
          previousLatest={previousLatest}
          previousTransitions={previousTransitions}
          transitions={transitions}
        />
      </Box>
    </Box>
  );
}

function formatChartDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function stageTrendData(snapshots: ServiceSnapshotDto[]) {
  return snapshots.flatMap((snapshot) => {
    const counts = snapshot.shopStageCounts;
    if (!counts) return [];
    return [
      {
        activeTrial: counts.activeTrial,
        beforeStart: counts.beforeStart,
        date: formatChartDate(snapshot.date),
        dormant: counts.activeTrialDormant + counts.retainedDormant,
        retained: counts.retained,
      },
    ];
  });
}

function StageTrendPanel({ isLoading, snapshots }: { isLoading: boolean; snapshots: ServiceSnapshotDto[] }) {
  const data = stageTrendData(snapshots);
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 6 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        ステージ別店舗数の推移（日次）
      </Text>
      <Box h={{ base: "260px", md: "340px" }} mt={5}>
        {isLoading ? (
          <Skeleton h="full" w="full" />
        ) : data.length === 0 ? (
          <Flex align="center" bg="gray.50" borderRadius="md" h="full" justify="center">
            <Text color="gray.500" fontSize="sm">
              推移データがありません
            </Text>
          </Flex>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={data} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
              <XAxis axisLine={{ stroke: "#d1d5db" }} dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value, name) => [`${formatNumber(Number(value))}店舗`, name]}
              />
              <Legend
                align="center"
                height={32}
                iconType="circle"
                verticalAlign="top"
                wrapperStyle={{ fontSize: 12 }}
              />
              {STAGE_CHART_SERIES.map((series) => (
                <Line
                  key={series.key}
                  activeDot={{ r: 5 }}
                  dataKey={series.key}
                  dot={{ r: 3 }}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={3}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

export const DashboardTop = ({
  activeView,
  onActiveViewChange,
  env,
  latest,
  previousLatest,
  previousStages,
  previousTransitions,
  serviceSnapshots,
  selectedShopId,
  selectedShopRecruitments,
  selectedShopRecruitmentsErrorMessage,
  selectedShopRecruitmentsLoading,
  onOpenShopRecruitments,
  onCloseShopRecruitments,
  stages,
  transitions,
  isLoading,
  errorMessage,
  stagesErrorMessage,
  featureRequests,
  featureRequestsErrorMessage,
  featureRequestsLoading,
  featureRequestsLoadingMore,
  featureRequestsHasMore,
  onLoadMoreFeatureRequests,
}: DashboardTopProps) => {
  const counts = stages?.stageCounts ?? latest?.shopStageCounts ?? null;
  const previousCounts = previousStages?.stageCounts ?? previousLatest?.shopStageCounts ?? null;
  const latestComputedAt = stages?.rows[0]?.computedAt ?? latest?.computedAt ?? null;
  const selectedShop = stages?.rows.find((row) => row.shopId === selectedShopId) ?? null;

  return (
    <Box bg="gray.50" minH="100vh" py={{ base: 4, md: 6 }}>
      <Container maxW="1500px" px={{ base: 3, md: 6 }}>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
          <Flex
            align={{ base: "stretch", lg: "center" }}
            borderBottom="1px solid"
            borderColor="gray.100"
            direction={{ base: "column", lg: "row" }}
            gap={{ base: 4, lg: 6 }}
            justify="space-between"
            p={{ base: 4, md: 6 }}
          >
            <Box minW={0}>
              <HStack gap={2} wrap="wrap">
                <Text color="gray.950" fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
                  シフトリ
                </Text>
                <Text color="gray.300" fontWeight="bold">
                  |
                </Text>
                <Text color="gray.800" fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
                  運営ダッシュボード
                </Text>
              </HStack>
              <HStack gap={2} mt={3} wrap="wrap">
                <Badge colorPalette={env?.label === "production" ? "green" : "orange"} variant="subtle">
                  {env?.label ?? "unknown"}
                </Badge>
                {env?.convexHost ? (
                  <Badge maxW="full" overflow="hidden" textOverflow="ellipsis" variant="surface" whiteSpace="nowrap">
                    {env.convexHost}
                  </Badge>
                ) : null}
                {latestComputedAt ? <Badge variant="surface">最終更新 {formatDateTime(latestComputedAt)}</Badge> : null}
              </HStack>
            </Box>
          </Flex>

          <ViewTabs activeView={activeView} onChange={onActiveViewChange} />

          <Stack gap={{ base: 5, md: 6 }} p={{ base: 4, md: 6 }}>
            {activeView !== "featureRequests" && errorMessage ? <ErrorPanel message={errorMessage} /> : null}
            {activeView !== "featureRequests" && stagesErrorMessage ? (
              <ErrorPanel message={stagesErrorMessage} />
            ) : null}

            {activeView === "beforeStart" ||
            activeView === "activation" ||
            activeView === "retention" ||
            activeView === "dormant" ||
            activeView === "shops" ||
            activeView === "featureRequests" ? null : (
              <Box>
                <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mb={4}>
                  ステージ別店舗数
                </Text>
                <StageCards
                  activeView={activeView}
                  counts={counts}
                  isLoading={isLoading}
                  previousCounts={previousCounts}
                />
              </Box>
            )}

            {activeView === "beforeStart" ? (
              <BeforeStartTabContent
                isLoading={isLoading}
                onOpenShopRecruitments={onOpenShopRecruitments}
                previousStages={previousStages}
                stages={stages}
              />
            ) : activeView === "activation" ? (
              <ActivationTabContent
                isLoading={isLoading}
                onOpenShopRecruitments={onOpenShopRecruitments}
                previousStages={previousStages}
                stages={stages}
              />
            ) : activeView === "retention" ? (
              <RetainedTabContent
                isLoading={isLoading}
                onOpenShopRecruitments={onOpenShopRecruitments}
                previousStages={previousStages}
                stages={stages}
              />
            ) : activeView === "dormant" ? (
              <DormantTabContent
                isLoading={isLoading}
                onOpenShopRecruitments={onOpenShopRecruitments}
                previousStages={previousStages}
                stages={stages}
              />
            ) : activeView === "shops" ? (
              <ShopListTabContent
                isLoading={isLoading}
                onOpenShopRecruitments={onOpenShopRecruitments}
                stages={stages}
              />
            ) : activeView === "featureRequests" ? (
              <FeatureRequestsTabContent
                errorMessage={featureRequestsErrorMessage}
                hasMore={featureRequestsHasMore}
                isLoading={featureRequestsLoading}
                isLoadingMore={featureRequestsLoadingMore}
                onLoadMore={onLoadMoreFeatureRequests}
                rows={featureRequests}
              />
            ) : (
              <>
                <StageTrendPanel isLoading={isLoading} snapshots={serviceSnapshots} />

                <StageTransitionPanel
                  activeView={activeView}
                  counts={counts}
                  isLoading={isLoading}
                  latest={latest}
                  previousCounts={previousCounts}
                  previousLatest={previousLatest}
                  previousTransitions={previousTransitions}
                  transitions={transitions}
                />
              </>
            )}
          </Stack>

          <ShopRecruitmentsDialog
            data={selectedShopRecruitments}
            errorMessage={selectedShopRecruitmentsErrorMessage}
            isLoading={selectedShopRecruitmentsLoading}
            isOpen={selectedShopId !== null}
            onClose={onCloseShopRecruitments}
            shopName={selectedShopRecruitments?.shopName ?? selectedShop?.shopName ?? "店舗"}
          />
        </Box>
      </Container>
    </Box>
  );
};
