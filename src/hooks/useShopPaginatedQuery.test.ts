// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { FunctionReference, PaginationResult } from "convex/server";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";

type TestQuery = FunctionReference<
  "query",
  "public",
  {
    label: string;
    shopId: string;
    expectedOrganizationId?: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  PaginationResult<{ name: string }>
>;

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "LoadingFirstPage", loadMore: vi.fn() })),
  selectedShop: null as { shopId: string; shopName: string } | null,
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useShopPaginatedQuery } from "./useShopPaginatedQuery";

const queryRef = {} as TestQuery;
const options = { initialNumItems: 10 };

beforeEach(() => {
  mocks.usePaginatedQuery.mockClear();
  mocks.selectedShop = null;
});

describe("useShopPaginatedQuery", () => {
  it("選択中の店舗IDをpaginated query引数へ注入する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopPaginatedQuery(queryRef, { label: "募集A" }, options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, { label: "募集A", shopId: "shop-1" }, options);
  });

  it("店舗が未選択ならpaginated queryをskipする", () => {
    renderHook(() => useShopPaginatedQuery(queryRef, { label: "募集A" }, options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, "skip", options);
  });

  it("app routeの明示scopeを保存済み店舗より優先する", () => {
    mocks.selectedShop = { shopId: "stale-shop", shopName: "別組織の店舗" };

    renderHook(() => useShopPaginatedQuery(queryRef, { label: "募集A" }, options), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(ManagerShopScopeProvider, {
          shopId: "shop-app",
          expectedOrganizationId: "organization-app",
          children,
        }),
    });

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      queryRef,
      { label: "募集A", shopId: "shop-app", expectedOrganizationId: "organization-app" },
      options,
    );
  });

  it("呼び出し側のskipを維持する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopPaginatedQuery(queryRef, "skip", options));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(queryRef, "skip", options);
  });

  it("店舗選択が変わった後は最新の店舗IDを使う", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };
    const { rerender } = renderHook(() => useShopPaginatedQuery(queryRef, { label: "募集A" }, options));

    mocks.selectedShop = { shopId: "shop-2", shopName: "新宿店" };
    rerender();

    expect(mocks.usePaginatedQuery).toHaveBeenNthCalledWith(1, queryRef, { label: "募集A", shopId: "shop-1" }, options);
    expect(mocks.usePaginatedQuery).toHaveBeenNthCalledWith(2, queryRef, { label: "募集A", shopId: "shop-2" }, options);
  });
});
