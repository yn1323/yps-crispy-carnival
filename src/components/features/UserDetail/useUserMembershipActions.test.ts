// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserMembershipChangeInput } from "./types";

const mocks = vi.hoisted(() => ({
  changeMembershipsRef: Symbol("changeMemberships"),
  useMutation: vi.fn(),
  changeMemberships: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: {
      mutations: { changeOrganizationPersonShopMemberships: mocks.changeMembershipsRef },
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
const addedShopId = "shop-added" as Id<"shops">;
const removedShopId = "shop-removed" as Id<"shops">;
const removedStaffId = "staff-removed" as Id<"staffs">;
const input: UserMembershipChangeInput = {
  shopId,
  desiredActiveShopIds: [shopId, addedShopId],
  expectedMembershipFingerprint: "membership-fingerprint",
  removalPreviews: [
    {
      shopId: removedShopId,
      staffId: removedStaffId,
      assignmentCount: 2,
      fingerprint: "removal-fingerprint",
    },
  ],
  requestId: "71d01840-98c3-4cd3-aaf7-51f98cbe8c5e",
};

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.changeMemberships.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockReturnValue(mocks.changeMemberships);
});

describe("useUserMembershipActions", () => {
  it("所属店舗の差分を一つのmutationへ一度だけ渡す", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.changeMemberships.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const { result } = renderHook(() => useUserMembershipActions({ canChangeMembership: true }));

    let firstResult: boolean | undefined;
    let secondResult: boolean | undefined;
    await act(async () => {
      const first = result.current.onChangeMemberships(personId, input);
      secondResult = await result.current.onChangeMemberships(personId, { ...input, requestId: "second-request" });
      resolveMutation?.();
      firstResult = await first;
    });

    expect(mocks.useMutation).toHaveBeenCalledWith(mocks.changeMembershipsRef);
    expect(mocks.changeMemberships).toHaveBeenCalledExactlyOnceWith({ ...input, personId });
    expect(firstResult).toBe(true);
    expect(secondResult).toBeUndefined();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "所属店舗を変更しました" });
  });

  it("店舗所属変更が非公開へ切り替わると古いhandlerからもmutationを開始しない", async () => {
    const { result, rerender } = renderHook(
      ({ canChangeMembership }) => useUserMembershipActions({ canChangeMembership }),
      { initialProps: { canChangeMembership: true } },
    );
    const previousChangeMemberships = result.current.onChangeMemberships;

    rerender({ canChangeMembership: false });
    await act(async () => {
      await previousChangeMemberships(personId, input);
    });

    expect(mocks.changeMemberships).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("所属変更の処理中に非公開へ切り替わった場合は結果toastを表示しない", async () => {
    const error = new Error("変更できませんでした");
    let rejectMutation: ((error: Error) => void) | undefined;
    mocks.changeMemberships.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectMutation = reject;
      }),
    );
    const { result, rerender } = renderHook(
      ({ canChangeMembership }) => useUserMembershipActions({ canChangeMembership }),
      { initialProps: { canChangeMembership: true } },
    );

    let change: Promise<unknown> | undefined;
    act(() => {
      change = result.current.onChangeMemberships(personId, input);
    });
    rerender({ canChangeMembership: false });
    await act(async () => {
      rejectMutation?.(error);
      await change;
    });

    expect(mocks.changeMemberships).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("所属または解除previewが古い場合は画面の再読み込みを促す", async () => {
    mocks.changeMemberships.mockRejectedValue(
      new Error("店舗所属が変更されています。\n最新の内容を確認して、もう一度お試しください。"),
    );
    const { result } = renderHook(() => useUserMembershipActions({ canChangeMembership: true }));

    await act(async () => {
      await result.current.onChangeMemberships(personId, input);
    });

    expect(mocks.showErrorToast).toHaveBeenCalledOnce();
    const shownError = mocks.showErrorToast.mock.calls[0]?.[0];
    expect(shownError).toBeInstanceOf(Error);
    expect((shownError as Error).message).toContain("画面を再読み込みして");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
