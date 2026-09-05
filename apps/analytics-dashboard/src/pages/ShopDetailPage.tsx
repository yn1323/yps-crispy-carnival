import { Badge, Box, Flex, Link, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AnalyticsApiError, fetchShop } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import {
  cyclePath,
  formatDate,
  formatDateTime,
  lineStatusLabel,
  METRICS,
  staffPath,
} from "@/features/analytics/format";
import { AnalyticsPageLoading, Details, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";

export function ShopDetailPage({ shopId, navigate }: { shopId: string; navigate: (path: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ["analytics", "shop", shopId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchShop(shopId, { cursor: pageParam, limit: 50 }, signal),
    getNextPageParam: (last) => (last.data.pageInfo.isDone ? undefined : last.data.pageInfo.continueCursor),
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const data = query.error instanceof AnalyticsApiError && query.error.status === 404 ? undefined : first?.data;
  const staff = query.data?.pages.flatMap((page) => page.data.staff) ?? [];
  if (!data && query.isPending)
    return <AnalyticsPageLoading title="店舗詳細" description="現在の店舗情報を読み込みます。" />;
  if (!data)
    return (
      <Stack gap={5}>
        <PageHeading
          title="店舗詳細"
          description="現在の店舗情報を確認します。"
          breadcrumbs={[{ label: "店舗", href: "/shops" }]}
        />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </Stack>
    );
  const confirmedCycles = data.activity.evidence.filter((row) => row.firstConfirmedAt !== null).length;
  return (
    <Stack gap={6}>
      <PageHeading
        title={data.shop.name}
        description={`現在の情報・${formatDateTime(data.asOf)}時点`}
        breadcrumbs={[{ label: "店舗", href: "/shops" }, { label: data.shop.name }]}
      />
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      <Panel title="店舗情報">
        <Details
          items={[
            { label: "組織", value: data.shop.organizationName ?? "確認できません" },
            { label: "登録日", value: formatDate(data.shop.registeredAt) },
            {
              label: "定休日",
              value: data.regularClosedDays.length
                ? data.regularClosedDays
                    .map(
                      (day) =>
                        (
                          ({ sun: "日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土" }) as Record<
                            string,
                            string
                          >
                        )[day] ?? "不明",
                    )
                    .join("・")
                : "なし",
            },
            { label: "提出方法", value: data.submissionPattern },
          ]}
        />
      </Panel>
      <Panel
        title="スタッフ"
        description="氏名・所属・連携状態は現在値です。スタッフを開くと連絡先と履歴を確認できます。"
      >
        <DataTable
          rows={staff}
          getRowKey={(row) => row.staffId}
          getRowHref={(row) => staffPath(shopId, row.staffId)}
          getRowLabel={(row) => row.name}
          onNavigate={navigate}
          emptyText={query.hasNextPage ? "次の候補を確認してください。" : "表示できるスタッフはいません。"}
          columns={[
            {
              key: "name",
              header: "氏名",
              render: (row) => (
                <Link fontWeight="bold" color="blue.700" href={staffPath(shopId, row.staffId)}>
                  {row.name}
                </Link>
              ),
            },
            {
              key: "role",
              header: "区分",
              render: (row) => (
                <Stack gap={1}>
                  <Text>{row.isManager ? "管理者" : "スタッフ"}</Text>
                  <Text fontSize="xs" color="gray.600">
                    {row.excludedFromShift ? "シフト対象外" : "シフト対象"}
                  </Text>
                </Stack>
              ),
            },
            { key: "account", header: "アカウント", render: (row) => (row.accountLinked ? "連携済み" : "未連携") },
            { key: "line", header: "LINE", render: (row) => lineStatusLabel(row.lineStatus) },
          ]}
          renderMobileRow={(row) => (
            <Stack gap={2}>
              <Flex justify="space-between">
                <Text fontWeight="bold">{row.name}</Text>
                {row.isManager && <Badge>管理者</Badge>}
              </Flex>
              <Text fontSize="sm">
                {row.excludedFromShift ? "シフト対象外" : "シフト対象"}・アカウント
                {row.accountLinked ? "連携済み" : "未連携"}
              </Text>
              <Text fontSize="sm">LINE：{lineStatusLabel(row.lineStatus)}</Text>
            </Stack>
          )}
        />
        <MoreButton
          count={staff.length}
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      </Panel>
      <Panel title="直近の募集" description="募集期間の開始日が新しい順に、最大20件を表示します。">
        <DataTable
          rows={data.cycles}
          getRowKey={(row) => row.recruitmentId}
          getRowHref={(row) => cyclePath(shopId, row.recruitmentId)}
          getRowLabel={(row) => `${formatDate(row.periodStart)}からの募集`}
          onNavigate={navigate}
          emptyText="募集はありません。"
          columns={[
            {
              key: "period",
              header: "募集期間",
              render: (row) => (
                <Link color="blue.700" href={cyclePath(shopId, row.recruitmentId)}>
                  {formatDate(row.periodStart)}〜{formatDate(row.periodEnd)}
                </Link>
              ),
            },
            { key: "deadline", header: "提出締切", render: (row) => formatDateTime(row.deadline) },
            {
              key: "status",
              header: "状態",
              render: (row) => <Badge>{row.status === "confirmed" ? "確定済み" : "未確定"}</Badge>,
            },
          ]}
          renderMobileRow={(row) => (
            <Stack gap={2}>
              <Text fontWeight="bold">
                {formatDate(row.periodStart)}〜{formatDate(row.periodEnd)}
              </Text>
              <Text fontSize="sm">締切：{formatDateTime(row.deadline)}</Text>
              <Badge alignSelf="start">{row.status === "confirmed" ? "確定済み" : "未確定"}</Badge>
            </Stack>
          )}
        />
      </Panel>
      <Panel
        title="観測開始後の利用"
        description="保存期間内に記録できた実績です。既存店舗の初回利用日や過去の未利用を推定しません。"
      >
        <Text fontSize="sm">
          {data.activity.startedAt === null
            ? "計測開始待ちです。"
            : `${formatDateTime(data.activity.startedAt)}から計測しています。`}
        </Text>
        <Box bg="gray.50" p={3} borderRadius="md">
          <Text fontSize="sm">
            {confirmedCycles >= 2
              ? "別の募集でも確定まで進んだ実績があります。"
              : confirmedCycles === 1
                ? "表示中の1つの募集で確定を確認しています。"
                : "表示中の募集では確定をまだ確認していません。"}
            {data.activity.hasMoreEvidence ? "表示範囲外にも募集の実績があります。" : ""}
          </Text>
        </Box>
        <Text fontSize="xs" color="gray.600">
          日別実績：{formatDate(data.activity.from)}〜{formatDate(data.activity.to)}
          。同じ募集の再確定は別の募集として数えません。
        </Text>
        <DataTable
          rows={[...data.activity.days].reverse()}
          getRowKey={(row) => row.date}
          emptyText="この範囲で記録された操作はありません。"
          columns={[
            { key: "date", header: "操作日", render: (row) => formatDate(row.date) },
            ...METRICS.map((metric) => ({
              key: metric.key,
              header: metric.label,
              render: (row: (typeof data.activity.days)[number]) => (row[metric.key] ? "あり" : "—"),
            })),
          ]}
        />
      </Panel>
    </Stack>
  );
}
