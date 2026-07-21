// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  createManagerInvitationRef: Symbol("createManagerInvitation"),
  removeManagerRoleRef: Symbol("removeManagerRole"),
  removePersonRef: Symbol("removePerson"),
  useMutation: vi.fn(),
  createManagerInvitation: vi.fn(),
  removeManagerRole: vi.fn(),
  removePerson: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    organizationInvitation: {
      mutations: { createForPerson: mocks.createManagerInvitationRef },
    },
    organization: {
      mutations: {
        removeManagerRole: mocks.removeManagerRoleRef,
        removePersonFromOrganization: mocks.removePersonRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: mocks.useMutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserManagerActions } from "./useUserManagerActions";

const personId = "person-target" as Id<"organizationPeople">;
const shopId = "shop-current" as Id<"shops">;
const requestId = "2b79a222-176c-44d6-9b39-d090c1f72efb";

const lastActiveManagerData: UserDetailData = {
  person: {
    id: personId,
    name: "対象ユーザー",
    email: "target@example.com",
  },
  isSelf: false,
  managerRole: "active",
  hasManagerInvitation: false,
  managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
  canRemoveManagerRole: false,
  managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
  canRemove: false,
  removeDisabledReason: "最後の有効管理者は削除できません。",
  canWrite: true,
  shops: [
    {
      shopId,
      shopName: "渋谷店",
      shopStatus: "active",
    },
  ],
  memberships: [
    {
      staffId: "staff-target" as Id<"staffs">,
      shopId,
      shopName: "渋谷店",
      shopStatus: "active",
      excludedFromShift: false,
      canRemove: true,
      line: { isLinked: false, isFollowing: false },
    },
  ],
};

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.createManagerInvitation.mockReset();
  mocks.removeManagerRole.mockReset();
  mocks.removePerson.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.createManagerInvitationRef) return mocks.createManagerInvitation;
    if (reference === mocks.removeManagerRoleRef) return mocks.removeManagerRole;
    if (reference === mocks.removePersonRef) return mocks.removePerson;
    throw new Error("Unexpected mutation reference");
  });
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUserManagerActions", () => {
  it("閲覧専用では削除確認を開かない", () => {
    const readOnlyData: UserDetailData = {
      ...lastActiveManagerData,
      canWrite: false,
      writeDisabledReason: "閲覧のみの管理者は変更できません。",
    };
    const { result } = renderHook(() =>
      useUserManagerActions({ data: readOnlyData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemoveManagerRole());
    expect(result.current.dialog).toBeNull();

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toBeNull();
  });

  it.each([null, "unknown-shop"])(
    "選択店舗が未指定または不正な場合はグループ内の店舗を削除操作のコンテキストに使う: %s",
    async (selectedShopId) => {
      const error = new ConvexError("最後の有効管理者は削除できません。");
      mocks.removePerson.mockRejectedValue(error);
      const { result } = renderHook(() =>
        useUserManagerActions({ data: lastActiveManagerData, selectedShopId, onPersonRemoved: vi.fn() }),
      );

      act(() => result.current.onRequestRemovePerson());
      expect(result.current.dialog).toEqual({ kind: "removePerson" });

      await act(async () => {
        await result.current.onConfirmRemoval();
      });

      expect(mocks.removePerson).toHaveBeenCalledExactlyOnceWith({
        shopId,
        personId,
        requestId,
      });
      expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    },
  );

  it("最後の有効管理者でも管理者権限解除を確認し、サーバー拒否を表示してDialogを維持する", async () => {
    const error = new ConvexError("最後の有効管理者の管理者権限は外せません。");
    mocks.removeManagerRole.mockRejectedValue(error);
    const onPersonRemoved = vi.fn();
    const { result } = renderHook(() =>
      useUserManagerActions({ data: lastActiveManagerData, selectedShopId: shopId, onPersonRemoved }),
    );

    act(() => result.current.onRequestRemoveManagerRole());
    expect(result.current.dialog).toEqual({ kind: "removeManagerRole" });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    expect(mocks.removeManagerRole).toHaveBeenCalledExactlyOnceWith({
      shopId,
      personId,
      requestId,
    });
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(onPersonRemoved).not.toHaveBeenCalled();
    expect(result.current.dialog).toEqual({ kind: "removeManagerRole" });
  });

  it("最後の有効管理者でもグループ削除を確認し、サーバー拒否を表示してDialogを維持する", async () => {
    const error = new ConvexError("最後の有効管理者は削除できません。");
    mocks.removePerson.mockRejectedValue(error);
    const onPersonRemoved = vi.fn();
    const { result } = renderHook(() =>
      useUserManagerActions({ data: lastActiveManagerData, selectedShopId: shopId, onPersonRemoved }),
    );

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toEqual({ kind: "removePerson" });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    expect(mocks.removePerson).toHaveBeenCalledExactlyOnceWith({
      shopId,
      personId,
      requestId,
    });
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(onPersonRemoved).not.toHaveBeenCalled();
    expect(result.current.dialog).toEqual({ kind: "removePerson" });
  });
});
