import { Badge, Box, Grid, HStack, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { CompletenessBadge, type DataCompleteness } from "./DataStatus";
import { formatCount, formatDate, formatDateTime, formatRate } from "./format";
import { HealthSignals } from "./Presentation";
import type { CycleRowViewModel, OrganizationRowViewModel, SegmentRowViewModel, ShopRowViewModel } from "./viewModels";

function RowStatus({ completeness }: { completeness: DataCompleteness }) {
  return completeness === "complete" ? null : (
    <HStack gap={1}>
      <Text color="gray.500" fontSize="2xs">
        行の集計:
      </Text>
      <CompletenessBadge value={completeness} />
    </HStack>
  );
}

function MobileMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={0.5} minW={0}>
      <Text color="gray.500" fontSize="xs">
        {label}
      </Text>
      <Box color="gray.900" fontSize="sm" fontWeight="semibold">
        {value}
      </Box>
    </Stack>
  );
}

function formatCountPair(numerator: number | null, denominator: number | null, completeness: DataCompleteness) {
  return `${formatCount(numerator, completeness)} / ${formatCount(denominator, completeness)}`;
}

const organizationColumns: DataTableColumn<OrganizationRowViewModel>[] = [
  {
    key: "name",
    header: "グループ",
    width: "20%",
    render: (row) => (
      <Stack gap={1}>
        <Link
          fontWeight="bold"
          href={withCurrentSearch(routePath({ name: "organization", organizationId: row.organizationId }))}
        >
          {row.displayName}
        </Link>
        <HStack gap={2} wrap="wrap">
          <Text color="gray.500" fontSize="xs">
            {row.plan}
          </Text>
          <RowStatus completeness={row.completeness} />
        </HStack>
      </Stack>
    ),
  },
  {
    key: "shops",
    header: "稼働 / 全店舗",
    align: "right",
    width: "13%",
    render: (row) => formatCountPair(row.activeShopCount, row.shopCount, row.completeness),
  },
  {
    key: "staffs",
    header: "スタッフ / 対象",
    align: "right",
    width: "16%",
    render: (row) =>
      `${formatCount(row.staffMembershipCount, row.completeness)} / ${formatCount(row.shiftTargetCount, row.completeness)}`,
  },
  {
    key: "managers",
    header: "管理者",
    align: "right",
    width: "10%",
    render: (row) => formatCount(row.managerCount, row.completeness),
  },
  {
    key: "northStar",
    header: "開始前確定率",
    align: "right",
    width: "14%",
    render: (row) => formatRate(row.northStarRate, row.completeness),
  },
  {
    key: "health",
    header: "要確認状態",
    width: "27%",
    render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
  },
];

function OrganizationMobileRow({ row }: { row: OrganizationRowViewModel }) {
  return (
    <Stack gap={4}>
      <HStack align="start" justify="space-between">
        <Stack gap={0.5} minW={0}>
          <Text fontWeight="bold">{row.displayName}</Text>
          <Text color="gray.500" fontSize="xs">
            {row.plan}
          </Text>
        </Stack>
        <RowStatus completeness={row.completeness} />
      </HStack>
      <Grid gap={3} templateColumns="repeat(2, minmax(0, 1fr))">
        <MobileMetric
          label="稼働 / 全店舗"
          value={formatCountPair(row.activeShopCount, row.shopCount, row.completeness)}
        />
        <MobileMetric
          label="スタッフ / 対象"
          value={`${formatCount(row.staffMembershipCount, row.completeness)} / ${formatCount(row.shiftTargetCount, row.completeness)}`}
        />
        <MobileMetric label="管理者" value={formatCount(row.managerCount, row.completeness)} />
        <MobileMetric label="開始前確定率" value={formatRate(row.northStarRate, row.completeness)} />
      </Grid>
      <Stack gap={1.5}>
        <Text color="gray.500" fontSize="xs">
          要確認状態
        </Text>
        <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />
      </Stack>
      <Text alignSelf="end" color="blue.600" fontSize="sm" fontWeight="bold">
        詳細を見る →
      </Text>
    </Stack>
  );
}

export function OrganizationsTable({
  emptyText,
  navigate,
  rows,
}: {
  emptyText?: string;
  navigate: (href: string) => void;
  rows: OrganizationRowViewModel[];
}) {
  return (
    <DataTable
      columns={organizationColumns}
      emptyText={emptyText ?? "この条件に一致するグループはありません"}
      getRowHref={(row) => withCurrentSearch(routePath({ name: "organization", organizationId: row.organizationId }))}
      getRowKey={(row) => row.organizationId}
      getRowLabel={(row) => row.displayName}
      onNavigate={navigate}
      renderMobileRow={(row) => <OrganizationMobileRow row={row} />}
      rows={rows}
    />
  );
}

const shopNameColumn: DataTableColumn<ShopRowViewModel> = {
  key: "shop",
  header: "店舗",
  width: "20%",
  render: (row) => (
    <Stack gap={1}>
      <Link fontWeight="bold" href={withCurrentSearch(routePath({ name: "shop", shopId: row.shopId }))}>
        {row.displayName}
      </Link>
      <HStack gap={2} wrap="wrap">
        <Text color="gray.500" fontSize="xs">
          {row.organizationName} · {row.plan}
        </Text>
        <RowStatus completeness={row.completeness} />
      </HStack>
    </Stack>
  ),
};

const shopMilestoneColumn: DataTableColumn<ShopRowViewModel> = {
  key: "milestone",
  header: "導入到達",
  width: "11%",
  render: (row) => row.milestoneLabel,
};

const shopStaffColumn: DataTableColumn<ShopRowViewModel> = {
  key: "staff",
  header: "スタッフ / 対象",
  align: "right",
  width: "15%",
  render: (row) =>
    `${formatCount(row.activeStaffCount, row.completeness)} / ${formatCount(row.shiftTargetCount, row.completeness)}`,
};

const shopNextCycleColumn: DataTableColumn<ShopRowViewModel> = {
  key: "nextCycle",
  header: "次回シフト",
  width: "12%",
  render: (row) =>
    row.completeness === "complete"
      ? row.nextCycleDate
        ? formatDate(row.nextCycleDate)
        : "未作成"
      : formatCount(undefined, row.completeness),
};

const shopFinalRateColumn: DataTableColumn<ShopRowViewModel> = {
  key: "finalRate",
  header: "最終提出率",
  align: "right",
  width: "12%",
  render: (row) => formatRate(row.finalSubmissionRate, row.completeness),
};

const shopHealthColumn: DataTableColumn<ShopRowViewModel> = {
  key: "health",
  header: "要確認状態",
  width: "20%",
  render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
};

const shopActivityColumn: DataTableColumn<ShopRowViewModel> = {
  key: "activity",
  header: "最終活動",
  width: "10%",
  render: (row) => formatDate(row.latestActivityAt),
};

const shopColumnsByVariant = {
  attention: [shopNameColumn, shopNextCycleColumn, shopHealthColumn, shopActivityColumn],
  comparison: [
    shopNameColumn,
    shopMilestoneColumn,
    shopStaffColumn,
    shopNextCycleColumn,
    shopFinalRateColumn,
    shopHealthColumn,
    shopActivityColumn,
  ],
  group: [
    shopNameColumn,
    shopMilestoneColumn,
    shopStaffColumn,
    shopNextCycleColumn,
    shopFinalRateColumn,
    shopHealthColumn,
  ],
} satisfies Record<string, DataTableColumn<ShopRowViewModel>[]>;

export type ShopsTableVariant = keyof typeof shopColumnsByVariant;

function ShopMobileRow({ row, variant }: { row: ShopRowViewModel; variant: ShopsTableVariant }) {
  return (
    <Stack gap={4}>
      <HStack align="start" justify="space-between">
        <Stack gap={0.5} minW={0}>
          <Text fontWeight="bold">{row.displayName}</Text>
          <Text color="gray.500" fontSize="xs">
            {row.organizationName} · {row.plan}
          </Text>
        </Stack>
        <RowStatus completeness={row.completeness} />
      </HStack>
      <Stack gap={1.5}>
        <Text color="gray.500" fontSize="xs">
          要確認状態
        </Text>
        <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />
      </Stack>
      <Grid gap={3} templateColumns="repeat(2, minmax(0, 1fr))">
        {variant !== "attention" ? <MobileMetric label="導入到達" value={row.milestoneLabel} /> : null}
        {variant !== "attention" ? (
          <MobileMetric
            label="スタッフ / 対象"
            value={`${formatCount(row.activeStaffCount, row.completeness)} / ${formatCount(row.shiftTargetCount, row.completeness)}`}
          />
        ) : null}
        <MobileMetric
          label="次回シフト"
          value={
            row.completeness === "complete"
              ? row.nextCycleDate
                ? formatDate(row.nextCycleDate)
                : "未作成"
              : formatCount(undefined, row.completeness)
          }
        />
        {variant !== "attention" ? (
          <MobileMetric label="最終提出率" value={formatRate(row.finalSubmissionRate, row.completeness)} />
        ) : null}
        {variant !== "group" ? <MobileMetric label="最終活動" value={formatDate(row.latestActivityAt)} /> : null}
      </Grid>
      <Text alignSelf="end" color="blue.600" fontSize="sm" fontWeight="bold">
        詳細を見る →
      </Text>
    </Stack>
  );
}

export function ShopsTable({
  emptyText,
  navigate,
  rows,
  variant = "comparison",
}: {
  emptyText?: string;
  navigate: (href: string) => void;
  rows: ShopRowViewModel[];
  variant?: ShopsTableVariant;
}) {
  return (
    <DataTable
      columns={shopColumnsByVariant[variant]}
      emptyText={emptyText ?? "この条件に一致する店舗はありません"}
      getRowHref={(row) => withCurrentSearch(routePath({ name: "shop", shopId: row.shopId }))}
      getRowKey={(row) => row.shopId}
      getRowLabel={(row) => row.displayName}
      onNavigate={navigate}
      renderMobileRow={(row) => <ShopMobileRow row={row} variant={variant} />}
      rows={rows}
    />
  );
}

export function CyclesTable({
  emptyText,
  navigate,
  rows,
  shopId,
}: {
  emptyText?: string;
  navigate: (href: string) => void;
  rows: CycleRowViewModel[];
  shopId: string;
}) {
  const columns: DataTableColumn<CycleRowViewModel>[] = [
    {
      key: "period",
      header: "対象期間",
      render: (row) => (
        <Stack gap={1}>
          <Link
            fontWeight="bold"
            href={withCurrentSearch(routePath({ name: "cycle", recruitmentId: row.recruitmentId, shopId }))}
          >
            {row.periodStart} 〜 {row.periodEnd}
          </Link>
          <RowStatus completeness={row.completeness} />
        </Stack>
      ),
    },
    { key: "created", header: "作成日時", render: (row) => formatDateTime(row.createdAt) },
    { key: "deadline", header: "提出期限", render: (row) => formatDateTime(row.submitDeadlineAt) },
    {
      key: "confirmed",
      header: "確定日時",
      render: (row) => (row.confirmedAt ? formatDateTime(row.confirmedAt) : "未確定"),
    },
    {
      key: "deadlineSubmissions",
      header: "期限時 提出 / 対象",
      align: "right",
      render: (row) =>
        `${formatCount(row.submittedAtDeadline, row.completeness)} / ${formatCount(row.targetAtDeadline, row.completeness)}`,
    },
    {
      key: "deadlineRate",
      header: "期限内提出率",
      align: "right",
      render: (row) => formatRate(row.deadlineSubmissionRate, row.completeness),
    },
    {
      key: "finalSubmissions",
      header: "最終 提出 / 対象",
      align: "right",
      render: (row) =>
        `${formatCount(row.submittedAtClose, row.completeness)} / ${formatCount(row.targetAtClose, row.completeness)}`,
    },
    {
      key: "finalRate",
      header: "最終提出率",
      align: "right",
      render: (row) => formatRate(row.finalSubmissionRate, row.completeness),
    },
    {
      key: "notifications",
      header: "通知",
      render: (row) => <NotificationCounts row={row} />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      emptyText={emptyText ?? "この条件に一致するシフト周期はありません"}
      getRowHref={(row) => withCurrentSearch(routePath({ name: "cycle", recruitmentId: row.recruitmentId, shopId }))}
      getRowKey={(row) => row.recruitmentId}
      getRowLabel={(row) => `${row.periodStart}から${row.periodEnd}`}
      onNavigate={navigate}
      renderMobileRow={(row) => (
        <Stack gap={4}>
          <HStack align="start" justify="space-between">
            <Text fontWeight="bold">
              {row.periodStart} 〜 {row.periodEnd}
            </Text>
            <RowStatus completeness={row.completeness} />
          </HStack>
          <Grid gap={3} templateColumns="repeat(2, minmax(0, 1fr))">
            <MobileMetric label="提出期限" value={formatDateTime(row.submitDeadlineAt)} />
            <MobileMetric label="確定日時" value={row.confirmedAt ? formatDateTime(row.confirmedAt) : "未確定"} />
            <MobileMetric label="期限内提出率" value={formatRate(row.deadlineSubmissionRate, row.completeness)} />
            <MobileMetric label="最終提出率" value={formatRate(row.finalSubmissionRate, row.completeness)} />
          </Grid>
          <NotificationCounts row={row} />
          <Text alignSelf="end" color="blue.600" fontSize="sm" fontWeight="bold">
            周期の詳細を見る →
          </Text>
        </Stack>
      )}
      rows={rows}
    />
  );
}

function NotificationCounts({ row }: { row: CycleRowViewModel }) {
  return (
    <HStack gap={1} wrap="wrap">
      <Badge variant="surface">送信 {formatCount(row.notificationSentCount, row.completeness)}</Badge>
      <Badge colorPalette={row.notificationFailedCount ? "red" : "gray"} variant="subtle">
        失敗 {formatCount(row.notificationFailedCount, row.completeness)}
      </Badge>
      <Badge variant="surface">催促 {formatCount(row.reminderSentCount, row.completeness)}</Badge>
    </HStack>
  );
}

const segmentColumns: DataTableColumn<SegmentRowViewModel>[] = [
  { key: "dimension", header: "比較軸", render: (row) => row.dimension },
  {
    key: "bucket",
    header: "区分",
    render: (row) => (
      <Stack gap={1}>
        <Text fontWeight="bold">{row.bucket}</Text>
        <RowStatus completeness={row.completeness} />
      </Stack>
    ),
  },
  { key: "shops", header: "店舗数", align: "right", render: (row) => formatCount(row.shopCount, row.completeness) },
  {
    key: "secondConfirmed",
    header: "2回目確定",
    align: "right",
    render: (row) => formatCountPair(row.secondConfirmedCount, row.shopCount, row.completeness),
  },
  {
    key: "northStar",
    header: "開始前確定率",
    align: "right",
    render: (row) => formatRate(row.northStarRate, row.completeness),
  },
  {
    key: "deadlineSubmission",
    header: "期限内提出率",
    align: "right",
    render: (row) => formatRate(row.deadlineSubmissionRate, row.completeness),
  },
  {
    key: "finalSubmission",
    header: "最終提出率",
    align: "right",
    render: (row) => formatRate(row.finalSubmissionRate, row.completeness),
  },
  {
    key: "health",
    header: "要確認状態",
    render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
  },
];

export function SegmentsTable({ emptyText, rows }: { emptyText?: string; rows: SegmentRowViewModel[] }) {
  return (
    <DataTable
      columns={segmentColumns}
      emptyText={emptyText ?? "この条件に一致するセグメントはありません"}
      getRowKey={(row) => `${row.dimension}:${row.bucket}`}
      renderMobileRow={(row) => (
        <Stack gap={4}>
          <HStack align="start" justify="space-between">
            <Stack gap={0.5}>
              <Text color="gray.500" fontSize="xs">
                {row.dimension}
              </Text>
              <Text fontWeight="bold">{row.bucket}</Text>
            </Stack>
            <RowStatus completeness={row.completeness} />
          </HStack>
          <Grid gap={3} templateColumns="repeat(2, minmax(0, 1fr))">
            <MobileMetric label="店舗数" value={formatCount(row.shopCount, row.completeness)} />
            <MobileMetric
              label="2回目確定"
              value={formatCountPair(row.secondConfirmedCount, row.shopCount, row.completeness)}
            />
            <MobileMetric label="開始前確定率" value={formatRate(row.northStarRate, row.completeness)} />
            <MobileMetric label="最終提出率" value={formatRate(row.finalSubmissionRate, row.completeness)} />
          </Grid>
          <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />
        </Stack>
      )}
      rows={rows}
    />
  );
}
