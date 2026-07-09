import { Box, Button, Flex, Grid, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import {
  getAverageDaysSinceLastShift,
  getAverageLastSubmissionRate,
  getDaysSinceLastShiftCreated,
  getDormantDays,
  getDormantRows,
  getLastSubmissionRate,
  getShopLineLinkedRate,
} from "@/domains/analytics/dormantProgress";
import { formatNumber, formatPercent } from "@/domains/analytics/format";
import { compareSortValues, finiteNumber, type SortState, sortRowsBy } from "@/domains/analytics/tableSort";
import { SortableColumnHeader } from "./SortableColumnHeader";

type DormantSortKey =
  | "shopName"
  | "staffCount"
  | "dormantDays"
  | "recruitmentCount"
  | "lastShiftPeriod"
  | "lastSubmissionRate"
  | "lineLinkedRate"
  | "daysSinceLastShiftCreated";

const INITIAL_DORMANT_SORT: SortState<DormantSortKey> = {
  direction: "desc",
  key: "dormantDays",
};

function numberDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function deltaColor(delta: number, goodDirection: "up" | "down" = "up") {
  if (delta === 0) return "gray.500";
  const isGood = goodDirection === "up" ? delta > 0 : delta < 0;
  return isGood ? "green.600" : "red.500";
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

function formatPercentNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return formatFixedNumber(value * 100, 1);
}

function formatWithUnit(value: number | null | undefined, unit: string, maximumFractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${formatFixedNumber(value, maximumFractionDigits)}${unit}`;
}

function formatDateString(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return "-";
  return `${formatDateString(start)} 〜 ${formatDateString(end)}`;
}

function dateStringToSortableDay(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function dormantSortValue(row: ShopStageRowDto, key: DormantSortKey) {
  switch (key) {
    case "shopName":
      return row.shopName;
    case "staffCount":
      return finiteNumber(row.staffCount);
    case "dormantDays":
      return getDormantDays(row);
    case "recruitmentCount":
      return finiteNumber(row.recruitmentCount);
    case "lastShiftPeriod":
      return dateStringToSortableDay(row.lastShiftPeriodEnd) ?? dateStringToSortableDay(row.lastShiftPeriodStart);
    case "lastSubmissionRate":
      return getLastSubmissionRate(row);
    case "lineLinkedRate":
      return getShopLineLinkedRate(row);
    case "daysSinceLastShiftCreated":
      return getDaysSinceLastShiftCreated(row);
  }
}

function sortDormantRows(rows: ShopStageRowDto[], sort: SortState<DormantSortKey>) {
  return sortRowsBy(rows, sort, dormantSortValue, (a, b) =>
    compareSortValues(finiteNumber(a.shopCreatedAt), finiteNumber(b.shopCreatedAt), "desc"),
  );
}

function MetricCard({
  delta,
  deltaKind = "number",
  deltaUnit = "",
  goodDirection = "up",
  isLoading,
  label,
  unit,
  value,
}: {
  delta: number | null;
  deltaKind?: "number" | "point";
  deltaUnit?: string;
  goodDirection?: "up" | "down";
  isLoading: boolean;
  label: string;
  unit?: string;
  value: string;
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
              {value}
            </Text>
            {unit ? (
              <Text color="gray.700" fontSize="md" fontWeight="bold">
                {unit}
              </Text>
            ) : null}
          </HStack>
          {delta !== null ? (
            <Text color={deltaColor(delta, goodDirection)} fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mt={3}>
              {deltaKind === "point" ? `${formatSigned(delta * 100, 1)}pt` : `${formatSigned(delta, 1)}${deltaUnit}`}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  );
}

function DormantTable({
  isLoading,
  onOpenShopRecruitments,
  rows,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  rows: ShopStageRowDto[];
}) {
  const [sort, setSort] = useState<SortState<DormantSortKey>>(INITIAL_DORMANT_SORT);
  const sortedRows = sortDormantRows(rows, sort);

  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        店舗一覧（休眠の店舗）
      </Text>
      <Box mt={4} overflowX="auto">
        {isLoading ? (
          <Stack gap={2}>
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
          </Stack>
        ) : (
          <Table.Root minW="1120px" size="sm" variant="outline">
            <Table.Header>
              <Table.Row bg="gray.50">
                <SortableColumnHeader
                  defaultDirection="asc"
                  label="店舗名"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="shopName"
                />
                <SortableColumnHeader
                  label="スタッフ数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="staffCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="休眠日数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="dormantDays"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="総シフト数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="recruitmentCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="最後のシフト期間"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="lastShiftPeriod"
                />
                <SortableColumnHeader
                  label="最後の提出率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="lastSubmissionRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="LINE連携率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="lineLinkedRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="最終作成から"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="daysSinceLastShiftCreated"
                  textAlign="right"
                />
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  詳細
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={9}>
                    <Flex align="center" h="80px" justify="center">
                      <Text color="gray.500" fontSize="sm">
                        休眠の店舗はありません
                      </Text>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ) : (
                sortedRows.map((row) => (
                  <Table.Row key={row.shopId}>
                    <Table.Cell color="gray.950" fontWeight="bold">
                      {row.shopName}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatNumber(row.staffCount)}人
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(getDormantDays(row), "日")}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(row.recruitmentCount, "件")}
                    </Table.Cell>
                    <Table.Cell color="gray.700">
                      {formatPeriod(row.lastShiftPeriodStart, row.lastShiftPeriodEnd)}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatPercent(getLastSubmissionRate(row))}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatPercent(getShopLineLinkedRate(row))}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(getDaysSinceLastShiftCreated(row), "日")}
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      <Button
                        colorPalette="blue"
                        onClick={() => onOpenShopRecruitments(row.shopId)}
                        size="xs"
                        variant="outline"
                      >
                        詳細
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        )}
      </Box>
    </Box>
  );
}

export function DormantTabContent({
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
  const rows = getDormantRows(stages);
  const previousRows = getDormantRows(previousStages);
  const daysSinceLastShift = getAverageDaysSinceLastShift(rows);
  const previousDaysSinceLastShift = getAverageDaysSinceLastShift(previousRows);
  const lastSubmissionRate = getAverageLastSubmissionRate(rows);
  const previousLastSubmissionRate = getAverageLastSubmissionRate(previousRows);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Box>
        <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mb={4}>
          休眠のサマリー
        </Text>
        <Grid gap={{ base: 3, xl: 4 }} templateColumns={{ base: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }}>
          <MetricCard
            delta={numberDelta(rows.length, previousRows.length)}
            deltaUnit="店舗"
            goodDirection="down"
            isLoading={isLoading}
            label="休眠・離脱疑い店舗数"
            unit="店舗"
            value={formatNumber(rows.length)}
          />
          <MetricCard
            delta={numberDelta(daysSinceLastShift, previousDaysSinceLastShift)}
            deltaUnit="日"
            goodDirection="down"
            isLoading={isLoading}
            label="最終シフトからの日数"
            unit={daysSinceLastShift === null ? undefined : "日"}
            value={formatFixedNumber(daysSinceLastShift, 1)}
          />
          <MetricCard
            delta={numberDelta(lastSubmissionRate, previousLastSubmissionRate)}
            deltaKind="point"
            isLoading={isLoading}
            label="最終提出率"
            unit={lastSubmissionRate === null ? undefined : "%"}
            value={formatPercentNumber(lastSubmissionRate)}
          />
        </Grid>
      </Box>
      <DormantTable isLoading={isLoading} onOpenShopRecruitments={onOpenShopRecruitments} rows={rows} />
    </Stack>
  );
}
