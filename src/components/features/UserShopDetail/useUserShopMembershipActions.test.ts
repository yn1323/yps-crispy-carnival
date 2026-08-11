// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  setShiftExclusionRef: Symbol("setShiftExclusion"),
  useMutation: vi.fn(),
  setShiftExclusion: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: { mutations: { setShiftExclusion: mocks.setShiftExclusionRef } },
  },
}));

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserShopMembershipActions } from "./useUserShopMembershipActions";

const targetShopId = "shop-target" as Id<"shops">;
const staffId = "staff-target" as Id<"staffs">;
const membership = {
  staffId,
  shopId: targetShopId,
  shopName: "対象店舗",
  shopStatus: "active",
  excludedFromShift: false,
  line: { isLinked: false, isFollowing: false },
} as unknown as UserShopDetailMembership;

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.setShiftExclusion.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.setShiftExclusionRef) return mocks.setShiftExclusion;
    throw new Error("Unexpected mutation reference");
  });
  mocks.setShiftExclusion.mockResolvedValue(undefined);
});

describe("useUserShopMembershipActions", () => {
  it("シフト対象設定へpathのtargetShopIdを明示する", async () => {
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
      }),
    );

    await act(async () => {
      await result.current.onChangeShiftTarget(false);
    });

    expect(mocks.setShiftExclusion).toHaveBeenCalledExactlyOnceWith({
      shopId: targetShopId,
      staffId,
      excluded: true,
    });
    expect(result.current.excludedFromShift).toBe(true);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "シフト対象外にしました" });
  });

  it("切り替え直後はmutation完了後も1000ms再操作を受け付けない", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
      }),
    );

    try {
      await act(async () => {
        await result.current.onChangeShiftTarget(false);
      });

      expect(result.current.isChangingShiftTarget).toBe(true);
      await act(async () => {
        await result.current.onChangeShiftTarget(true);
      });
      expect(mocks.setShiftExclusion).toHaveBeenCalledOnce();

      act(() => vi.advanceTimersByTime(999));
      expect(result.current.isChangingShiftTarget).toBe(true);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.isChangingShiftTarget).toBe(false);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("mutationの完了前にシフト対象表示を切り替え、失敗時は元へ戻す", async () => {
    const error = new Error("更新に失敗しました");
    let rejectMutation: ((reason: unknown) => void) | undefined;
    const pendingMutation = new Promise<void>((_resolve, reject) => {
      rejectMutation = reject;
    });
    mocks.setShiftExclusion.mockReturnValue(pendingMutation);
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
      }),
    );

    let request: Promise<unknown> | undefined;
    act(() => {
      request = result.current.onChangeShiftTarget(false);
    });

    expect(result.current.excludedFromShift).toBe(true);
    expect(result.current.isChangingShiftTarget).toBe(true);

    await act(async () => {
      rejectMutation?.(error);
      await request;
    });

    expect(result.current.excludedFromShift).toBe(false);
    expect(result.current.isChangingShiftTarget).toBe(true);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });
});
