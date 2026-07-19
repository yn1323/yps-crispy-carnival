// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useShopSettingsController } from "./useShopSettingsController";

const shop: ShopDetailData = {
  id: "shop-target",
  name: "渋谷店",
  regularClosedDays: ["sun"],
  submissionPattern: { kind: "dateOnly" },
  canUpdateSettings: true,
  canDelete: true,
};

beforeEach(() => {
  mocks.mutation.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
});

describe("店舗詳細の設定更新", () => {
  it("表示中の対象店舗IDと変更対象だけをmutationへ渡す", async () => {
    mocks.mutation.mockResolvedValue(null);
    const { result } = renderHook(() => useShopSettingsController(shop));

    await act(async () => {
      await result.current.updateSetting({ kind: "shopName", shopName: "新しい渋谷店" });
    });

    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      shopId: "shop-target",
      change: { kind: "shopName", shopName: "新しい渋谷店" },
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "店舗名を更新しました" });
  });

  it("更新権限を失った後は古いcallbackからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(({ currentShop }) => useShopSettingsController(currentShop), {
      initialProps: { currentShop: shop },
    });
    const staleUpdate = result.current.updateSetting;

    act(() => rerender({ currentShop: { ...shop, canUpdateSettings: false } }));

    await act(async () => {
      await staleUpdate({ kind: "regularClosedDays", regularClosedDays: ["mon"] });
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("短時間の連続更新は最初の一件だけを実行する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.mutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve(null);
        }),
    );
    const { result } = renderHook(() => useShopSettingsController(shop));

    act(() => {
      void result.current.updateSetting({ kind: "shopName", shopName: "一件目" });
      void result.current.updateSetting({ kind: "regularClosedDays", regularClosedDays: ["mon"] });
    });

    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledTimes(1));
    expect(mocks.mutation).toHaveBeenCalledWith({
      shopId: "shop-target",
      change: { kind: "shopName", shopName: "一件目" },
    });
    await act(async () => resolveMutation?.());
  });

  it("更新失敗をToastへ渡し、成功通知を表示しない", async () => {
    const error = new Error("network error");
    mocks.mutation.mockRejectedValue(error);
    const { result } = renderHook(() => useShopSettingsController(shop));

    await act(async () => {
      await result.current.updateSetting({ kind: "submissionPattern", submissionPattern: { kind: "dateOnly" } });
    });

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
