import { Stack } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchFeatureRequests } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { PageHeading } from "@/components/PageHeading";
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
  useReportAnalyticsEnvironment(firstPage?.env.label);
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading description="要望フォームから届いた内容を新しい順に表示します。" title="届いた要望" />
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
