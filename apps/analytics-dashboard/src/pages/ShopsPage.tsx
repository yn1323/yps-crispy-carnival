import { Alert, Badge, Button, Flex, Input, Link, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { isShopScopeRange } from "@convex/analyticsDashboard/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchShops, type ShopSearchParams } from "@/api/analyticsClient";
import type { AnalyticsMetric, AnalyticsShopListRowDto, ShopBillingFilter } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable, type DataTableSort } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import {
  ATTENTION_LABELS,
  BILLING_FILTER_LABELS,
  billingLabel,
  formatCount,
  formatDate,
  formatDateTime,
  formatShiftPeriod,
  METRICS,
  shopPath,
} from "@/features/analytics/format";
import { AnalyticsPageLoading, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";

/** APIは1回で20店舗まで確認する。条件に合う店舗が少ないときは、続きを数回まで自動で読む。 */
const PAGE_SIZE = 20;
const AUTO_CONTINUE_REQUESTS = 5;
const MIN_ROWS_PER_LOAD = 20;

type ShopScope = { from: string; to: string; metric: AnalyticsMetric };
type ShopFilters = {
  search: string;
  scope: ShopScope | null;
  billing: ShopBillingFilter | null;
  attention: boolean;
};

/** 絞り込みはURLを正本にし、日次分析のカードやグラフから同じ条件で開けるようにする。 */
function readFilters(search: string): ShopFilters {
  const params = new URLSearchParams(search);
  const date = params.get("date");
  const from = date ?? params.get("from");
  const to = date ?? params.get("to");
  const metric = METRICS.find((item) => item.key === params.get("metric"))?.key ?? null;
  const billing = params.get("billing");
  // 手入力された不正な条件で画面を壊さず、条件なしの一覧として扱う。
  const scope = from && to && metric && isShopScopeRange(from, to) ? { from, to, metric } : null;
  return {
    search: params.get("q") ?? "",
    scope,
    billing: !scope && billing && billing in BILLING_FILTER_LABELS ? (billing as ShopBillingFilter) : null,
    attention: !scope && params.get("attention") === "1",
  };
}
function filtersPath(filters: ShopFilters) {
  const params = new URLSearchParams();
  if (filters.scope) {
    if (filters.scope.from === filters.scope.to) params.set("date", filters.scope.from);
    else {
      params.set("from", filters.scope.from);
      params.set("to", filters.scope.to);
    }
    params.set("metric", filters.scope.metric);
  } else {
    if (filters.billing) params.set("billing", filters.billing);
    if (filters.attention) params.set("attention", "1");
  }
  if (filters.search) params.set("q", filters.search);
  return params.size ? `/shops?${params}` : "/shops";
}
function requestParams(filters: ShopFilters): ShopSearchParams {
  return filters.scope
    ? { search: filters.search, ...filters.scope }
    : { search: filters.search, billing: filters.billing, attention: filters.attention || undefined };
}
function scopeLabel(scope: ShopScope) {
  const metric = METRICS.find((item) => item.key === scope.metric)?.label ?? "指標を確認してください";
  const period =
    scope.from === scope.to ? formatDate(scope.from) : `${formatDate(scope.from)}〜${formatDate(scope.to)}`;
  return `${period}・${metric}`;
}

function AttentionBadges({ row }: { row: AnalyticsShopListRowDto }) {
  if (row.attention.length === 0) return null;
  return (
    <Flex gap={1} wrap="wrap">
      {row.attention.map((reason) => (
        <Badge key={reason} colorPalette="orange" variant="subtle">
          {ATTENTION_LABELS[reason]}
        </Badge>
      ))}
    </Flex>
  );
}

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
    case "billing":
      return row.billing ? billingLabel(row.billing) : null;
    case "lastActivity":
      return row.lastActivityDate;
    default:
      return row.latestShift ? `${row.latestShift.periodStart}/${row.latestShift.periodEnd}` : null;
  }
}

export function ShopsPage({ navigate }: { navigate: (path: string) => void }) {
  const filters = readFilters(window.location.search);
  const scoped = filters.scope !== null;
  const [input, setInput] = useState(filters.search);
  // APIの返す順（登録の新しい順）を既定にし、続きを読んでも表示済みの行が並び替わらないようにする。
  const [sort, setSort] = useState<DataTableSort>({ key: "registeredAt", direction: "desc" });
  const query = useInfiniteQuery({
    queryKey: ["analytics", "shops", filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      let cursor = pageParam;
      const rows: AnalyticsShopListRowDto[] = [];
      for (let request = 0; ; request += 1) {
        const page = await fetchShops({ ...requestParams(filters), cursor, limit: PAGE_SIZE }, signal);
        rows.push(...page.data.rows);
        const next = page.data.pageInfo.continueCursor;
        const done = page.data.pageInfo.isDone || next === null || next === cursor;
        cursor = next;
        if (done || rows.length >= MIN_ROWS_PER_LOAD || request + 1 >= AUTO_CONTINUE_REQUESTS)
          return { env: page.env, data: page.data, rows, nextCursor: done ? null : cursor };
      }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const rows = useMemo(() => {
    const unique = new Map((query.data?.pages ?? []).flatMap((page) => page.rows).map((row) => [row.shopId, row]));
    return [...unique.values()].sort((left, right) => {
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
    });
  }, [query.data?.pages, sort]);
  const scopeStatus = first?.data.scopeStatus;
  const setFilters = (next: Partial<ShopFilters>) => navigate(filtersPath({ ...filters, ...next }));
  return (
    <Stack gap={6}>
      <PageHeading
        title={scoped ? "実績の店舗内訳" : "店舗・スタッフ"}
        description={
          scoped
            ? "実績があった店舗を表示します。期間内に何日実績があっても1店舗です。名称・組織は現在の情報です。"
            : "現在の店舗を調べ、店舗・スタッフの詳細へ進めます。日次集計を待たずに利用できます。"
        }
      />
      {filters.scope && (
        <Flex bg="white" p={4} borderRadius="lg" align="center" gap={3} justify="space-between" wrap="wrap">
          <Text fontWeight="bold">{scopeLabel(filters.scope)}</Text>
          <Button variant="outline" size="sm" onClick={() => navigate("/shops")}>
            条件を解除して現在の店舗へ
          </Button>
        </Flex>
      )}
      {!scoped && (
        <Flex gap={2} role="group" aria-label="表示する店舗" wrap="wrap">
          <Button
            size="sm"
            variant={filters.attention ? "outline" : "solid"}
            aria-pressed={!filters.attention}
            onClick={() => setFilters({ attention: false })}
          >
            すべての店舗
          </Button>
          <Button
            size="sm"
            variant={filters.attention ? "solid" : "outline"}
            aria-pressed={filters.attention}
            onClick={() => setFilters({ attention: true })}
          >
            要注意の店舗
          </Button>
        </Flex>
      )}
      {filters.attention && (
        <Text color="gray.600" fontSize="sm">
          最新の募集期間が終わって次の募集がない店舗と、最後の提出・確定から14日以上たった店舗です。最終利用日は計測開始後の記録から求めます。
        </Text>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: input.trim() });
        }}
      >
        <Flex gap={3} wrap="wrap" align="end">
          <Text as="label" flex="1" minW="240px" maxW="lg" fontSize="xs" color="gray.700" fontWeight="bold">
            店舗名
            <Input
              mt={1}
              bg="white"
              maxLength={100}
              placeholder="店舗名の一部"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </Text>
          {!scoped && (
            <Text as="label" minW={{ base: "full", md: "220px" }} fontSize="xs" color="gray.700" fontWeight="bold">
              契約
              <NativeSelect.Root mt={1}>
                <NativeSelect.Field
                  bg="white"
                  value={filters.billing ?? ""}
                  onChange={(event) =>
                    setFilters({
                      search: input.trim(),
                      billing: (event.target.value || null) as ShopBillingFilter | null,
                    })
                  }
                >
                  <option value="">すべて</option>
                  {(Object.entries(BILLING_FILTER_LABELS) as [ShopBillingFilter, string][]).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Text>
          )}
          <Button type="submit">絞り込む</Button>
        </Flex>
      </form>
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending ? (
        <AnalyticsPageLoading title="店舗を読み込み中" description="店舗一覧の最初のページを取得しています。" />
      ) : (
        first && (
          <Panel
            title={
              scoped
                ? "対象店舗"
                : filters.billing
                  ? `契約が「${BILLING_FILTER_LABELS[filters.billing]}」の店舗`
                  : "現在の店舗一覧"
            }
            description={`${formatDateTime(first.data.asOf)}時点。${scoped ? "" : "登録の新しい順に読み込みます。"}並べ替えは読み込んだ店舗の中で行います。`}
          >
            {scopeStatus === "outside_retention" || scopeStatus === "unavailable" ? (
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Description>
                  {scopeStatus === "outside_retention"
                    ? "店舗内訳は保存期間外です。日別の集計値は日次分析で確認できます。"
                    : "この期間の内訳はまだ利用できません。未集計・失敗の日がないか日次分析で確認してください。"}
                </Alert.Description>
              </Alert.Root>
            ) : (
              <>
                <DataTable
                  rows={rows}
                  sort={sort}
                  onSortChange={setSort}
                  getRowKey={(row) => row.shopId}
                  getRowLabel={(row) => row.name}
                  getRowHref={(row) => (row.isDeleted ? "" : shopPath(row.shopId))}
                  onNavigate={navigate}
                  emptyText={
                    query.hasNextPage
                      ? "確認した範囲に該当する店舗はありません。続きを確認してください。"
                      : filters.attention
                        ? "要注意の店舗はありません。"
                        : "該当する店舗はありません。"
                  }
                  columns={[
                    {
                      key: "name",
                      header: "店舗",
                      sortable: true,
                      render: (row) =>
                        row.isDeleted ? (
                          <Text color="gray.600">削除済み店舗</Text>
                        ) : (
                          <Stack gap={1}>
                            <Link href={shopPath(row.shopId)} fontWeight="bold" color="blue.700">
                              {row.name}
                            </Link>
                            <AttentionBadges row={row} />
                          </Stack>
                        ),
                    },
                    {
                      key: "organization",
                      header: "組織",
                      sortable: true,
                      render: (row) => row.organizationName ?? "確認できません",
                    },
                    {
                      key: "billing",
                      header: "契約",
                      sortable: true,
                      render: (row) => billingLabel(row.billing),
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
                      key: "lastActivity",
                      header: "最終利用",
                      sortable: true,
                      render: (row) => formatDate(row.lastActivityDate),
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
                      <AttentionBadges row={row} />
                      <Text fontSize="sm">{row.organizationName ?? "組織を確認できません"}</Text>
                      <Text fontSize="sm">契約：{billingLabel(row.billing)}</Text>
                      <Text fontSize="sm">
                        スタッフ数：{row.staffCount == null ? "確認できません" : `${formatCount(row.staffCount)}人`}
                      </Text>
                      <Text fontSize="sm">
                        直近のシフト：{row.isDeleted ? "確認できません" : formatShiftPeriod(row.latestShift)}
                      </Text>
                      <Text fontSize="sm">最終利用：{formatDate(row.lastActivityDate)}</Text>
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
