import { Button, Flex, Input, Link, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchOrganizations } from "@/api/analyticsClient";
import type { AnalyticsOrganizationListRowDto, ShopBillingFilter } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable, type DataTableSort } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import { DirectoryTabs } from "@/features/analytics/DirectoryTabs";
import {
  BILLING_FILTER_LABELS,
  billingLabel,
  formatCount,
  formatDate,
  formatDateTime,
  shopPath,
} from "@/features/analytics/format";
import { compareSortValues, fetchListPages, LIST_PAGE_SIZE } from "@/features/analytics/listPages";
import { AnalyticsPageLoading, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";

type OrganizationFilters = { search: string; billing: ShopBillingFilter | null };

/** 絞り込みはURLを正本にし、日次分析の契約状況カードから同じ条件で開けるようにする。 */
function readFilters(search: string): OrganizationFilters {
  const params = new URLSearchParams(search);
  const billing = params.get("billing");
  return {
    search: params.get("q") ?? "",
    billing: billing && billing in BILLING_FILTER_LABELS ? (billing as ShopBillingFilter) : null,
  };
}
function filtersPath(filters: OrganizationFilters) {
  const params = new URLSearchParams();
  if (filters.billing) params.set("billing", filters.billing);
  if (filters.search) params.set("q", filters.search);
  return params.size ? `/organizations?${params}` : "/organizations";
}

function countLabel(value: number | null) {
  return value == null ? "確認できません" : `${formatCount(value)}人`;
}

function sortValue(row: AnalyticsOrganizationListRowDto, key: string) {
  switch (key) {
    case "name":
      return row.name;
    case "billing":
      return row.billing ? billingLabel(row.billing) : null;
    case "peopleCount":
      return row.peopleCount;
    case "activeManagerCount":
      return row.activeManagerCount;
    case "shopCount":
      return row.shopCount;
    default:
      return row.registeredAt;
  }
}

function ShopLinks({ row }: { row: AnalyticsOrganizationListRowDto }) {
  if (row.shops.length === 0) return <Text color="gray.600">店舗なし</Text>;
  const hidden = row.shopCount == null ? 0 : row.shopCount - row.shops.length;
  return (
    <Stack gap={1}>
      {row.shops.map((shop) => (
        <Link key={shop.shopId} href={shopPath(shop.shopId)} color="blue.700" fontWeight="bold">
          {shop.name}
        </Link>
      ))}
      {hidden > 0 && (
        <Text color="gray.600" fontSize="xs">
          ほか{formatCount(hidden)}店舗
        </Text>
      )}
    </Stack>
  );
}

export function OrganizationsPage({ navigate }: { navigate: (path: string) => void }) {
  const filters = readFilters(window.location.search);
  const [input, setInput] = useState(filters.search);
  // APIの返す順（登録の新しい順）を既定にし、続きを読んでも表示済みの行が並び替わらないようにする。
  const [sort, setSort] = useState<DataTableSort>({ key: "registeredAt", direction: "desc" });
  const query = useInfiniteQuery({
    queryKey: ["analytics", "organizations", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchListPages(pageParam, (cursor) =>
        fetchOrganizations({ search: filters.search, billing: filters.billing, cursor, limit: LIST_PAGE_SIZE }, signal),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const rows = useMemo(() => {
    const unique = new Map(
      (query.data?.pages ?? []).flatMap((page) => page.rows).map((row) => [row.organizationId, row]),
    );
    return [...unique.values()].sort(
      (left, right) =>
        compareSortValues(sortValue(left, sort.key), sortValue(right, sort.key)) *
          (sort.direction === "asc" ? 1 : -1) ||
        left.name.localeCompare(right.name, "ja") ||
        left.organizationId.localeCompare(right.organizationId),
    );
  }, [query.data?.pages, sort]);
  const setFilters = (next: Partial<OrganizationFilters>) => navigate(filtersPath({ ...filters, ...next }));
  return (
    <Stack gap={6}>
      <PageHeading
        title="組織・店舗"
        description="現在の組織を調べ、契約・利用人数・店舗を確認できます。日次集計を待たずに利用できます。"
      />
      <DirectoryTabs active="organizations" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: input.trim() });
        }}
      >
        <Flex gap={3} wrap="wrap" align="end">
          <Text as="label" flex="1" minW="240px" maxW="lg" fontSize="xs" color="gray.700" fontWeight="bold">
            組織名・店舗名
            <Input
              mt={1}
              bg="white"
              maxLength={100}
              placeholder="組織名・店舗名の一部"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </Text>
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
          <Button type="submit">絞り込む</Button>
        </Flex>
      </form>
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending ? (
        <AnalyticsPageLoading title="組織を読み込み中" description="組織一覧の最初のページを取得しています。" />
      ) : (
        first && (
          <Panel
            title={filters.billing ? `契約が「${BILLING_FILTER_LABELS[filters.billing]}」の組織` : "現在の組織一覧"}
            description={`${formatDateTime(first.data.asOf)}時点。絞り込みは全組織が対象です。登録の新しい順に読み込み、並べ替えは読み込んだ組織の中で行います。利用人数はプラン上限と同じ数え方で、管理者を含み、複数店舗に所属する人も1人と数えます。`}
          >
            <DataTable
              rows={rows}
              sort={sort}
              onSortChange={setSort}
              getRowKey={(row) => row.organizationId}
              emptyText={
                query.hasNextPage
                  ? "確認した範囲に該当する組織はありません。続きを確認してください。"
                  : "該当する組織はありません。"
              }
              columns={[
                {
                  key: "name",
                  header: "組織",
                  sortable: true,
                  render: (row) => <Text fontWeight="bold">{row.name}</Text>,
                },
                { key: "billing", header: "契約", sortable: true, render: (row) => billingLabel(row.billing) },
                {
                  key: "peopleCount",
                  header: "利用人数",
                  sortable: true,
                  align: "right",
                  render: (row) => countLabel(row.peopleCount),
                },
                {
                  key: "activeManagerCount",
                  header: "管理者",
                  sortable: true,
                  align: "right",
                  render: (row) => countLabel(row.activeManagerCount),
                },
                { key: "shopCount", header: "店舗", sortable: true, render: (row) => <ShopLinks row={row} /> },
                {
                  key: "registeredAt",
                  header: "登録日",
                  sortable: true,
                  render: (row) => formatDate(row.registeredAt),
                },
              ]}
              renderMobileRow={(row) => (
                <Stack gap={2}>
                  <Text fontWeight="bold">{row.name}</Text>
                  <Text fontSize="sm">契約：{billingLabel(row.billing)}</Text>
                  <Text fontSize="sm">
                    利用人数：{countLabel(row.peopleCount)}・管理者：{countLabel(row.activeManagerCount)}
                  </Text>
                  <ShopLinks row={row} />
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
          </Panel>
        )
      )}
    </Stack>
  );
}
