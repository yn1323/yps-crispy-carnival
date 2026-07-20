import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";

const INITIAL_NOTIFICATION_HISTORY_COUNT = 3;
const NOTIFICATION_HISTORY_PAGE_SIZE = 10;

export function useStaffNotificationHistory(staffId: Id<"staffs">, enabled: boolean) {
  const query = useShopPaginatedQuery(
    api.notificationOutbox.queries.listStaffNotificationHistory,
    enabled ? { staffId } : "skip",
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
