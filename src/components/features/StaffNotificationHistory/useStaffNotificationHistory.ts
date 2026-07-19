import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";

const NOTIFICATION_HISTORY_PAGE_SIZE = 20;

export function useStaffNotificationHistory(staffId: Id<"staffs">, enabled: boolean) {
  const query = useShopPaginatedQuery(
    api.notificationOutbox.queries.listStaffNotificationHistory,
    enabled ? { staffId } : "skip",
    { initialNumItems: NOTIFICATION_HISTORY_PAGE_SIZE },
  );

  return {
    items: enabled ? query.results : [],
    isLoading: enabled && query.status === "LoadingFirstPage",
    canLoadMore: query.status === "CanLoadMore" || query.status === "LoadingMore",
    isLoadingMore: query.status === "LoadingMore",
    onLoadMore: () => query.loadMore(NOTIFICATION_HISTORY_PAGE_SIZE),
  };
}
