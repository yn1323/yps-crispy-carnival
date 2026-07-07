import { Box, Flex, Grid, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import {
  getActiveTrialRows,
  getAverageSubmissionRate,
  getFirstConfirmedShopCount,
  getFirstRecruitmentDurationDays,
  getLineLinkedRate,
  getNotificationFailureShopCount,
} from "@/domains/analytics/activeTrialProgress";
import { formatNumber, formatPercent } from "@/domains/analytics/format";

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

function formatWithUnit(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)}${unit}`;
}

function formatPercentNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value * 100);
}

function MetricCard({
  delta,
  deltaKind = "count",
  goodDirection = "up",
  isLoading,
  label,
  unit,
  value,
}: {
  delta: number | null;
  deltaKind?: "count" | "point";
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
              {deltaKind === "point" ? `${formatSigned(delta * 100, 1)}pt` : `${formatSigned(delta)}店舗`}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  );
}

function ActivationTable({ isLoading, rows }: { isLoading: boolean; rows: ShopStageRowDto[] }) {
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
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  店舗名
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  登録日
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  スタッフ数
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  募集数
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  確定数
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  提出率
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  初回募集開始日
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold">
                  初回募集締切日
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                  初回募集期間
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={9}>
                    <Flex align="center" h="80px" justify="center">
                      <Text color="gray.500" fontSize="sm">
                        立ち上げの店舗はありません
                      </Text>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ) : (
                rows.map((row) => {
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
  previousStages,
  stages,
}: {
  isLoading: boolean;
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
            unit="店舗"
            value={formatNumber(firstConfirmedShopCount)}
          />
        </Grid>
      </Box>
      <ActivationTable isLoading={isLoading} rows={rows} />
    </Stack>
  );
}
