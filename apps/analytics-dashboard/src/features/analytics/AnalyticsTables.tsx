import { Badge, Box, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { CompletenessBadge } from "./DataStatus";
import { formatCount, formatDate, formatDateTime, formatRate } from "./format";
import { HealthSignals } from "./Presentation";
import type { CycleRowViewModel, OrganizationRowViewModel, SegmentRowViewModel, ShopRowViewModel } from "./viewModels";

const organizationColumns: DataTableColumn<OrganizationRowViewModel>[] = [
  {
    key: "name",
    header: "グループ",
    render: (row) => (
      <Stack gap={1}>
        <Link
          fontWeight="bold"
          href={withCurrentSearch(routePath({ name: "organization", organizationId: row.organizationId }))}
        >
          {row.displayName}
        </Link>
        <Text color="gray.500" fontSize="xs">
          {row.plan}
        </Text>
      </Stack>
    ),
  },
  {
    key: "shops",
    header: "店舗 / 稼働",
    align: "right",
    render: (row) =>
      `${formatCount(row.shopCount, row.completeness)} / ${formatCount(row.activeShopCount, row.completeness)}`,
  },
  {
    key: "people",
    header: "unique person",
    align: "right",
    render: (row) => formatCount(row.uniquePersonCount, row.completeness),
  },
  {
    key: "staffs",
    header: "スタッフ所属",
    align: "right",
    render: (row) => formatCount(row.staffMembershipCount, row.completeness),
  },
  {
    key: "unlinkedStaffs",
    header: "person未接続staff",
    align: "right",
    render: (row) => formatCount(row.unlinkedStaffCount, row.completeness),
  },
  {
    key: "targets",
    header: "シフト対象",
    align: "right",
    render: (row) => formatCount(row.shiftTargetCount, row.completeness),
  },
  {
    key: "managers",
    header: "管理者",
    align: "right",
    render: (row) => formatCount(row.managerCount, row.completeness),
  },
  {
    key: "managerStaffs",
    header: "管理者兼staff",
    align: "right",
    render: (row) => formatCount(row.managerStaffCount, row.completeness),
  },
  {
    key: "northStar",
    header: "開始前確定周期率",
    align: "right",
    render: (row) => formatRate(row.northStarRate, row.completeness),
  },
  {
    key: "health",
    header: "health signal別店舗",
    render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
  },
  { key: "completeness", header: "完全性", render: (row) => <CompletenessBadge value={row.completeness} /> },
];

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
      rows={rows}
    />
  );
}

const shopColumns: DataTableColumn<ShopRowViewModel>[] = [
  {
    key: "shop",
    header: "店舗",
    render: (row) => (
      <Stack gap={1}>
        <Link fontWeight="bold" href={withCurrentSearch(routePath({ name: "shop", shopId: row.shopId }))}>
          {row.displayName}
        </Link>
        <Text color="gray.500" fontSize="xs">
          {row.organizationName} · {row.plan}
        </Text>
      </Stack>
    ),
  },
  { key: "registered", header: "登録日", render: (row) => formatDate(row.registeredAt) },
  { key: "milestone", header: "導入到達度", render: (row) => row.milestoneLabel },
  {
    key: "staff",
    header: "スタッフ / 対象",
    align: "right",
    render: (row) =>
      `${formatCount(row.activeStaffCount, row.completeness)} / ${formatCount(row.shiftTargetCount, row.completeness)}`,
  },
  {
    key: "people",
    header: "person / 管理者",
    align: "right",
    render: (row) =>
      `${formatCount(row.uniquePersonCount, row.completeness)} / ${formatCount(row.managerCount, row.completeness)}`,
  },
  {
    key: "unlinkedStaff",
    header: "person未接続staff",
    align: "right",
    render: (row) => formatCount(row.unlinkedStaffCount, row.completeness),
  },
  {
    key: "managerStaff",
    header: "管理者兼staff",
    align: "right",
    render: (row) => formatCount(row.managerStaffCount, row.completeness),
  },
  {
    key: "cadence",
    header: "通常周期",
    align: "right",
    render: (row) =>
      row.completeness === "complete"
        ? row.estimatedCadenceDays === null
          ? "判定材料不足"
          : `${row.estimatedCadenceDays}日`
        : formatCount(undefined, row.completeness),
  },
  {
    key: "nextCycle",
    header: "次回cycle",
    render: (row) =>
      row.completeness === "complete" ? (row.nextCycleDate ?? "未作成") : formatCount(undefined, row.completeness),
  },
  {
    key: "deadlineRate",
    header: "期限内 / 最終",
    align: "right",
    render: (row) =>
      `${formatRate(row.deadlineSubmissionRate, row.completeness)} / ${formatRate(row.finalSubmissionRate, row.completeness)}`,
  },
  { key: "line", header: "LINE", align: "right", render: (row) => formatRate(row.lineLinkedRate, row.completeness) },
  {
    key: "health",
    header: "health signal",
    render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
  },
  { key: "activity", header: "最終活動", render: (row) => formatDate(row.latestActivityAt) },
  { key: "completeness", header: "完全性", render: (row) => <CompletenessBadge value={row.completeness} /> },
];

export function ShopsTable({
  emptyText,
  navigate,
  rows,
}: {
  emptyText?: string;
  navigate: (href: string) => void;
  rows: ShopRowViewModel[];
}) {
  return (
    <DataTable
      columns={shopColumns}
      emptyText={emptyText ?? "この条件に一致する店舗はありません"}
      getRowHref={(row) => withCurrentSearch(routePath({ name: "shop", shopId: row.shopId }))}
      getRowKey={(row) => row.shopId}
      getRowLabel={(row) => row.displayName}
      onNavigate={navigate}
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
        <Link
          fontWeight="bold"
          href={withCurrentSearch(routePath({ name: "cycle", recruitmentId: row.recruitmentId, shopId }))}
        >
          {row.periodStart} 〜 {row.periodEnd}
        </Link>
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
      render: (row) => (
        <HStack gap={1} wrap="wrap">
          <Badge variant="surface">送信 {formatCount(row.notificationSentCount, row.completeness)}</Badge>
          <Badge colorPalette={row.notificationFailedCount ? "red" : "gray"} variant="subtle">
            失敗 {formatCount(row.notificationFailedCount, row.completeness)}
          </Badge>
          <Badge variant="surface">催促 {formatCount(row.reminderSentCount, row.completeness)}</Badge>
        </HStack>
      ),
    },
    { key: "completeness", header: "完全性", render: (row) => <CompletenessBadge value={row.completeness} /> },
  ];
  return (
    <Box>
      <DataTable
        columns={columns}
        emptyText={emptyText ?? "この条件に一致するシフト周期はありません"}
        getRowHref={(row) => withCurrentSearch(routePath({ name: "cycle", recruitmentId: row.recruitmentId, shopId }))}
        getRowKey={(row) => row.recruitmentId}
        getRowLabel={(row) => `${row.periodStart}から${row.periodEnd}`}
        onNavigate={navigate}
        rows={rows}
      />
    </Box>
  );
}

const segmentColumns: DataTableColumn<SegmentRowViewModel>[] = [
  { key: "dimension", header: "比較軸", render: (row) => row.dimension },
  { key: "bucket", header: "区分", render: (row) => <Text fontWeight="bold">{row.bucket}</Text> },
  { key: "shops", header: "店舗数", align: "right", render: (row) => formatCount(row.shopCount, row.completeness) },
  {
    key: "secondConfirmed",
    header: "2回目確定",
    align: "right",
    render: (row) => formatCount(row.secondConfirmedCount, row.completeness),
  },
  {
    key: "northStar",
    header: "開始前確定周期率",
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
    header: "health signal",
    render: (row) => <HealthSignals completeness={row.healthCompleteness} signals={row.healthSignals} />,
  },
  { key: "completeness", header: "完全性", render: (row) => <CompletenessBadge value={row.completeness} /> },
];

export function SegmentsTable({ emptyText, rows }: { emptyText?: string; rows: SegmentRowViewModel[] }) {
  return (
    <DataTable
      columns={segmentColumns}
      emptyText={emptyText ?? "この条件に一致するセグメントはありません"}
      getRowKey={(row) => `${row.dimension}:${row.bucket}`}
      rows={rows}
    />
  );
}
