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
  it("表示中の対象店舗IDと一括編集した設定をmutationへ渡す", async () => {
    mocks.mutation.mockResolvedValue(null);
    const { result } = renderHook(() => useShopSettingsController(shop));

    act(() => result.current.dialog.open());
    await act(async () => {
      await result.current.updateSettings({
        shopName: "新しい渋谷店",
        regularClosedDays: ["mon"],
        submissionPattern: { kind: "time", startTime: "10:00", endTime: "22:00" },
      });
    });

    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      shopId: "shop-target",
      shopName: "新しい渋谷店",
      regularClosedDays: ["mon"],
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "22:00" },
    });
    expect(result.current.dialog.isOpen).toBe(false);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "店舗設定を更新しました" });
  });

  it("更新権限を失った後は古いcallbackからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(({ currentShop }) => useShopSettingsController(currentShop), {
      initialProps: { currentShop: shop },
    });
    const staleUpdate = result.current.updateSettings;

    act(() => rerender({ currentShop: { ...shop, canUpdateSettings: false } }));

    await act(async () => {
      await staleUpdate({
        shopName: "更新されない店舗",
        regularClosedDays: ["mon"],
        submissionPattern: { kind: "dateOnly" },
      });
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
      void result.current.updateSettings({
        shopName: "一件目",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
      });
      void result.current.updateSettings({
        shopName: "二件目",
        regularClosedDays: ["mon"],
        submissionPattern: { kind: "dateOnly" },
      });
    });

    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledTimes(1));
    expect(result.current.dialog.isUpdating).toBe(true);
    expect(mocks.mutation).toHaveBeenCalledWith({
      shopId: "shop-target",
      shopName: "一件目",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
    });
    await act(async () => resolveMutation?.());
    await waitFor(() => expect(result.current.dialog.isUpdating).toBe(false));
  });

  it("更新失敗をToastへ渡し、編集Dialogを開いたままにする", async () => {
    const error = new Error("network error");
    mocks.mutation.mockRejectedValue(error);
    const { result } = renderHook(() => useShopSettingsController(shop));

    act(() => result.current.dialog.open());
    await act(async () => {
      await result.current.updateSettings({
        shopName: "渋谷店",
        regularClosedDays: ["sun"],
        submissionPattern: { kind: "dateOnly" },
      });
    });

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(result.current.dialog.isOpen).toBe(true);
  });
});
