import { Stack } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchFeatureRequests } from "@/api/analyticsClient";
import { PageHeading } from "@/components/PageHeading";
import { DataStatus, mergeMetadata } from "@/features/analytics/DataStatus";
import { analyticsErrorMessage } from "@/features/analytics/PageState";
import { RequestsView } from "@/features/requests/RequestsView";

export function RequestsPage() {
  const query = useInfiniteQuery({
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchFeatureRequests({ cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) =>
      lastPage.data.pageInfo.isDone ? undefined : (lastPage.data.pageInfo.continueCursor ?? undefined),
    queryKey: ["analytics", "requests"],
  });
  const pages = query.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.data.rows);
  const firstPage = pages[0];
  const metadata = firstPage
    ? mergeMetadata(firstPage.data.metadata, ...pages.slice(1).map((page) => page.data.metadata))
    : undefined;
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description="分析モデルとは独立した、ログイン後の要望フォームから届いた内容です。" title="要望" />
      <DataStatus envLabel={firstPage?.env.label} isLoading={query.isLoading} metadata={metadata} />
      <RequestsView
        errorMessage={query.error ? analyticsErrorMessage(query.error) : null}
        hasMore={query.hasNextPage === true}
        isLoading={query.isLoading}
        isLoadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        rows={rows}
      />
    </Stack>
  );
}
