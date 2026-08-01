// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  addMembershipRef: Symbol("addMembership"),
  useMutation: vi.fn(),
  addMembership: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: {
      mutations: { addOrganizationPersonToShop: mocks.addMembershipRef },
    },
  },
}));

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserMembershipActions } from "./useUserMembershipActions";

const personId = "person-target" as Id<"organizationPeople">;
const shopId = "shop-target" as Id<"shops">;
const otherShopId = "shop-other" as Id<"shops">;
const requestId = "71d01840-98c3-4cd3-aaf7-51f98cbe8c5e";

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.addMembership.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockReturnValue(mocks.addMembership);
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
    const { result } = renderHook(() => useUserMembershipActions({ canAddMembership: true }));

    let firstResult: boolean | undefined;
    let secondResult: boolean | undefined;
    await act(async () => {
      const first = result.current.onAddMembership(personId, shopId);
      secondResult = await result.current.onAddMembership(personId, otherShopId);
      resolveMutation?.();
      firstResult = await first;
    });

    expect(mocks.useMutation).toHaveBeenCalledWith(mocks.addMembershipRef);
    expect(mocks.addMembership).toHaveBeenCalledExactlyOnceWith({ shopId, personId, requestId });
    expect(firstResult).toBe(true);
    expect(secondResult).toBeUndefined();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "店舗にユーザーを追加しました" });
    expect(result.current.addingShopId).toBeNull();
  });

  it("店舗所属追加が非公開へ切り替わると古いhandlerからもmutationを開始しない", async () => {
    const { result, rerender } = renderHook(({ canAddMembership }) => useUserMembershipActions({ canAddMembership }), {
      initialProps: { canAddMembership: true },
    });
    const previousAddMembership = result.current.onAddMembership;

    rerender({ canAddMembership: false });
    await act(async () => {
      await previousAddMembership(personId, shopId);
    });

    expect(mocks.addMembership).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("店舗所属追加の処理中に非公開へ切り替わった場合は結果toastを表示しない", async () => {
    const error = new Error("追加できませんでした");
    let rejectMutation: ((error: Error) => void) | undefined;
    mocks.addMembership.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectMutation = reject;
      }),
    );
    const { result, rerender } = renderHook(({ canAddMembership }) => useUserMembershipActions({ canAddMembership }), {
      initialProps: { canAddMembership: true },
    });

    let addition: Promise<unknown> | undefined;
    act(() => {
      addition = result.current.onAddMembership(personId, shopId);
    });
    rerender({ canAddMembership: false });
    await act(async () => {
      rejectMutation?.(error);
      await addition;
    });

    expect(mocks.addMembership).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
