// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  setSelectedShop: vi.fn(),
  selectedShop: {
    shopId: "shop-1",
    shopName: "渋谷店",
    shopStatus: "active" as const,
    organizationId: "organization-1",
    organizationName: "さくらダイニング",
    memberStatus: "active" as const,
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
  useSetAtom: () => mocks.setSelectedShop,
}));

import { useShopDeletionController } from "./useShopDeletionController";

const shop: ShopDetailData = {
  id: "shop-1",
  name: "渋谷店",
  staffCount: 3,
  canDelete: true,
};

beforeEach(() => {
  mocks.mutation.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.setSelectedShop.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("店舗詳細の削除操作", () => {
  it("削除権限を失った後の古い確定操作を拒否する", async () => {
    const onDeleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentShop }) => useShopDeletionController({ shop: currentShop, onDeleted }),
      { initialProps: { currentShop: shop } },
    );
    const staleDelete = result.current.deleteShop;

    rerender({ currentShop: { ...shop, canDelete: false } });

    await expect(staleDelete()).resolves.toBe(false);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("対象IDを二重確認し、短時間の連続操作を一度だけ受け付ける", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.mutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({ changed: true, accepted: true });
        }),
    );
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useShopDeletionController({ shop, onDeleted }));
    let firstDelete: Promise<boolean> | undefined;
    let secondDelete: Promise<boolean> | undefined;

    act(() => {
      firstDelete = result.current.deleteShop();
      secondDelete = result.current.deleteShop();
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        shopId: shop.id,
        confirmShopId: shop.id,
        requestId: "request-1",
      }),
    );
    await expect(secondDelete).resolves.toBe(false);
    await act(async () => resolveMutation?.());
    await expect(firstDelete).resolves.toBe(true);
    expect(mocks.setSelectedShop).toHaveBeenCalledExactlyOnceWith(null);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "店舗の削除を受け付けました",
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("通信失敗後の再試行で同じrequestIdを使う", async () => {
    const error = new Error("network error");
    mocks.mutation.mockRejectedValueOnce(error).mockResolvedValueOnce({ changed: true, accepted: true });
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useShopDeletionController({ shop, onDeleted }));

    await act(async () => {
      await expect(result.current.deleteShop()).resolves.toBe(false);
    });
    await act(async () => {
      await expect(result.current.deleteShop()).resolves.toBe(true);
    });

    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation).toHaveBeenNthCalledWith(1, {
      shopId: shop.id,
      confirmShopId: shop.id,
      requestId: "request-1",
    });
    expect(mocks.mutation).toHaveBeenNthCalledWith(2, {
      shopId: shop.id,
      confirmShopId: shop.id,
      requestId: "request-1",
    });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
