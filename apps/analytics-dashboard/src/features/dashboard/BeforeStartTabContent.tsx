import { Badge, Box, Flex, Grid, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import {
  BEFORE_START_DROPOFF_STEPS,
  type BeforeStartTutorialStep,
  getBeforeStartAverageElapsedDays,
  getBeforeStartRows,
  getShopCreatedAt,
  resolveBeforeStartTutorialStep,
} from "@/domains/analytics/beforeStartOnboarding";
import { formatNumber } from "@/domains/analytics/format";

function numberDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function deltaColor(delta: number) {
  if (delta > 0) return "green.600";
  if (delta < 0) return "red.500";
  return "gray.500";
}

function formatSigned(value: number, maximumFractionDigits = 0) {
  if (!Number.isFinite(value)) return "-";
  const formatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits });
  return `${value >= 0 ? "+" : ""}${formatter.format(value)}`;
}

function formatFixedNumber(value: number | null, maximumFractionDigits = 0) {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(value);
}

function formatDate(value: number | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(value));
}

function StepLabel({ step }: { step: BeforeStartTutorialStep }) {
  return (
    <HStack gap={2}>
      <Badge colorPalette="blue" variant="subtle">
        {step.index}
      </Badge>
      <Text color="gray.800" fontWeight="bold">
        {step.shortLabel}
      </Text>
    </HStack>
  );
}

function ComparisonText({
  delta,
  suffix = "",
  maximumFractionDigits = 0,
}: {
  delta: number | null;
  suffix?: string;
  maximumFractionDigits?: number;
}) {
  if (delta === null) return null;
  return (
    <HStack align="baseline" gap={2} mt={3}>
      <Text color={deltaColor(delta)} fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        {formatSigned(delta, maximumFractionDigits)}
        {suffix}
      </Text>
    </HStack>
  );
}

function BeforeStartSummaryCard({
  delta,
  isLoading,
  label,
  unit,
  value,
  valueFractionDigits = 0,
  deltaFractionDigits = 0,
}: {
  delta: number | null;
  isLoading: boolean;
  label: string;
  unit: string;
  value: number | null;
  valueFractionDigits?: number;
  deltaFractionDigits?: number;
}) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minH="150px" p={{ base: 4, md: 5 }}>
      <Text color="gray.600" fontSize="sm" fontWeight="bold">
        {label}
      </Text>
      {isLoading ? (
        <Skeleton h="72px" mt={5} w="70%" />
      ) : (
        <>
          <HStack align="baseline" gap={2} mt={4}>
            <Text
              color="gray.950"
              fontSize={{ base: "4xl", md: "5xl" }}
              fontVariantNumeric="tabular-nums"
              fontWeight="bold"
              letterSpacing="0"
              lineHeight="0.95"
            >
              {formatFixedNumber(value, valueFractionDigits)}
            </Text>
            <Text color="gray.700" fontSize="md" fontWeight="bold">
              {unit}
            </Text>
          </HStack>
          <ComparisonText delta={delta} maximumFractionDigits={deltaFractionDigits} suffix={unit} />
        </>
      )}
    </Box>
  );
}

function tutorialStepCounts(rows: ShopStageRowDto[]) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const step = resolveBeforeStartTutorialStep(row);
    counts.set(step.index, (counts.get(step.index) ?? 0) + 1);
  }
  return BEFORE_START_DROPOFF_STEPS.map((step, index) => {
    const count = counts.get(step.index) ?? 0;
    return {
      ...step,
      count,
      displayIndex: index + 1,
      percentage: rows.length === 0 ? 0 : count / rows.length,
    };
  });
}

function formatPercentDelta(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${formatFixedNumber(value * 100, 1)}%`;
}

function DropoffPanel({
  isLoading,
  previousRows,
  rows,
}: {
  isLoading: boolean;
  previousRows: ShopStageRowDto[];
  rows: ShopStageRowDto[];
}) {
  const counts = tutorialStepCounts(rows);
  const previousCountsByStep = new Map(tutorialStepCounts(previousRows).map((item) => [item.index, item]));
  const maxCount = Math.max(...counts.map((item) => item.count), 1);
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        ドロップアウト起点別の店舗数
      </Text>
      <Stack gap={3.5} mt={5}>
        {isLoading ? (
          <>
            <Skeleton h="24px" w="full" />
            <Skeleton h="24px" w="full" />
            <Skeleton h="24px" w="full" />
            <Skeleton h="24px" w="full" />
          </>
        ) : (
          counts.map((item) => (
            <Grid
              alignItems="center"
              gap={3}
              key={item.index}
              templateColumns={{
                base: "104px minmax(0, 1fr) 78px 64px",
                md: "132px minmax(0, 1fr) 88px 72px",
              }}
            >
              <Text color="gray.700" fontSize="sm" fontWeight="bold">
                {item.displayIndex}. {item.shortLabel}
              </Text>
              <Box bg="gray.100" borderRadius="full" h="12px" overflow="hidden">
                <Box bg="blue.500" borderRadius="full" h="full" w={`${Math.max(6, (item.count / maxCount) * 100)}%`} />
              </Box>
              <Text color="gray.700" fontSize="sm" fontWeight="bold" textAlign="right">
                {formatNumber(item.count)}（{formatFixedNumber(item.percentage * 100, 1)}%）
              </Text>
              <Text
                color={deltaColor(item.percentage - (previousCountsByStep.get(item.index)?.percentage ?? 0))}
                fontSize="sm"
                fontWeight="bold"
                textAlign="right"
              >
                {formatPercentDelta(item.percentage - (previousCountsByStep.get(item.index)?.percentage ?? 0))}
              </Text>
            </Grid>
          ))
        )}
      </Stack>
    </Box>
  );
}

function BeforeStartTable({ isLoading, rows }: { isLoading: boolean; rows: ShopStageRowDto[] }) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        店舗一覧（開始前の店舗）
      </Text>
      <Box mt={4} overflowX="auto">
        {isLoading ? (
          <Stack gap={2}>
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
          </Stack>
        ) : (
          <Table.Root minW="520px" size="sm" variant="outline">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  店舗名
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  登録日
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  到達ステップ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={3}>
                    <Flex align="center" h="80px" justify="center">
                      <Text color="gray.500" fontSize="sm">
                        開始前の店舗はありません
                      </Text>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ) : (
                rows.map((row) => {
                  const step = resolveBeforeStartTutorialStep(row);
                  return (
                    <Table.Row key={row.shopId}>
                      <Table.Cell color="gray.950" fontWeight="bold">
                        {row.shopName}
                      </Table.Cell>
                      <Table.Cell color="gray.700">{formatDate(getShopCreatedAt(row))}</Table.Cell>
                      <Table.Cell>
                        <StepLabel step={step} />
                      </Table.Cell>
                    </Table.Row>
                  );
                })
              )}
            </Table.Body>
          </Table.Root>
        )}
      </Box>
    </Box>
  );
}

export function BeforeStartTabContent({
  isLoading,
  previousStages,
  stages,
}: {
  isLoading: boolean;
  previousStages: ShopStagesResponse | null;
  stages: ShopStagesResponse | null;
}) {
  const rows = getBeforeStartRows(stages);
  const previousRows = getBeforeStartRows(previousStages);
  const currentAverageDays = getBeforeStartAverageElapsedDays(rows);
  const previousAverageDays = getBeforeStartAverageElapsedDays(previousRows);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Box>
        <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mb={4}>
          開始前の店舗一覧と状況
        </Text>
        <Grid gap={{ base: 4, lg: 5 }} templateColumns={{ base: "1fr", lg: "0.95fr 1.05fr" }}>
          <Grid gap={4} templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(2, 1fr)" }}>
            <BeforeStartSummaryCard
              delta={numberDelta(rows.length, previousRows.length)}
              isLoading={isLoading}
              label="開始前の店舗数"
              unit="店舗"
              value={rows.length}
            />
            <BeforeStartSummaryCard
              delta={numberDelta(currentAverageDays, previousAverageDays)}
              deltaFractionDigits={1}
              isLoading={isLoading}
              label="平均経過日数"
              unit="日"
              value={currentAverageDays}
              valueFractionDigits={1}
            />
          </Grid>
          <DropoffPanel isLoading={isLoading} previousRows={previousRows} rows={rows} />
        </Grid>
      </Box>
      <BeforeStartTable isLoading={isLoading} rows={rows} />
    </Stack>
  );
}
