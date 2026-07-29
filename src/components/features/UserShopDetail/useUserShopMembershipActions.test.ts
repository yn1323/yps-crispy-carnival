// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  setShiftExclusionRef: Symbol("setShiftExclusion"),
  removeMembershipRef: Symbol("removeMembership"),
  useMutation: vi.fn(),
  setShiftExclusion: vi.fn(),
  removeMembership: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: { mutations: { setShiftExclusion: mocks.setShiftExclusionRef } },
    organization: { mutations: { removePersonFromShop: mocks.removeMembershipRef } },
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
const requestId = "71d01840-98c3-4cd3-aaf7-51f98cbe8c5e";
const membership = {
  staffId,
  shopId: targetShopId,
  shopName: "対象店舗",
  shopStatus: "active",
  excludedFromShift: false,
  canRemove: true,
  removalPreview: {
    kind: "ready",
    asOfDate: "2026-07-22",
    assignmentCount: 2,
    fingerprint: "membership-preview",
  },
  line: { isLinked: false, isFollowing: false },
} as unknown as UserShopDetailMembership;

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.setShiftExclusion.mockReset();
  mocks.removeMembership.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.setShiftExclusionRef) return mocks.setShiftExclusion;
    if (reference === mocks.removeMembershipRef) return mocks.removeMembership;
    throw new Error("Unexpected mutation reference");
  });
  mocks.setShiftExclusion.mockResolvedValue(undefined);
  mocks.removeMembership.mockResolvedValue({ changed: true });
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUserShopMembershipActions", () => {
  it("シフト対象設定へpathのtargetShopIdを明示する", async () => {
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
        canRemoveMembership: true,
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
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "シフト対象外にしました" });
  });

  it("確認時に固定したpreviewとrequestIdを付け、pathのtargetShopIdから所属を削除する", async () => {
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
        canRemoveMembership: true,
      }),
    );

    act(() => result.current.onRequestRemoveMembership());
    let removed: boolean | undefined;
    await act(async () => {
      removed = await result.current.onConfirmRemoveMembership();
    });

    expect(mocks.removeMembership).toHaveBeenCalledExactlyOnceWith({
      shopId: targetShopId,
      staffId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "membership-preview" },
    });
    expect(removed).toBe(true);
    expect(result.current.dialog).toBeNull();
  });

  it("結果が不明な再押下では同じ対象・preview・requestIdを再利用する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.removeMembership.mockRejectedValueOnce(error).mockResolvedValueOnce({ changed: false });
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId,
        membership,
        isReadOnly: false,
        canRemoveMembership: true,
      }),
    );

    act(() => result.current.onRequestRemoveMembership());
    await act(async () => {
      await result.current.onConfirmRemoveMembership();
    });
    await act(async () => {
      await result.current.onConfirmRemoveMembership();
    });

    const expectedArgs = {
      shopId: targetShopId,
      staffId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "membership-preview" },
    };
    expect(mocks.removeMembership.mock.calls).toEqual([[expectedArgs], [expectedArgs]]);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("membershipとpathの店舗が一致しなければ設定も削除も送らない", async () => {
    const mismatchedShopId = "shop-other" as Id<"shops">;
    const { result } = renderHook(() =>
      useUserShopMembershipActions({
        targetShopId: mismatchedShopId,
        membership,
        isReadOnly: false,
        canRemoveMembership: true,
      }),
    );

    act(() => result.current.onRequestRemoveMembership());
    await act(async () => {
      await result.current.onChangeShiftTarget(false);
      await result.current.onConfirmRemoveMembership();
    });

    expect(result.current.dialog).toBeNull();
    expect(mocks.setShiftExclusion).not.toHaveBeenCalled();
    expect(mocks.removeMembership).not.toHaveBeenCalled();
  });
});
