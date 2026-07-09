import { Badge, Box, Flex, Grid, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import {
  BEFORE_START_DROPOFF_STEPS,
  type BeforeStartTutorialStep,
  getBeforeStartAverageElapsedDays,
  getBeforeStartDropoffStepCounts,
  getBeforeStartRows,
  getShopCreatedAt,
  resolveBeforeStartTutorialStep,
} from "@/domains/analytics/beforeStartOnboarding";
import { formatNumber } from "@/domains/analytics/format";
import { compareSortValues, type SortState, sortRowsBy } from "@/domains/analytics/tableSort";
import { SortableColumnHeader } from "./SortableColumnHeader";

type BeforeStartSortKey = "shopName" | "registeredAt" | "step";

const INITIAL_BEFORE_START_SORT: SortState<BeforeStartSortKey> = {
  direction: "desc",
  key: "registeredAt",
};

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

function beforeStartSortValue(row: ShopStageRowDto, key: BeforeStartSortKey) {
  switch (key) {
    case "shopName":
      return row.shopName;
    case "registeredAt":
      return getShopCreatedAt(row);
    case "step":
      return resolveBeforeStartTutorialStep(row).index;
  }
}

function sortBeforeStartRows(rows: ShopStageRowDto[], sort: SortState<BeforeStartSortKey>) {
  return sortRowsBy(rows, sort, beforeStartSortValue, (a, b) =>
    compareSortValues(getShopCreatedAt(a), getShopCreatedAt(b), "desc"),
  );
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
  const counts = getBeforeStartDropoffStepCounts(rows);
  const previousCountsByStep = new Map(getBeforeStartDropoffStepCounts(previousRows).map((item) => [item.index, item]));
  const maxCount = Math.max(...counts.map((item) => item.count), 1);
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        ドロップアウト起点別の店舗数
      </Text>
      <Stack gap={3.5} mt={5}>
        {isLoading
          ? BEFORE_START_DROPOFF_STEPS.map((step) => <Skeleton h="24px" key={step.index} w="full" />)
          : counts.map((item) => (
              <Grid
                alignItems="center"
                columnGap={3}
                gridTemplateAreas={{
                  base: `"label value" "bar delta"`,
                  md: `"label bar value delta"`,
                }}
                key={item.index}
                rowGap={{ base: 2, md: 0 }}
                templateColumns={{
                  base: "minmax(0, 1fr) max-content",
                  md: "132px minmax(0, 1fr) max-content max-content",
                }}
              >
                <Text color="gray.700" fontSize="sm" fontWeight="bold" gridArea="label" minW={0} whiteSpace="nowrap">
                  {item.displayIndex}. {item.shortLabel}
                </Text>
                <Box bg="gray.100" borderRadius="full" gridArea="bar" h="12px" minW={0} overflow="hidden">
                  <Box
                    bg="blue.500"
                    borderRadius="full"
                    h="full"
                    w={`${Math.max(6, (item.count / maxCount) * 100)}%`}
                  />
                </Box>
                <Text
                  color="gray.700"
                  fontSize="sm"
                  fontVariantNumeric="tabular-nums"
                  fontWeight="bold"
                  gridArea="value"
                  textAlign="right"
                  whiteSpace="nowrap"
                >
                  {formatNumber(item.count)}（{formatFixedNumber(item.percentage * 100, 1)}%）
                </Text>
                <Text
                  color={deltaColor(item.percentage - (previousCountsByStep.get(item.index)?.percentage ?? 0))}
                  fontSize="sm"
                  fontVariantNumeric="tabular-nums"
                  fontWeight="bold"
                  gridArea="delta"
                  textAlign="right"
                  whiteSpace="nowrap"
                >
                  {formatPercentDelta(item.percentage - (previousCountsByStep.get(item.index)?.percentage ?? 0))}
                </Text>
              </Grid>
            ))}
      </Stack>
    </Box>
  );
}

function BeforeStartTable({
  isLoading,
  onOpenShopRecruitments,
  rows,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  rows: ShopStageRowDto[];
}) {
  const [sort, setSort] = useState<SortState<BeforeStartSortKey>>(INITIAL_BEFORE_START_SORT);
  const sortedRows = sortBeforeStartRows(rows, sort);

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
                <SortableColumnHeader
                  defaultDirection="asc"
                  label="店舗名"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="shopName"
                />
                <SortableColumnHeader label="登録日" onSortChange={setSort} sort={sort} sortKey="registeredAt" />
                <SortableColumnHeader label="到達ステップ" onSortChange={setSort} sort={sort} sortKey="step" />
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
                sortedRows.map((row) => {
                  const step = resolveBeforeStartTutorialStep(row);
                  return (
                    <Table.Row
                      key={row.shopId}
                      _hover={{ bg: "gray.50" }}
                      cursor="pointer"
                      onClick={() => onOpenShopRecruitments(row.shopId)}
                    >
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
  onOpenShopRecruitments,
  previousStages,
  stages,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
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
          <Grid gap={4} templateColumns={{ base: "repeat(2, minmax(0, 1fr))", lg: "repeat(2, 1fr)" }}>
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
      <BeforeStartTable isLoading={isLoading} onOpenShopRecruitments={onOpenShopRecruitments} rows={rows} />
    </Stack>
  );
}
