import { Alert, Button, Flex, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AnalyticsApiError, fetchShops } from "@/api/analyticsClient";
import type { AnalyticsMetric, AnalyticsShopListRowDto } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable, type DataTableSort } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatShiftPeriod,
  METRICS,
  shopPath,
} from "@/features/analytics/format";
import { AnalyticsPageLoading, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";

function sortValue(row: AnalyticsShopListRowDto, key: string) {
  switch (key) {
    case "name":
      return row.name;
    case "organization":
      return row.organizationName;
    case "staffCount":
      return row.staffCount;
    case "registeredAt":
      return row.registeredAt;
    default:
      return row.latestShift ? `${row.latestShift.periodStart}/${row.latestShift.periodEnd}` : null;
  }
}

export function ShopsPage({ navigate }: { navigate: (path: string) => void }) {
  const searchParams = new URLSearchParams(window.location.search);
  const date = searchParams.get("date");
  const metric = searchParams.get("metric") as AnalyticsMetric | null;
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DataTableSort>({ key: "latestShift", direction: "desc" });
  const [visibleCount, setVisibleCount] = useState(50);
  const query = useQuery({
    queryKey: ["analytics", "shops", date, metric, search],
    queryFn: async ({ signal }) => {
      const first = await fetchShops({ limit: 50, search, date, metric }, signal);
      const allRows = new Map(first.data.rows.map((row) => [row.shopId, row]));
      let page = first;
      // 全店舗を並べ替えてから表示件数を区切る。APIの各読み取りは有界pageを維持する。
      while (!page.data.pageInfo.isDone) {
        const cursor = page.data.pageInfo.continueCursor;
        if (!cursor || cursor === page.data.pageInfo.cursor)
          throw new AnalyticsApiError("店舗一覧の続きを読み込めませんでした。再取得してください。", 502);
        page = await fetchShops({ cursor, limit: 50, search, date, metric }, signal);
        for (const row of page.data.rows) allRows.set(row.shopId, row);
      }
      return {
        env: first.env,
        asOf: first.data.asOf,
        scopeStatus: first.data.scopeStatus,
        rows: [...allRows.values()],
      };
    },
  });
  const data = query.data;
  useReportAnalyticsEnvironment(data?.env.label);
  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])].sort((left, right) => {
        const a = sortValue(left, sort.key);
        const b = sortValue(right, sort.key);
        if (a == null && b != null) return 1;
        if (a != null && b == null) return -1;
        const compared =
          a == null || b == null
            ? 0
            : typeof a === "number" && typeof b === "number"
              ? a - b
              : String(a).localeCompare(String(b), "ja", { numeric: true });
        return (
          compared * (sort.direction === "asc" ? 1 : -1) ||
          left.name.localeCompare(right.name, "ja") ||
          left.shopId.localeCompare(right.shopId)
        );
      }),
    [data?.rows, sort],
  );
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
          setVisibleCount(50);
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
        <AnalyticsPageLoading title="店舗を読み込み中" description="店舗一覧を取得して並べ替えています。" />
      ) : (
        data && (
          <Panel title={scoped ? "対象店舗" : "現在の店舗一覧"} description={`${formatDateTime(data.asOf)}時点`}>
            {data.scopeStatus === "outside_retention" || data.scopeStatus === "unavailable" ? (
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Description>
                  {data.scopeStatus === "outside_retention"
                    ? "店舗内訳は保存期間外です。日別の集計値は日次分析で確認できます。"
                    : "この日の内訳はまだ利用できません。集計状態を日次分析で確認してください。"}
                </Alert.Description>
              </Alert.Root>
            ) : (
              <>
                <DataTable
                  rows={rows.slice(0, visibleCount)}
                  sort={sort}
                  onSortChange={(next) => {
                    setSort(next);
                    setVisibleCount(50);
                  }}
                  getRowKey={(row) => row.shopId}
                  getRowLabel={(row) => row.name}
                  getRowHref={(row) => (row.isDeleted ? "" : shopPath(row.shopId))}
                  onNavigate={navigate}
                  emptyText="該当する店舗はありません。"
                  columns={[
                    {
                      key: "name",
                      header: "店舗",
                      sortable: true,
                      render: (row) =>
                        row.isDeleted ? (
                          <Text color="gray.600">削除済み店舗</Text>
                        ) : (
                          <Link href={shopPath(row.shopId)} fontWeight="bold" color="blue.700">
                            {row.name}
                          </Link>
                        ),
                    },
                    {
                      key: "organization",
                      header: "組織",
                      sortable: true,
                      render: (row) => row.organizationName ?? "確認できません",
                    },
                    {
                      key: "staffCount",
                      header: "スタッフ数",
                      sortable: true,
                      align: "right",
                      render: (row) => (row.staffCount == null ? "確認できません" : `${formatCount(row.staffCount)}人`),
                    },
                    {
                      key: "latestShift",
                      header: "直近のシフト",
                      sortable: true,
                      render: (row) => (row.isDeleted ? "確認できません" : formatShiftPeriod(row.latestShift)),
                    },
                    {
                      key: "registeredAt",
                      header: "登録日",
                      sortable: true,
                      render: (row) => formatDate(row.registeredAt),
                    },
                  ]}
                  renderMobileRow={(row) => (
                    <Stack gap={2}>
                      <Text fontWeight="bold">{row.isDeleted ? "削除済み店舗" : row.name}</Text>
                      <Text fontSize="sm">{row.organizationName ?? "組織を確認できません"}</Text>
                      <Text fontSize="sm">
                        スタッフ数：{row.staffCount == null ? "確認できません" : `${formatCount(row.staffCount)}人`}
                      </Text>
                      <Text fontSize="sm">
                        直近のシフト：{row.isDeleted ? "確認できません" : formatShiftPeriod(row.latestShift)}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        登録：{formatDate(row.registeredAt)}
                      </Text>
                    </Stack>
                  )}
                />
                <MoreButton
                  count={Math.min(rows.length, visibleCount)}
                  hasMore={rows.length > visibleCount}
                  loading={false}
                  onClick={() => setVisibleCount((count) => count + 50)}
                />
              </>
            )}
          </Panel>
        )
      )}
    </Stack>
  );
}
