// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  loadMore: vi.fn(),
  useShopPaginatedQuery: vi.fn(),
}));

vi.mock("@/src/hooks/useShopPaginatedQuery", () => ({
  useShopPaginatedQuery: mocks.useShopPaginatedQuery,
}));

import { useStaffNotificationHistory } from "./useStaffNotificationHistory";

const staffId = "staff-1" as Id<"staffs">;

beforeEach(() => {
  mocks.loadMore.mockReset();
  mocks.useShopPaginatedQuery.mockReset();
  mocks.useShopPaginatedQuery.mockReturnValue({
    results: [],
    status: "CanLoadMore",
    loadMore: mocks.loadMore,
  });
});

describe("useStaffNotificationHistory", () => {
  it("初回は3件を取得し、もっと見るでは10件を追加取得する", () => {
    const { result } = renderHook(() => useStaffNotificationHistory(staffId, true));

    expect(mocks.useShopPaginatedQuery).toHaveBeenCalledWith(expect.anything(), { staffId }, { initialNumItems: 3 });

    result.current.onLoadMore();

    expect(mocks.loadMore).toHaveBeenCalledOnce();
    expect(mocks.loadMore).toHaveBeenCalledWith(10);
  });
});
