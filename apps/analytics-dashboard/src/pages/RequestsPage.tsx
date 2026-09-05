import { Stack } from "@chakra-ui/react";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { fetchFeatureRequests, setFeatureRequestDeleted } from "@/api/analyticsClient";
import type { AnalyticsApiEnvelope, FeatureRequestsResponse } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { PageHeading } from "@/components/PageHeading";
import { analyticsErrorMessage } from "@/features/analytics/PageState";
import { RequestsView } from "@/features/requests/RequestsView";

const QUERY_KEY = ["analytics", "requests"] as const;
export function RequestsPage() {
  const client = useQueryClient();
  const saving = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const query = useInfiniteQuery({
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchFeatureRequests({ cursor: pageParam, limit: 50 }, signal),
    getNextPageParam: (lastPage) =>
      lastPage.data.pageInfo.isDone ? undefined : (lastPage.data.pageInfo.continueCursor ?? undefined),
    queryKey: QUERY_KEY,
  });
  const pages = query.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.data.rows);
  useReportAnalyticsEnvironment(pages[0]?.env.label);
  const update = async (id: string, isDeleted: boolean) => {
    if (saving.current.has(id)) return;
    saving.current.add(id);
    setPending(new Set(saving.current));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    await client.cancelQueries({ queryKey: QUERY_KEY });
    try {
      const result = await setFeatureRequestDeleted(id, isDeleted);
      await client.cancelQueries({ queryKey: QUERY_KEY });
      client.setQueriesData<InfiniteData<AnalyticsApiEnvelope<FeatureRequestsResponse>>>(
        { queryKey: QUERY_KEY },
        (previous) =>
          previous && {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              data: {
                ...page.data,
                rows: page.data.rows.map((row) =>
                  row.id === result.data.id ? { ...row, isDeleted: result.data.isDeleted } : row,
                ),
              },
            })),
          },
      );
    } catch {
      // 通信断では更新が成功済みの可能性があるため、確定値を再取得する。
      const refreshed = await query.refetch();
      setErrors((previous) => ({
        ...previous,
        [id]: refreshed.error
          ? "保存結果と現在の状態を確認できません。再取得してからお試しください。"
          : "保存結果を確認できなかったため、現在の状態を再取得しました。必要ならもう一度操作してください。",
      }));
    } finally {
      saving.current.delete(id);
      setPending(new Set(saving.current));
    }
  };
  return (
    <Stack gap={6}>
      <PageHeading
        description="届いた要望を新しい順に表示します。チェックしても一覧に残り、チェックを外すと元に戻せます。"
        title="届いた要望"
      />
      <RequestsView
        errorMessage={query.error ? analyticsErrorMessage(query.error) : null}
        hasMore={query.hasNextPage}
        isLoading={query.isLoading}
        isLoadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        rows={rows}
        pending={pending}
        errors={errors}
        onSetDeleted={(id, value) => void update(id, value)}
      />
    </Stack>
  );
}
