// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { FunctionReference, PaginationResult } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestQuery = FunctionReference<
  "query",
  "public",
  { label: string; shopId: string; paginationOpts: { numItems: number; cursor: string | null } },
  PaginationResult<{ name: string }>
>;

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "LoadingFirstPage", loadMore: vi.fn() })),
  selectedShop: null as { shopId: string; shopName: string } | null,
}));

vi.mock("convex-helpers/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useShopCustomPaginatedQuery } from "./useShopCustomPaginatedQuery";

const queryRef = {} as TestQuery;
const options = { initialNumItems: 10 };

beforeEach(() => {
  mocks.usePaginatedQuery.mockClear();
  mocks.selectedShop = null;
});

describe("useShopCustomPaginatedQuery", () => {
  it("選択中の店舗IDをcustom paginated query引数へ注入する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopCustomPaginatedQuery(queryRef, { label: "募集A" }, options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, { label: "募集A", shopId: "shop-1" }, options);
  });

  it("店舗が未選択ならcustom paginated queryをskipする", () => {
    renderHook(() => useShopCustomPaginatedQuery(queryRef, { label: "募集A" }, options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, "skip", options);
  });

  it("呼び出し側のskipを維持する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopCustomPaginatedQuery(queryRef, "skip", options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, "skip", options);
  });

  it("店舗選択が変わった後は最新の店舗IDを使う", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };
    const { rerender } = renderHook(() => useShopCustomPaginatedQuery(queryRef, { label: "募集A" }, options));

    mocks.selectedShop = { shopId: "shop-2", shopName: "新宿店" };
    rerender();

    expect(mocks.usePaginatedQuery).toHaveBeenNthCalledWith(1, queryRef, { label: "募集A", shopId: "shop-1" }, options);
    expect(mocks.usePaginatedQuery).toHaveBeenNthCalledWith(2, queryRef, { label: "募集A", shopId: "shop-2" }, options);
  });
});
