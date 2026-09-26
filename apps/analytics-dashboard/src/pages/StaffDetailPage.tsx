import { Badge, Flex, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AnalyticsApiError, fetchStaff, fetchStaffTimeline } from "@/api/analyticsClient";
import type { StaffNotificationDto } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import { staffTimelineLabel, staffTimelineNote } from "@/features/activity/labels";
import {
  cyclePath,
  formatDate,
  formatDateTime,
  lineStatusLabel,
  shopPath,
  staffPath,
} from "@/features/analytics/format";
import { AnalyticsPageLoading, Details, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";
import { notificationKindLabel as notificationLabel } from "@/features/notifications/labels";

function StaffTimelinePanel({ shopId, staffId }: { shopId: string; staffId: string }) {
  const query = useQuery({
    queryKey: ["analytics", "staffTimeline", shopId, staffId],
    queryFn: ({ signal }) => fetchStaffTimeline(shopId, staffId, signal),
  });
  const data = query.data?.data;
  return (
    <Panel
      title="行動の履歴"
      description="記録が残っている出来事を新しい順に表示します。提出リンクを開いた記録、途中の再提出、LINEの既読は残っていません。期限切れの画面の記録は削除されています。"
    >
      {query.isPending ? (
        <Skeleton h="160px" borderRadius="md" aria-busy="true" aria-label="行動の履歴を読み込み中" />
      ) : !data ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={data.events.map((event, index) => ({ ...event, index }))}
            getRowKey={(event) => String(event.index)}
            emptyText="記録された出来事はありません。"
            columns={[
              { key: "at", header: "日時", width: "170px", render: (event) => formatDateTime(event.at) },
              {
                key: "type",
                header: "出来事",
                render: (event) => (
                  <Stack gap={1}>
                    <Text>{staffTimelineLabel(event.type)}</Text>
                    {staffTimelineNote(event) && (
                      <Text color="gray.600" fontSize="xs">
                        {staffTimelineNote(event)}
                      </Text>
                    )}
                  </Stack>
                ),
              },
              {
                key: "recruitment",
                header: "募集",
                render: (event) =>
                  event.recruitment ? (
                    <Link href={cyclePath(shopId, event.recruitment.recruitmentId)} color="blue.700">
                      {formatDate(event.recruitment.periodStart)}〜{formatDate(event.recruitment.periodEnd)}
                    </Link>
                  ) : (
                    "—"
                  ),
              },
            ]}
            renderMobileRow={(event) => (
              <Stack gap={1}>
                <Text fontWeight="bold">{staffTimelineLabel(event.type)}</Text>
                {staffTimelineNote(event) && <Text fontSize="sm">{staffTimelineNote(event)}</Text>}
                {event.recruitment && (
                  <Text fontSize="sm">
                    募集：{formatDate(event.recruitment.periodStart)}〜{formatDate(event.recruitment.periodEnd)}
                  </Text>
                )}
                <Text color="gray.600" fontSize="xs">
                  {formatDateTime(event.at)}
                </Text>
              </Stack>
            )}
          />
          {data.isTruncated && (
            <Text color="gray.600" fontSize="xs">
              記録が多いため、古い出来事の一部を省いています。
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}
function NotificationStatus({ row }: { row: StaffNotificationDto }) {
  const sent =
    (
      {
        queued: "受付済み",
        sending: "送信中",
        retrying: "再試行中",
        sent: "送信済み",
        failed: "送信失敗",
        cancelled: "取消済み",
      } as Record<string, string>
    )[row.sendStatus] ?? "確認できません";
  const delivery =
    row.deliveryStatus === "delivered"
      ? "到達確認済み"
      : ["failed", "bounced", "suppressed"].includes(row.deliveryStatus)
        ? "到達失敗"
        : row.deliveryStatus === "delayed"
          ? "到達が遅延"
          : row.channel === "line" || row.deliveryStatus === "not_supported"
            ? "到達は確認できません"
            : "到達未確認";
  return (
    <Stack gap={1}>
      <Text>{sent}</Text>
      <Text color="gray.600" fontSize="xs">
        {delivery}
      </Text>
    </Stack>
  );
}
export function StaffDetailPage({
  shopId,
  staffId,
  navigate,
}: {
  shopId: string;
  staffId: string;
  navigate: (path: string) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: ["analytics", "staff", shopId, staffId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchStaff(shopId, staffId, { cursor: pageParam, limit: 20 }, signal),
    getNextPageParam: (last) => (last.data.pageInfo.isDone ? undefined : last.data.pageInfo.continueCursor),
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const data = query.error instanceof AnalyticsApiError && query.error.status === 404 ? undefined : first?.data;
  const notifications = query.data?.pages.flatMap((page) => page.data.notifications) ?? [];
  if (!data && query.isPending)
    return <AnalyticsPageLoading title="スタッフ詳細" description="現在の所属と履歴を読み込みます。" />;
  if (!data)
    return (
      <Stack gap={5}>
        <PageHeading
          title="スタッフ詳細"
          description="現在の所属と履歴を確認します。"
          breadcrumbs={[
            { label: "店舗", href: "/shops" },
            { label: "店舗詳細", href: shopPath(shopId) },
          ]}
        />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </Stack>
    );
  return (
    <Stack gap={6}>
      <PageHeading
        title={data.staff.name}
        description={`現在の情報・${formatDateTime(data.asOf)}時点`}
        breadcrumbs={[
          { label: "店舗", href: "/shops" },
          { label: data.shop.name, href: shopPath(shopId) },
          { label: data.staff.name },
        ]}
      />
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      <Panel title="スタッフ情報">
        <Details
          items={[
            { label: "メールアドレス", value: data.staff.email || "未登録" },
            {
              label: "この店舗での区分",
              value: `${data.staff.isManager ? "管理者" : "スタッフ"}・${data.staff.excludedFromShift ? "シフト対象外" : "シフト対象"}`,
            },
            { label: "アカウント", value: data.staff.accountLinked ? "連携済み" : "未連携" },
            { label: "LINE", value: lineStatusLabel(data.staff.lineStatus) },
          ]}
        />
      </Panel>
      <Panel title="所属店舗">
        <Stack gap={2}>
          {data.memberships.map((row) => (
            <Flex key={row.staffId} gap={3} justify="space-between" align="center" bg="gray.50" borderRadius="md" p={3}>
              <Link href={staffPath(row.shopId, row.staffId)} color="blue.700" fontWeight="medium">
                {row.shopName}
              </Link>
              <Badge>{row.excludedFromShift ? "シフト対象外" : "シフト対象"}</Badge>
            </Flex>
          ))}
        </Stack>
      </Panel>
      <StaffTimelinePanel shopId={shopId} staffId={staffId} />
      <Panel
        title="この店舗での提出履歴"
        description="開始日が新しい直近20募集に対する記録です。記録がない募集を、過去の未提出とは断定しません。"
      >
        <DataTable
          rows={data.submissions}
          getRowKey={(row) => row.recruitmentId}
          getRowHref={(row) => cyclePath(shopId, row.recruitmentId)}
          getRowLabel={(row) => `${formatDate(row.periodStart)}からの募集`}
          onNavigate={navigate}
          emptyText="対象の募集はありません。"
          columns={[
            {
              key: "period",
              header: "募集期間",
              render: (row) => (
                <Link href={cyclePath(shopId, row.recruitmentId)} color="blue.700">
                  {formatDate(row.periodStart)}〜{formatDate(row.periodEnd)}
                </Link>
              ),
            },
            { key: "first", header: "初回提出", render: (row) => formatDateTime(row.firstSubmittedAt) },
            { key: "latest", header: "最終提出", render: (row) => formatDateTime(row.submittedAt) },
          ]}
          renderMobileRow={(row) => (
            <Stack gap={2}>
              <Text fontWeight="bold">
                {formatDate(row.periodStart)}〜{formatDate(row.periodEnd)}
              </Text>
              <Text fontSize="sm">初回提出：{formatDateTime(row.firstSubmittedAt)}</Text>
              <Text fontSize="sm">最終提出：{formatDateTime(row.submittedAt)}</Text>
            </Stack>
          )}
        />
      </Panel>
      <Panel
        title="この店舗での通知履歴"
        description="受付日時が新しい順に表示します。送信済みは、本人への到達を保証するものではありません。"
      >
        <DataTable
          rows={notifications}
          getRowKey={(row) => row.id}
          emptyText={query.hasNextPage ? "次の候補を確認してください。" : "表示できる通知の記録はありません。"}
          columns={[
            { key: "time", header: "受付日時", render: (row) => formatDateTime(row.requestedAt) },
            {
              key: "kind",
              header: "通知",
              render: (row) => (
                <Stack gap={1}>
                  <Text>{notificationLabel(row.notificationKind)}</Text>
                  <Text fontSize="xs" color="gray.600">
                    {row.channel === "line" ? "LINE" : "メール"}
                  </Text>
                </Stack>
              ),
            },
            { key: "status", header: "状態", render: (row) => <NotificationStatus row={row} /> },
            { key: "sent", header: "送信日時", render: (row) => formatDateTime(row.sentAt) },
          ]}
          renderMobileRow={(row) => (
            <Stack gap={2}>
              <Flex justify="space-between" gap={2}>
                <Text fontWeight="bold">{notificationLabel(row.notificationKind)}</Text>
                <Badge>{row.channel === "line" ? "LINE" : "メール"}</Badge>
              </Flex>
              <Text fontSize="xs" color="gray.600">
                受付：{formatDateTime(row.requestedAt)}
              </Text>
              <NotificationStatus row={row} />
              <Text fontSize="xs">送信：{formatDateTime(row.sentAt)}</Text>
            </Stack>
          )}
        />
        <MoreButton
          count={notifications.length}
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      </Panel>
    </Stack>
  );
}
