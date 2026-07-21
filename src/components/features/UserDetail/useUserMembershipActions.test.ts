// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  setShiftExclusionRef: Symbol("setShiftExclusion"),
  addMembershipRef: Symbol("addMembership"),
  removeMembershipRef: Symbol("removeMembership"),
  useMutation: vi.fn(),
  useShopMutation: vi.fn(),
  setShiftExclusion: vi.fn(),
  addMembership: vi.fn(),
  removeMembership: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: {
      mutations: {
        setShiftExclusion: mocks.setShiftExclusionRef,
        addOrganizationPersonToShop: mocks.addMembershipRef,
      },
    },
    organization: {
      mutations: { removePersonFromShop: mocks.removeMembershipRef },
    },
  },
}));

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/src/hooks/useShopMutation", () => ({ useShopMutation: mocks.useShopMutation }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserMembershipActions } from "./useUserMembershipActions";

const personId = "person-target" as Id<"organizationPeople">;
const shopId = "shop-target" as Id<"shops">;
const otherShopId = "shop-other" as Id<"shops">;
const requestId = "71d01840-98c3-4cd3-aaf7-51f98cbe8c5e";
const membership: UserDetailMembership = {
  staffId: "staff-target" as Id<"staffs">,
  shopId,
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
};

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.useShopMutation.mockReset();
  mocks.setShiftExclusion.mockReset();
  mocks.addMembership.mockReset();
  mocks.removeMembership.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useShopMutation.mockReturnValue(mocks.setShiftExclusion);
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.addMembershipRef) return mocks.addMembership;
    if (reference === mocks.removeMembershipRef) return mocks.removeMembership;
    throw new Error("Unexpected mutation reference");
  });
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUserMembershipActions", () => {
  it("押した未所属店舗を明示して一度だけ追加する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.addMembership.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useUserMembershipActions({
        membership: null,
        selectedShopId: null,
        isReadOnly: false,
        canAddMembership: true,
      }),
    );

    let firstResult: boolean | undefined;
    let secondResult: boolean | undefined;
    await act(async () => {
      const first = result.current.onAddMembership(personId, shopId);
      secondResult = await result.current.onAddMembership(personId, otherShopId);
      resolveMutation?.();
      firstResult = await first;
    });

    expect(mocks.addMembership).toHaveBeenCalledExactlyOnceWith({ shopId, personId, requestId });
    expect(firstResult).toBe(true);
    expect(secondResult).toBeUndefined();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "店舗にユーザーを追加しました" });
    expect(result.current.addingShopId).toBeNull();
  });

  it("確認時に固定した割当previewを付けて店舗所属を削除する", async () => {
    const { result } = renderHook(() =>
      useUserMembershipActions({
        membership,
        selectedShopId: shopId,
        isReadOnly: false,
        canAddMembership: true,
      }),
    );

    act(() => result.current.onRequestRemoveMembership());
    await act(async () => {
      await result.current.onConfirmRemoveMembership();
    });

    expect(mocks.removeMembership).toHaveBeenCalledExactlyOnceWith({
      shopId,
      staffId: membership.staffId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "membership-preview" },
    });
    expect(result.current.dialog).toBeNull();
  });

  it("stale previewでは確認を閉じて再確認を求める", async () => {
    const error = new ConvexError("今日以降のシフト割当が変更されました。内容を確認して、もう一度削除してください");
    mocks.removeMembership.mockRejectedValue(error);
    const { result } = renderHook(() =>
      useUserMembershipActions({
        membership,
        selectedShopId: shopId,
        isReadOnly: false,
        canAddMembership: true,
      }),
    );

    act(() => result.current.onRequestRemoveMembership());
    await act(async () => {
      await result.current.onConfirmRemoveMembership();
    });

    expect(result.current.dialog).toBeNull();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });
});
