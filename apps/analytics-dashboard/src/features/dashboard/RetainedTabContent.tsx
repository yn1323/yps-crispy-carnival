import { Box, Button, Flex, Grid, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import { formatNumber, formatPercent } from "@/domains/analytics/format";
import {
  getAverageDeadlineToConfirmationDays,
  getAverageMissingSubmissionRate,
  getAverageStaffCount,
  getLineLinkedRate,
  getMissingSubmissionRate,
  getNextShiftMissingCount,
  getReminderSentStaffRate,
  getRetainedRows,
  getShopLineLinkedRate,
} from "@/domains/analytics/retainedProgress";
import { compareSortValues, finiteNumber, type SortState, sortRowsBy } from "@/domains/analytics/tableSort";
import { SortableColumnHeader } from "./SortableColumnHeader";

type RetainedSortKey =
  | "shopName"
  | "staffCount"
  | "lineLinkedRate"
  | "recruitmentCount"
  | "openRecruitmentCount"
  | "averageRecruitmentOpenDays"
  | "reminderSentStaffRate"
  | "missingSubmissionRate"
  | "averageDeadlineToConfirmationDays"
  | "lastRecruitmentConfirmedAt";

const INITIAL_RETAINED_SORT: SortState<RetainedSortKey> = {
  direction: "desc",
  key: "lastRecruitmentConfirmedAt",
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

function formatDate(value: number | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(value));
}

function formatWithUnit(value: number | null | undefined, unit: string, maximumFractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${formatFixedNumber(value, maximumFractionDigits)}${unit}`;
}

function retainedSortValue(row: ShopStageRowDto, key: RetainedSortKey) {
  switch (key) {
    case "shopName":
      return row.shopName;
    case "staffCount":
      return finiteNumber(row.staffCount);
    case "lineLinkedRate":
      return getShopLineLinkedRate(row);
    case "recruitmentCount":
      return finiteNumber(row.recruitmentCount);
    case "openRecruitmentCount":
      return finiteNumber(row.openRecruitmentCount);
    case "averageRecruitmentOpenDays":
      return finiteNumber(row.averageRecruitmentOpenDays);
    case "reminderSentStaffRate":
      return finiteNumber(row.reminderSentStaffRate);
    case "missingSubmissionRate":
      return getMissingSubmissionRate(row);
    case "averageDeadlineToConfirmationDays":
      return finiteNumber(row.averageDeadlineToConfirmationDays);
    case "lastRecruitmentConfirmedAt":
      return finiteNumber(row.lastRecruitmentConfirmedAt);
  }
}

function sortRetainedRows(rows: ShopStageRowDto[], sort: SortState<RetainedSortKey>) {
  return sortRowsBy(rows, sort, retainedSortValue, (a, b) =>
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

function RetainedTable({
  isLoading,
  onOpenShopRecruitments,
  rows,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  rows: ShopStageRowDto[];
}) {
  const [sort, setSort] = useState<SortState<RetainedSortKey>>(INITIAL_RETAINED_SORT);
  const sortedRows = sortRetainedRows(rows, sort);

  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        店舗一覧（運用中の店舗）
      </Text>
      <Box mt={4} overflowX="auto">
        {isLoading ? (
          <Stack gap={2}>
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
          </Stack>
        ) : (
          <Table.Root minW="1160px" size="sm" variant="outline">
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
                  label="LINE連携率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="lineLinkedRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="これまでのシフト数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="recruitmentCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="募集中のシフト数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="openRecruitmentCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="平均募集期間"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="averageRecruitmentOpenDays"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="催促送信スタッフ率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="reminderSentStaffRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="確定シフト未提出率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="missingSubmissionRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="締切→確定"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="averageDeadlineToConfirmationDays"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="最終確定日"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="lastRecruitmentConfirmedAt"
                />
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  詳細
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={11}>
                    <Flex align="center" h="80px" justify="center">
                      <Text color="gray.500" fontSize="sm">
                        運用中の店舗はありません
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
                      {formatPercent(getShopLineLinkedRate(row))}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(row.recruitmentCount, "件")}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(row.openRecruitmentCount, "件")}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(row.averageRecruitmentOpenDays, "日", 1)}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatPercent(row.reminderSentStaffRate)}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatPercent(getMissingSubmissionRate(row))}
                    </Table.Cell>
                    <Table.Cell color="gray.700" textAlign="right">
                      {formatWithUnit(row.averageDeadlineToConfirmationDays, "日", 1)}
                    </Table.Cell>
                    <Table.Cell color="gray.700">{formatDate(row.lastRecruitmentConfirmedAt)}</Table.Cell>
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

export function RetainedTabContent({
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
  const rows = getRetainedRows(stages);
  const previousRows = getRetainedRows(previousStages);
  const averageStaffCount = getAverageStaffCount(rows);
  const previousAverageStaffCount = getAverageStaffCount(previousRows);
  const reminderSentStaffRate = getReminderSentStaffRate(rows);
  const previousReminderSentStaffRate = getReminderSentStaffRate(previousRows);
  const missingSubmissionRate = getAverageMissingSubmissionRate(rows);
  const previousMissingSubmissionRate = getAverageMissingSubmissionRate(previousRows);
  const averageDeadlineToConfirmationDays = getAverageDeadlineToConfirmationDays(rows);
  const previousAverageDeadlineToConfirmationDays = getAverageDeadlineToConfirmationDays(previousRows);
  const lineLinkedRate = getLineLinkedRate(rows);
  const previousLineLinkedRate = getLineLinkedRate(previousRows);
  const nextShiftMissingCount = getNextShiftMissingCount(rows);
  const previousNextShiftMissingCount = getNextShiftMissingCount(previousRows);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Box>
        <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mb={4}>
          運用中のサマリー
        </Text>
        <Grid gap={{ base: 3, xl: 4 }} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
          <MetricCard
            delta={numberDelta(rows.length, previousRows.length)}
            deltaUnit="店舗"
            isLoading={isLoading}
            label="運用中店舗数"
            unit="店舗"
            value={formatNumber(rows.length)}
          />
          <MetricCard
            delta={numberDelta(nextShiftMissingCount, previousNextShiftMissingCount)}
            deltaUnit="店舗"
            goodDirection="down"
            isLoading={isLoading}
            label="次シフト未設定"
            unit="店舗"
            value={formatNumber(nextShiftMissingCount)}
          />
          <MetricCard
            delta={numberDelta(averageStaffCount, previousAverageStaffCount)}
            deltaUnit="人"
            isLoading={isLoading}
            label="平均スタッフ数"
            unit={averageStaffCount === null ? undefined : "人"}
            value={formatFixedNumber(averageStaffCount, 1)}
          />
          <MetricCard
            delta={numberDelta(reminderSentStaffRate, previousReminderSentStaffRate)}
            deltaKind="point"
            goodDirection="down"
            isLoading={isLoading}
            label="催促送信スタッフ率"
            unit={reminderSentStaffRate === null ? undefined : "%"}
            value={formatPercentNumber(reminderSentStaffRate)}
          />
          <MetricCard
            delta={numberDelta(missingSubmissionRate, previousMissingSubmissionRate)}
            deltaKind="point"
            goodDirection="down"
            isLoading={isLoading}
            label="確定シフト未提出率"
            unit={missingSubmissionRate === null ? undefined : "%"}
            value={formatPercentNumber(missingSubmissionRate)}
          />
          <MetricCard
            delta={numberDelta(averageDeadlineToConfirmationDays, previousAverageDeadlineToConfirmationDays)}
            deltaUnit="日"
            goodDirection="down"
            isLoading={isLoading}
            label="締切→確定まで"
            unit={averageDeadlineToConfirmationDays === null ? undefined : "日"}
            value={formatFixedNumber(averageDeadlineToConfirmationDays, 1)}
          />
          <MetricCard
            delta={numberDelta(lineLinkedRate, previousLineLinkedRate)}
            deltaKind="point"
            isLoading={isLoading}
            label="LINE連携率"
            unit={lineLinkedRate === null ? undefined : "%"}
            value={formatPercentNumber(lineLinkedRate)}
          />
        </Grid>
      </Box>
      <RetainedTable isLoading={isLoading} onOpenShopRecruitments={onOpenShopRecruitments} rows={rows} />
    </Stack>
  );
}
