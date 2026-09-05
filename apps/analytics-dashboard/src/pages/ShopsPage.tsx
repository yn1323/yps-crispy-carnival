import { Alert, Button, Flex, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchShops } from "@/api/analyticsClient";
import type { AnalyticsMetric } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import { formatDate, formatDateTime, METRICS, shopPath } from "@/features/analytics/format";
import { AnalyticsPageLoading, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";

export function ShopsPage({ navigate }: { navigate: (path: string) => void }) {
  const searchParams = new URLSearchParams(window.location.search);
  const date = searchParams.get("date");
  const metric = searchParams.get("metric") as AnalyticsMetric | null;
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["analytics", "shops", date, metric, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchShops({ cursor: pageParam, limit: 50, search, date, metric }, signal),
    getNextPageParam: (last) => (last.data.pageInfo.isDone ? undefined : last.data.pageInfo.continueCursor),
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const rows = query.data?.pages.flatMap((page) => page.data.rows) ?? [];
  const scoped = date !== null || metric !== null;
  return (
    <Stack gap={6}>
      <PageHeading
        title={scoped ? "日別実績の店舗内訳" : "店舗・スタッフ"}
        description={
          scoped
            ? "実績があった店舗を表示します。名称・組織は現在の情報です。"
            : "現在の店舗を調べ、店舗・スタッフの詳細へ進めます。日次集計を待たずに利用できます。"
        }
      />
      {scoped && (
        <Flex bg="white" p={4} borderRadius="lg" align="center" gap={3} justify="space-between" wrap="wrap">
          <Text fontWeight="bold">
            {formatDate(date)}・{METRICS.find((item) => item.key === metric)?.label ?? "指標を確認してください"}
          </Text>
          <Button variant="outline" size="sm" onClick={() => navigate("/shops")}>
            条件を解除して現在の店舗へ
          </Button>
        </Flex>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(input.trim());
        }}
      >
        <Flex gap={2} maxW="lg">
          <Input
            aria-label="店舗名で絞り込み"
            placeholder="店舗名で絞り込み"
            maxLength={100}
            bg="white"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button type="submit">絞り込む</Button>
        </Flex>
      </form>
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending ? (
        <AnalyticsPageLoading title="店舗を読み込み中" description="" />
      ) : (
        first && (
          <Panel title={scoped ? "対象店舗" : "現在の店舗一覧"} description={`${formatDateTime(first.data.asOf)}時点`}>
            {first.data.scopeStatus === "outside_retention" || first.data.scopeStatus === "unavailable" ? (
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Description>
                  {first.data.scopeStatus === "outside_retention"
                    ? "店舗内訳は保存期間外です。日別の集計値は日次分析で確認できます。"
                    : "この日の内訳はまだ利用できません。集計状態を日次分析で確認してください。"}
                </Alert.Description>
              </Alert.Root>
            ) : (
              <>
                <DataTable
                  rows={rows}
                  getRowKey={(row) => row.shopId}
                  getRowLabel={(row) => row.name}
                  getRowHref={(row) => (row.isDeleted ? "" : shopPath(row.shopId))}
                  onNavigate={navigate}
                  emptyText={
                    query.hasNextPage
                      ? "ここまでの候補に該当する店舗はありません。続きを確認してください。"
                      : "該当する店舗はありません。"
                  }
                  columns={[
                    {
                      key: "name",
                      header: "店舗",
                      render: (row) =>
                        row.isDeleted ? (
                          <Text color="gray.600">削除済み店舗</Text>
                        ) : (
                          <Link href={shopPath(row.shopId)} fontWeight="bold" color="blue.700">
                            {row.name}
                          </Link>
                        ),
                    },
                    { key: "organization", header: "組織", render: (row) => row.organizationName ?? "確認できません" },
                    { key: "registeredAt", header: "登録日", render: (row) => formatDate(row.registeredAt) },
                  ]}
                  renderMobileRow={(row) => (
                    <Stack gap={2}>
                      <Text fontWeight="bold">{row.isDeleted ? "削除済み店舗" : row.name}</Text>
                      <Text fontSize="sm">{row.organizationName ?? "組織を確認できません"}</Text>
                      <Text fontSize="xs" color="gray.600">
                        登録：{formatDate(row.registeredAt)}
                      </Text>
                    </Stack>
                  )}
                />
                <MoreButton
                  count={rows.length}
                  hasMore={query.hasNextPage}
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                />
              </>
            )}
          </Panel>
        )
      )}
    </Stack>
  );
}
