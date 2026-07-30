import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const INITIAL_NOTIFICATION_HISTORY_COUNT = 3;
const NOTIFICATION_HISTORY_PAGE_SIZE = 10;

export function useStaffNotificationHistory(shopId: Id<"shops">, staffId: Id<"staffs">, enabled: boolean) {
  const query = usePaginatedQuery(
    api.notificationOutbox.queries.listStaffNotificationHistory,
    enabled ? { shopId, staffId } : "skip",
    { initialNumItems: INITIAL_NOTIFICATION_HISTORY_COUNT },
  );

  return {
    items: enabled ? query.results : [],
    isLoading: enabled && query.status === "LoadingFirstPage",
    canLoadMore: query.status === "CanLoadMore" || query.status === "LoadingMore",
    isLoadingMore: query.status === "LoadingMore",
    onLoadMore: () => query.loadMore(NOTIFICATION_HISTORY_PAGE_SIZE),
  };
}
