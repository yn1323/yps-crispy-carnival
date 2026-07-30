import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const INITIAL_NOTIFICATION_HISTORY_COUNT = 3;
const NOTIFICATION_HISTORY_PAGE_SIZE = 10;

export function useStaffNotificationHistory(shopId: Id<"shops">, staffId: Id<"staffs">, enabled: boolean) {
  const targetKey = `${shopId}:${staffId}:${enabled}`;
  const [displayState, setDisplayState] = useState({
    targetKey,
    visibleCount: INITIAL_NOTIFICATION_HISTORY_COUNT,
  });
  const visibleCount =
    displayState.targetKey === targetKey ? displayState.visibleCount : INITIAL_NOTIFICATION_HISTORY_COUNT;
  const query = usePaginatedQuery(
    api.notificationOutbox.queries.listStaffNotificationHistory,
    enabled ? { shopId, staffId } : "skip",
    { initialNumItems: INITIAL_NOTIFICATION_HISTORY_COUNT + 1 },
  );
  const hasBufferedItem = query.results.length > visibleCount;
  const canLoadMore = enabled && (hasBufferedItem || query.status === "CanLoadMore" || query.status === "LoadingMore");

  const handleLoadMore = () => {
    if (!enabled || query.status === "LoadingFirstPage" || query.status === "LoadingMore") return;

    const nextVisibleCount = visibleCount + NOTIFICATION_HISTORY_PAGE_SIZE;
    setDisplayState({ targetKey, visibleCount: nextVisibleCount });

    const additionalCount = Math.max(0, nextVisibleCount + 1 - query.results.length);
    if (additionalCount > 0 && query.status === "CanLoadMore") {
      query.loadMore(additionalCount);
    }
  };

  return {
    items: enabled ? query.results.slice(0, visibleCount) : [],
    isLoading: enabled && query.status === "LoadingFirstPage",
    canLoadMore,
    isLoadingMore: query.status === "LoadingMore",
    onLoadMore: handleLoadMore,
  };
}
