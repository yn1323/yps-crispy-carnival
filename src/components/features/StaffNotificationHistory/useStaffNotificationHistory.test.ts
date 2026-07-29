// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  historyRef: Symbol("notificationHistory"),
  loadMore: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    notificationOutbox: {
      queries: { listStaffNotificationHistory: mocks.historyRef },
    },
  },
}));

vi.mock("convex/react", () => ({ usePaginatedQuery: mocks.usePaginatedQuery }));

import { useStaffNotificationHistory } from "./useStaffNotificationHistory";

const shopId = "shop-target" as Id<"shops">;
const staffId = "staff-1" as Id<"staffs">;

beforeEach(() => {
  mocks.loadMore.mockReset();
  mocks.usePaginatedQuery.mockReset();
  mocks.usePaginatedQuery.mockReturnValue({
    results: [],
    status: "CanLoadMore",
    loadMore: mocks.loadMore,
  });
});

describe("useStaffNotificationHistory", () => {
  it("対象店舗を明示して初回3件を取得し、もっと見るでは10件を追加取得する", () => {
    const { result } = renderHook(() => useStaffNotificationHistory(shopId, staffId, true));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      mocks.historyRef,
      { shopId: "shop-target", staffId: "staff-1" },
      { initialNumItems: 3 },
    );

    result.current.onLoadMore();

    expect(mocks.loadMore).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("無効時はtargetShopIdを含むqueryを送らずskipする", () => {
    const { result } = renderHook(() => useStaffNotificationHistory(shopId, staffId, false));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(mocks.historyRef, "skip", { initialNumItems: 3 });
    expect(result.current.items).toEqual([]);
  });
});
