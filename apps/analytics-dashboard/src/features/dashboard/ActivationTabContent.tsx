import {
  Box,
  Button,
  Tooltip as ChakraTooltip,
  Flex,
  Grid,
  HStack,
  Portal,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { type ReactNode, useState } from "react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import {
  getActiveTrialRows,
  getAverageSubmissionRate,
  getFirstConfirmedShopCount,
  getFirstConfirmedShopNames,
  getFirstRecruitmentDurationDays,
  getLineLinkedRate,
  getNotificationFailureShopCount,
} from "@/domains/analytics/activeTrialProgress";
import { formatNumber, formatPercent } from "@/domains/analytics/format";
import { compareSortValues, finiteNumber, type SortState, sortRowsBy } from "@/domains/analytics/tableSort";
import { SortableColumnHeader } from "./SortableColumnHeader";

type ActivationSortKey =
  | "shopName"
  | "registeredAt"
  | "staffCount"
  | "recruitmentCount"
  | "confirmedRecruitmentCount"
  | "submissionRate"
  | "firstRecruitmentCreatedAt"
  | "firstRecruitmentDeadline"
  | "firstRecruitmentDurationDays";

const INITIAL_ACTIVATION_SORT: SortState<ActivationSortKey> = {
  direction: "desc",
  key: "registeredAt",
};
const MAX_METRIC_TOOLTIP_SHOP_NAMES = 8;

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

function formatDate(value: number | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateString(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

function dateStringToSortableDay(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function formatWithUnit(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)}${unit}`;
}

function formatPercentNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value * 100);
}

function activationSortValue(row: ShopStageRowDto, key: ActivationSortKey) {
  switch (key) {
    case "shopName":
      return row.shopName;
    case "registeredAt":
      return finiteNumber(row.shopCreatedAt);
    case "staffCount":
      return finiteNumber(row.staffCount);
    case "recruitmentCount":
      return finiteNumber(row.recruitmentCount);
    case "confirmedRecruitmentCount":
      return finiteNumber(row.confirmedRecruitmentCount);
    case "submissionRate":
      return finiteNumber(row.submissionRate);
    case "firstRecruitmentCreatedAt":
      return finiteNumber(row.firstRecruitmentCreatedAt);
    case "firstRecruitmentDeadline":
      return dateStringToSortableDay(row.firstRecruitmentDeadline);
    case "firstRecruitmentDurationDays":
      return getFirstRecruitmentDurationDays(row);
  }
}

function sortActivationRows(rows: ShopStageRowDto[], sort: SortState<ActivationSortKey>) {
  return sortRowsBy(rows, sort, activationSortValue, (a, b) =>
    compareSortValues(finiteNumber(a.shopCreatedAt), finiteNumber(b.shopCreatedAt), "desc"),
  );
}

function ConfirmedShopTooltipContent({ shopNames }: { shopNames: string[] }) {
  const visibleShopNames = shopNames.slice(0, MAX_METRIC_TOOLTIP_SHOP_NAMES);
  const hiddenCount = shopNames.length - visibleShopNames.length;

  return (
    <Stack gap={2}>
      <Text color="white" fontSize="xs" fontWeight="bold">
        シフト確定済みの店舗
      </Text>
      <Box as="ul" m={0} ps={4}>
        {visibleShopNames.map((shopName, index) => (
          <Text as="li" color="white" fontSize="xs" key={`${shopName}-${index}`}>
            {shopName}
          </Text>
        ))}
        {hiddenCount > 0 ? (
          <Text as="li" color="white" fontSize="xs">
            ほか{formatNumber(hiddenCount)}店舗
          </Text>
        ) : null}
      </Box>
    </Stack>
  );
}

function MetricCard({
  delta,
  deltaKind = "count",
  goodDirection = "up",
  isLoading,
  label,
  tooltipContent,
  unit,
  value,
}: {
  delta: number | null;
  deltaKind?: "count" | "point";
  goodDirection?: "up" | "down";
  isLoading: boolean;
  label: string;
  tooltipContent?: ReactNode;
  unit?: string;
  value: string;
}) {
  const hasTooltip = !isLoading && tooltipContent !== undefined && tooltipContent !== null;
  const card = (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      cursor={hasTooltip ? "help" : undefined}
      minH="150px"
      p={{ base: 4, md: 5 }}
      tabIndex={hasTooltip ? 0 : undefined}
    >
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
              {deltaKind === "point" ? `${formatSigned(delta * 100, 1)}pt` : `${formatSigned(delta)}店舗`}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  );

  if (!hasTooltip) return card;

  return (
    <ChakraTooltip.Root closeDelay={80} openDelay={120}>
      <ChakraTooltip.Trigger asChild>{card}</ChakraTooltip.Trigger>
      <Portal>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content
            bg="gray.900"
            borderRadius="md"
            boxShadow="lg"
            color="white"
            maxW="280px"
            px={3}
            py={2}
          >
            <ChakraTooltip.Arrow>
              <ChakraTooltip.ArrowTip bg="gray.900" />
            </ChakraTooltip.Arrow>
            {tooltipContent}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </Portal>
    </ChakraTooltip.Root>
  );
}

function ActivationTable({
  isLoading,
  onOpenShopRecruitments,
  rows,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  rows: ShopStageRowDto[];
}) {
  const [sort, setSort] = useState<SortState<ActivationSortKey>>(INITIAL_ACTIVATION_SORT);
  const sortedRows = sortActivationRows(rows, sort);

  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 5 }}>
      <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
        店舗一覧（立ち上げの店舗）
      </Text>
      <Box mt={4} overflowX="auto">
        {isLoading ? (
          <Stack gap={2}>
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
            <Skeleton h="40px" w="full" />
          </Stack>
        ) : (
          <Table.Root minW="1040px" size="sm" variant="outline">
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
                <SortableColumnHeader
                  label="スタッフ数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="staffCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="募集数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="recruitmentCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="確定数"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="confirmedRecruitmentCount"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="提出率"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="submissionRate"
                  textAlign="right"
                />
                <SortableColumnHeader
                  label="初回募集開始日"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="firstRecruitmentCreatedAt"
                />
                <SortableColumnHeader
                  label="初回募集締切日"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="firstRecruitmentDeadline"
                />
                <SortableColumnHeader
                  label="初回募集期間"
                  onSortChange={setSort}
                  sort={sort}
                  sortKey="firstRecruitmentDurationDays"
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
                  <Table.Cell colSpan={10}>
                    <Flex align="center" h="80px" justify="center">
                      <Text color="gray.500" fontSize="sm">
                        立ち上げの店舗はありません
                      </Text>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ) : (
                sortedRows.map((row) => {
                  const firstRecruitmentDurationDays = getFirstRecruitmentDurationDays(row);
                  return (
                    <Table.Row key={row.shopId}>
                      <Table.Cell color="gray.950" fontWeight="bold">
                        {row.shopName}
                      </Table.Cell>
                      <Table.Cell color="gray.700">{formatDate(row.shopCreatedAt)}</Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatNumber(row.staffCount)}人
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatWithUnit(row.recruitmentCount, "件")}
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatWithUnit(row.confirmedRecruitmentCount, "件")}
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatPercent(row.submissionRate)}
                      </Table.Cell>
                      <Table.Cell color="gray.700">{formatDate(row.firstRecruitmentCreatedAt)}</Table.Cell>
                      <Table.Cell color="gray.700">{formatDateString(row.firstRecruitmentDeadline)}</Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {firstRecruitmentDurationDays === null
                          ? "-"
                          : `${formatNumber(firstRecruitmentDurationDays)}日`}
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

export function ActivationTabContent({
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
  const rows = getActiveTrialRows(stages);
  const previousRows = getActiveTrialRows(previousStages);
  const averageSubmissionRate = getAverageSubmissionRate(rows);
  const previousAverageSubmissionRate = getAverageSubmissionRate(previousRows);
  const lineLinkedRate = getLineLinkedRate(rows);
  const previousLineLinkedRate = getLineLinkedRate(previousRows);
  const notificationFailureShopCount = getNotificationFailureShopCount(rows);
  const previousNotificationFailureShopCount = getNotificationFailureShopCount(previousRows);
  const firstConfirmedShopCount = getFirstConfirmedShopCount(rows);
  const previousFirstConfirmedShopCount = getFirstConfirmedShopCount(previousRows);
  const firstConfirmedShopNames = getFirstConfirmedShopNames(rows);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Box>
        <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" mb={4}>
          立ち上げのサマリー
        </Text>
        <Grid gap={{ base: 3, xl: 4 }} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" }}>
          <MetricCard
            delta={numberDelta(rows.length, previousRows.length)}
            isLoading={isLoading}
            label="立ち上げ店舗数"
            unit="店舗"
            value={formatNumber(rows.length)}
          />
          <MetricCard
            delta={numberDelta(averageSubmissionRate, previousAverageSubmissionRate)}
            deltaKind="point"
            isLoading={isLoading}
            label="平均提出率"
            unit={averageSubmissionRate === null ? undefined : "%"}
            value={formatPercentNumber(averageSubmissionRate)}
          />
          <MetricCard
            delta={numberDelta(lineLinkedRate, previousLineLinkedRate)}
            deltaKind="point"
            isLoading={isLoading}
            label="LINE連携率"
            unit={lineLinkedRate === null ? undefined : "%"}
            value={formatPercentNumber(lineLinkedRate)}
          />
          <MetricCard
            delta={numberDelta(notificationFailureShopCount, previousNotificationFailureShopCount)}
            goodDirection="down"
            isLoading={isLoading}
            label="通知失敗あり店舗数"
            unit="店舗"
            value={formatNumber(notificationFailureShopCount)}
          />
          <MetricCard
            delta={numberDelta(firstConfirmedShopCount, previousFirstConfirmedShopCount)}
            isLoading={isLoading}
            label="初回確定済み店舗数"
            tooltipContent={
              firstConfirmedShopNames.length > 0 ? (
                <ConfirmedShopTooltipContent shopNames={firstConfirmedShopNames} />
              ) : undefined
            }
            unit="店舗"
            value={formatNumber(firstConfirmedShopCount)}
          />
        </Grid>
      </Box>
      <ActivationTable isLoading={isLoading} onOpenShopRecruitments={onOpenShopRecruitments} rows={rows} />
    </Stack>
  );
}
