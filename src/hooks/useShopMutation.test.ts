// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestMutation = FunctionReference<"mutation", "public", { label: string; shopId?: string }, { saved: boolean }>;

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  selectedShop: null as { shopId: string; shopName: string } | null,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutate,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useShopMutation } from "./useShopMutation";

const mutationRef = {} as TestMutation;

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.selectedShop = null;
});

describe("useShopMutation", () => {
  it("選択中の店舗IDをmutation引数へ注入する", async () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };
    mocks.mutate.mockResolvedValueOnce({ saved: true });
    const { result } = renderHook(() => useShopMutation(mutationRef));
    const input = { label: "募集A" };

    await expect(result.current(input)).resolves.toEqual({ saved: true });

    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({ label: "募集A", shopId: "shop-1" });
    expect(input).toEqual({ label: "募集A" });
  });

  it("店舗が未選択ならshopIdを追加しない", async () => {
    mocks.mutate.mockResolvedValueOnce({ saved: true });
    const { result } = renderHook(() => useShopMutation(mutationRef));

    await result.current({ label: "募集A" });

    expect(mocks.mutate).toHaveBeenCalledWith({ label: "募集A" });
  });

  it("店舗選択が変わった後は最新の店舗IDを使う", async () => {
    mocks.selectedShop = { shopId: "shop-1", shopName: "渋谷店" };
    mocks.mutate.mockResolvedValue({ saved: true });
    const { rerender, result } = renderHook(() => useShopMutation(mutationRef));

    await result.current({ label: "変更前" });
    mocks.selectedShop = { shopId: "shop-2", shopName: "新宿店" };
    rerender();
    await result.current({ label: "変更後" });

    expect(mocks.mutate).toHaveBeenNthCalledWith(1, { label: "変更前", shopId: "shop-1" });
    expect(mocks.mutate).toHaveBeenNthCalledWith(2, { label: "変更後", shopId: "shop-2" });
  });
});
