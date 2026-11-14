import { Button, Flex, Input, Link, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchOrganizations } from "@/api/analyticsClient";
import type { AnalyticsMinStaff, AnalyticsOrganizationListRowDto, ShopBillingFilter } from "@/api/analyticsTypes";
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
  formatTotal,
  shopPath,
  sumCounts,
} from "@/features/analytics/format";
import { compareSortValues, fetchListPages, LIST_PAGE_SIZE } from "@/features/analytics/listPages";
import { NotifiedSelect, readNotified, writeNotified } from "@/features/analytics/NotifiedSelect";
import { AnalyticsPageLoading, MoreButton, Panel, QueryError } from "@/features/analytics/PageState";
import { readMinStaff, StaffCountFilter, writeMinStaff } from "@/features/analytics/StaffCountFilter";
import { AnalysisExportStatus, useAnalysisExport } from "@/features/export/useAnalysisExport";

type OrganizationFilters = {
  search: string;
  billing: ShopBillingFilter | null;
  notified: boolean;
  minStaff: AnalyticsMinStaff | null;
};

/**
 * 絞り込みはURLを正本にし、日次分析の契約状況カードから同じ条件で開けるようにする。
 * 全組織を読むと重いため、通知と人数は直近14日に通知あり・2名以上を既定にする。
 */
function readFilters(search: string): OrganizationFilters {
  const params = new URLSearchParams(search);
  const billing = params.get("billing");
  return {
    search: params.get("q") ?? "",
    billing: billing && billing in BILLING_FILTER_LABELS ? (billing as ShopBillingFilter) : null,
    notified: readNotified(params),
    minStaff: readMinStaff(params),
  };
}
function filtersPath(filters: OrganizationFilters) {
  const params = new URLSearchParams();
  if (filters.billing) params.set("billing", filters.billing);
  writeNotified(params, filters.notified);
  writeMinStaff(params, filters.minStaff);
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
    case "lastNotified":
      return row.lastNotifiedAt;
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
        fetchOrganizations(
          {
            search: filters.search,
            billing: filters.billing,
            notified: filters.notified || undefined,
            minStaff: filters.minStaff,
            cursor,
            limit: LIST_PAGE_SIZE,
          },
          signal,
        ),
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
        compareSortValues(sortValue(left, sort.key), sortValue(right, sort.key), sort.direction) ||
        left.name.localeCompare(right.name, "ja") ||
        left.organizationId.localeCompare(right.organizationId),
    );
  }, [query.data?.pages, sort]);
  const totals = useMemo(
    () => ({
      people: sumCounts(
        rows.map((row) => row.peopleCount),
        query.hasNextPage,
      ),
      managers: sumCounts(
        rows.map((row) => row.activeManagerCount),
        query.hasNextPage,
      ),
    }),
    [rows, query.hasNextPage],
  );
  const setFilters = (next: Partial<OrganizationFilters>) => navigate(filtersPath({ ...filters, ...next }));
  const analysisExport = useAnalysisExport();
  // 自動で読む上限に達して続きがある場合も、条件に合う全組織を読み切ってから出力する。
  const exportOrganizations = () =>
    void analysisExport.start(async (signal) => {
      let pages = query.data?.pages ?? [];
      if (query.hasNextPage) {
        // 取得に失敗しても続きがあるとhasNextPageが残るため、失敗時はthrowして出力を止める。
        const fetchNext = () => query.fetchNextPage({ throwOnError: true });
        let result = await fetchNext();
        while (result.hasNextPage && !signal.aborted) result = await fetchNext();
        pages = result.data?.pages ?? pages;
      }
      signal.throwIfAborted();
      return {
        scope: {
          kind: "organizationList",
          filters: {
            hasNameSearch: filters.search !== "",
            billing: filters.billing,
            notified: filters.notified,
            minStaff: filters.minStaff,
          },
        },
        organizationIds: [...new Set(pages.flatMap((page) => page.rows).map((row) => row.organizationId))],
      };
    });
  const exportOrganization = (organizationId: string) =>
    void analysisExport.start(async () => ({ scope: { kind: "organization" }, organizationIds: [organizationId] }));
  const exportButton = (row: AnalyticsOrganizationListRowDto) => (
    <Button
      size="xs"
      variant="outline"
      aria-label={`${row.name}の分析用JSONを保存`}
      disabled={analysisExport.isRunning}
      onClick={() => exportOrganization(row.organizationId)}
    >
      JSON
    </Button>
  );
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
          <NotifiedSelect
            value={filters.notified}
            onChange={(notified) => setFilters({ search: input.trim(), notified })}
          />
          <StaffCountFilter
            value={filters.minStaff}
            onChange={(minStaff) => setFilters({ search: input.trim(), minStaff })}
          />
          <Button type="submit">絞り込む</Button>
        </Flex>
      </form>
      {filters.notified && (
        <Text color="gray.600" fontSize="sm">
          直近14日に、組織または所属店舗の通知を受け付けた組織です。送信に失敗した通知も含め、取り消した通知は含めません。
        </Text>
      )}
      {filters.minStaff !== null && (
        <Text color="gray.600" fontSize="sm">
          管理者を含む利用人数が{filters.minStaff}名以上の組織です。
          {filters.minStaff === 2 ? "管理者だけの組織を除きます。" : ""}
        </Text>
      )}
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending ? (
        <AnalyticsPageLoading
          title="組織を読み込み中"
          description="並べ替えに使うため、該当する組織をすべて取得しています。組織が多いと時間がかかります。"
        />
      ) : (
        first && (
          <Panel
            title={filters.billing ? `契約が「${BILLING_FILTER_LABELS[filters.billing]}」の組織` : "現在の組織一覧"}
            aside={
              <Text color="gray.700" fontSize="sm" fontWeight="bold">
                {formatTotal({ total: rows.length, isLowerBound: query.hasNextPage }, "組織")}・利用人数{" "}
                {formatTotal(totals.people, "人")}・管理者 {formatTotal(totals.managers, "人")}
              </Text>
            }
            description={`${formatDateTime(first.data.asOf)}時点。絞り込みと並べ替えは全組織が対象です。利用人数はプラン上限と同じ数え方で、管理者を含み、複数店舗に所属する人も1人と数えます。人数を確認できない組織があると、合計は「以上」と表示します。`}
          >
            <Flex justify="space-between" align="center" gap={3} wrap="wrap">
              <Text fontSize="xs" color="gray.600">
                条件に合う全組織と各組織の全店舗を、分析用JSONで保存できます。組織・店舗・スタッフ・ユーザーはDBのIDで出力し、名前は含めません。行の「JSON」はその組織だけを保存します。
              </Text>
              <Button
                size="sm"
                variant="outline"
                disabled={analysisExport.isRunning || (rows.length === 0 && !query.hasNextPage)}
                onClick={exportOrganizations}
              >
                分析用JSONを保存
              </Button>
            </Flex>
            <AnalysisExportStatus state={analysisExport.state} onClose={analysisExport.close} />
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
                  key: "lastNotified",
                  header: "最終通知",
                  sortable: true,
                  firstDirection: "desc",
                  render: (row) => formatDateTime(row.lastNotifiedAt),
                },
                {
                  key: "registeredAt",
                  header: "登録日",
                  sortable: true,
                  render: (row) => formatDate(row.registeredAt),
                },
                { key: "export", header: "分析用", render: exportButton },
              ]}
              renderMobileRow={(row) => (
                <Stack gap={2}>
                  <Text fontWeight="bold">{row.name}</Text>
                  <Text fontSize="sm">契約：{billingLabel(row.billing)}</Text>
                  <Text fontSize="sm">
                    利用人数：{countLabel(row.peopleCount)}・管理者：{countLabel(row.activeManagerCount)}
                  </Text>
                  <ShopLinks row={row} />
                  <Text fontSize="sm">最終通知：{formatDateTime(row.lastNotifiedAt)}</Text>
                  <Flex justify="space-between" align="center" gap={2}>
                    <Text fontSize="xs" color="gray.600">
                      登録：{formatDate(row.registeredAt)}
                    </Text>
                    {exportButton(row)}
                  </Flex>
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
