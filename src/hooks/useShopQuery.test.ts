// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestQuery = FunctionReference<"query", "public", { label: string; shopId: string }, { name: string }>;

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  selectedShop: null as { shopId: string; shopName: string } | null,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useShopQuery } from "./useShopQuery";

const queryRef = {} as TestQuery;

beforeEach(() => {
  mocks.useQuery.mockReset();
  mocks.selectedShop = null;
});

describe("useShopQuery", () => {
  it("選択中の店舗IDをquery引数へ注入する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopQuery(queryRef, { label: "募集A" }));

    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, { label: "募集A", shopId: "shop-1" });
  });

  it("店舗が未選択ならqueryをskipする", () => {
    renderHook(() => useShopQuery(queryRef, { label: "募集A" }));

    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, "skip");
  });

  it("呼び出し側のskipを維持する", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };

    renderHook(() => useShopQuery(queryRef, "skip"));

    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, "skip");
  });

  it("店舗選択が変わった後は最新の店舗IDを使う", () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };
    const { rerender } = renderHook(() => useShopQuery(queryRef, { label: "募集A" }));

    mocks.selectedShop = { shopId: "shop-2", shopName: "新宿店" };
    rerender();

    expect(mocks.useQuery).toHaveBeenNthCalledWith(1, queryRef, { label: "募集A", shopId: "shop-1" });
    expect(mocks.useQuery).toHaveBeenNthCalledWith(2, queryRef, { label: "募集A", shopId: "shop-2" });
  });
});
