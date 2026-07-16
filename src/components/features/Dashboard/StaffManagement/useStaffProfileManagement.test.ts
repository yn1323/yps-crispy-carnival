// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff } from "../types";

const mocks = vi.hoisted(() => ({
  editStaff: vi.fn(),
  deleteStaff: vi.fn(),
  removePersonFromShop: vi.fn(),
  setShiftExclusion: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutations = [mocks.editStaff, mocks.deleteStaff, mocks.removePersonFromShop, mocks.setShiftExclusion];
    const mutation = mutations[mocks.shopMutationCallCount % mutations.length];
    mocks.shopMutationCallCount += 1;
    return mutation;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useStaffProfileManagement } from "./useStaffProfileManagement";

const staff = (overrides: Partial<Staff> = {}): Staff => ({
  _id: "staff-target" as Staff["_id"],
  name: "対象スタッフ",
  email: "staff@example.com",
  isManager: false,
  isLineLinked: false,
  isLineFollowing: false,
  excludedFromShift: false,
  ...overrides,
});

beforeEach(() => {
  mocks.editStaff.mockReset();
  mocks.deleteStaff.mockReset();
  mocks.removePersonFromShop.mockReset();
  mocks.setShiftExclusion.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
  vi.spyOn(crypto, "randomUUID").mockReturnValue("a28bb647-4811-44a4-bbb3-1cd92819d67f");
});

describe("useStaffProfileManagement", () => {
  it("移行済みスタッフは事業者人物を残す店舗所属削除mutationへ送る", async () => {
    mocks.removePersonFromShop.mockResolvedValue({ changed: true });
    const target = staff({ isOrganizationLinked: true });
    const { result } = renderHook(() => useStaffProfileManagement([target], { onResetDetail: vi.fn() }));

    await act(async () => {
      await result.current.onDelete(target);
    });

    expect(mocks.removePersonFromShop).toHaveBeenCalledWith({
      staffId: target._id,
      requestId: "a28bb647-4811-44a4-bbb3-1cd92819d67f",
    });
    expect(mocks.deleteStaff).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "この店舗のスタッフ所属を削除しました" }),
    );
  });

  it("移行前スタッフだけは段階移行中の旧削除mutationへ送る", async () => {
    mocks.deleteStaff.mockResolvedValue(undefined);
    const target = staff();
    const { result } = renderHook(() => useStaffProfileManagement([target], { onResetDetail: vi.fn() }));

    await act(async () => {
      await result.current.onDelete(target);
    });

    expect(mocks.deleteStaff).toHaveBeenCalledWith({ staffId: target._id });
    expect(mocks.removePersonFromShop).not.toHaveBeenCalled();
  });

  it("閲覧専用では詳細を閲覧できるが、編集・削除・シフト対象変更を開始しない", async () => {
    const target = staff({ isOrganizationLinked: true });
    const { result, rerender } = renderHook(
      ({ isReadOnly }) =>
        useStaffProfileManagement([target], {
          onResetDetail: vi.fn(),
          isReadOnly,
        }),
      { initialProps: { isReadOnly: false } },
    );

    act(() => result.current.onOpen(target));
    rerender({ isReadOnly: true });
    expect(result.current.dialog.isOpen).toBe(true);

    await act(async () => {
      await result.current.onEdit({ name: "変更後", email: "updated@example.com" });
      await result.current.onDelete(target);
      await result.current.onChangeShiftTarget(target, false);
    });

    expect(mocks.editStaff).not.toHaveBeenCalled();
    expect(mocks.deleteStaff).not.toHaveBeenCalled();
    expect(mocks.removePersonFromShop).not.toHaveBeenCalled();
    expect(mocks.setShiftExclusion).not.toHaveBeenCalled();
  });
});
