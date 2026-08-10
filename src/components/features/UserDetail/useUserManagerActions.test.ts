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
const nextRequestId = "ec0e5a86-c413-401d-af1f-e2dd654124c4";
const removalPreview = {
  kind: "ready" as const,
  asOfDate: "2026-07-22",
  assignmentCount: 2,
  fingerprint: "preview-fingerprint",
};

const lastActiveManagerData: UserDetailData = {
  person: {
    id: personId,
    name: "対象ユーザー",
    email: "target@example.com",
    hasLinkedAccount: true,
  },
  isSelf: false,
  managerRole: "active",
  hasManagerInvitation: false,
  managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
  canRemoveManagerRole: false,
  managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
  canRemove: false,
  removeDisabledReason: "管理者は削除できません。",
  removalPreview,
  canWrite: true,
  membershipFingerprint: "membership-fingerprint",
  shops: [
    {
      shopId,
      shopName: "渋谷店",
      shopStatus: "active",
      canChangeMembership: true,
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
      removalPreview: { ...removalPreview, assignmentCount: 1, fingerprint: "shop-preview-fingerprint" },
      line: { isLinked: false, isFollowing: false },
    },
  ],
};

const removableManagerData: UserDetailData = {
  ...lastActiveManagerData,
  canRemoveManagerRole: true,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: true,
  removeDisabledReason: undefined,
};

const removablePersonData: UserDetailData = {
  ...lastActiveManagerData,
  managerRole: "none",
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
  canRemove: true,
  removeDisabledReason: undefined,
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
  it("書き込み可能でも専用capabilityがない破壊操作は確認を開かない", () => {
    const { result } = renderHook(() =>
      useUserManagerActions({ data: lastActiveManagerData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemoveManagerRole());
    expect(result.current.dialog).toBeNull();

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toBeNull();
    expect(mocks.removeManagerRole).not.toHaveBeenCalled();
    expect(mocks.removePerson).not.toHaveBeenCalled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("管理者招待がhiddenへ変わると確認を閉じ、古いcallbackでも招待・権限解除を実行しない", async () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: UserDetailData }) =>
        useUserManagerActions({ data, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
      { initialProps: { data: removableManagerData } },
    );

    act(() => result.current.onRequestRemoveManagerRole());
    expect(result.current.dialog?.kind).toBe("removeManagerRole");
    const staleConfirmRemoval = result.current.onConfirmRemoval;

    rerender({
      data: {
        ...removableManagerData,
        managerInvitationState: { kind: "hidden" },
      },
    });
    expect(result.current.dialog).toBeNull();
    await act(async () => {
      await staleConfirmRemoval();
    });
    expect(mocks.removeManagerRole).not.toHaveBeenCalled();

    rerender({ data: removablePersonData });
    const staleAssignManager = result.current.onAssignManager;
    rerender({
      data: {
        ...removablePersonData,
        managerInvitationState: { kind: "hidden" },
      },
    });
    await act(async () => {
      await staleAssignManager();
    });
    expect(mocks.createManagerInvitation).not.toHaveBeenCalled();
  });

  it.each([null, "unknown-shop"])(
    "選択店舗が未指定または不正な場合は組織内の店舗を削除操作のコンテキストに使う: %s",
    async (selectedShopId) => {
      const error = new ConvexError("操作結果を確認できませんでした。");
      mocks.removePerson.mockRejectedValue(error);
      const { result } = renderHook(() =>
        useUserManagerActions({ data: removablePersonData, selectedShopId, onPersonRemoved: vi.fn() }),
      );

      act(() => result.current.onRequestRemovePerson());
      expect(result.current.dialog).toEqual({
        kind: "removePerson",
        personId,
        shopId,
        removalPreview,
        requestId,
      });

      await act(async () => {
        await result.current.onConfirmRemoval();
      });

      expect(mocks.removePerson).toHaveBeenCalledExactlyOnceWith({
        shopId,
        personId,
        requestId,
        removalPreview: { assignmentCount: 2, fingerprint: "preview-fingerprint" },
      });
      expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    },
  );

  it("管理者権限解除の結果が不明な再押下では同じrequestIdを再利用する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.removeManagerRole.mockRejectedValueOnce(error).mockResolvedValueOnce({ changed: false });
    const onPersonRemoved = vi.fn();
    const { result } = renderHook(() =>
      useUserManagerActions({ data: removableManagerData, selectedShopId: shopId, onPersonRemoved }),
    );

    act(() => result.current.onRequestRemoveManagerRole());
    expect(result.current.dialog).toEqual({ kind: "removeManagerRole", personId, shopId, requestId });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });
    expect(result.current.dialog).toEqual({ kind: "removeManagerRole", personId, shopId, requestId });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    expect(mocks.removeManagerRole.mock.calls).toEqual([
      [{ shopId, personId, requestId }],
      [{ shopId, personId, requestId }],
    ]);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "管理者権限を外しました",
      description: "スタッフとしての店舗所属は維持しています。",
    });
    expect(onPersonRemoved).not.toHaveBeenCalled();
    expect(result.current.dialog).toBeNull();
  });

  it("店舗所属がない管理者は人物削除のpreviewを送らず権限だけを外す", async () => {
    mocks.removeManagerRole.mockResolvedValue({ changed: true });
    const onPersonRemoved = vi.fn();
    const data: UserDetailData = {
      ...lastActiveManagerData,
      memberships: [],
      canRemoveManagerRole: true,
      managerRoleRemovalDisabledReason: undefined,
    };
    const { result } = renderHook(() => useUserManagerActions({ data, selectedShopId: shopId, onPersonRemoved }));

    act(() => result.current.onRequestRemoveManagerRole());
    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    expect(mocks.removeManagerRole).toHaveBeenCalledExactlyOnceWith({
      shopId,
      personId,
      requestId,
    });
    expect(mocks.removePerson).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "管理者権限を外しました",
      description: "この組織へのアクセスを終了しました。\nユーザー情報とシフト記録は残しています。",
    });
    expect(onPersonRemoved).toHaveBeenCalledOnce();
    expect(result.current.dialog).toBeNull();
  });

  it("人物削除の結果が不明な再押下では同じ対象・preview・requestIdを再利用する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.removePerson.mockRejectedValueOnce(error).mockResolvedValueOnce({ changed: false });
    const onPersonRemoved = vi.fn();
    const { result } = renderHook(() =>
      useUserManagerActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved }),
    );

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toEqual({ kind: "removePerson", personId, shopId, removalPreview, requestId });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });
    expect(result.current.dialog).toEqual({ kind: "removePerson", personId, shopId, removalPreview, requestId });

    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    const expectedArgs = {
      shopId,
      personId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "preview-fingerprint" },
    };
    expect(mocks.removePerson.mock.calls).toEqual([[expectedArgs], [expectedArgs]]);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(onPersonRemoved).toHaveBeenCalledOnce();
    expect(result.current.dialog).toBeNull();
  });

  it("キャンセルするとrequestIdを破棄し、次の確認では新しく発行する", () => {
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(requestId).mockReturnValueOnce(nextRequestId);
    const { result } = renderHook(() =>
      useUserManagerActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toMatchObject({ requestId });
    act(() => result.current.onCloseDialog());
    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toMatchObject({ requestId: nextRequestId });
  });

  it("対象人物または操作店舗が変わると古い確認とrequestIdを破棄する", () => {
    const otherPersonId = "person-other" as Id<"organizationPeople">;
    const otherShopId = "shop-other" as Id<"shops">;
    const { result, rerender } = renderHook(
      ({ data, selectedShopId }: { data: UserDetailData; selectedShopId: Id<"shops"> }) =>
        useUserManagerActions({ data, selectedShopId, onPersonRemoved: vi.fn() }),
      { initialProps: { data: removablePersonData, selectedShopId: shopId } },
    );

    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).not.toBeNull();

    rerender({
      data: {
        ...removablePersonData,
        person: { ...removablePersonData.person, id: otherPersonId },
        shops: [
          ...removablePersonData.shops,
          { shopId: otherShopId, shopName: "別店舗", shopStatus: "active", canChangeMembership: true },
        ],
      },
      selectedShopId: otherShopId,
    });
    expect(result.current.dialog).toBeNull();
  });

  it("previewが更新されると古い確認とrequestIdを破棄する", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: UserDetailData }) =>
        useUserManagerActions({ data, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
      { initialProps: { data: removablePersonData } },
    );

    act(() => result.current.onRequestRemovePerson());
    rerender({
      data: {
        ...removablePersonData,
        removalPreview: { ...removalPreview, assignmentCount: 3, fingerprint: "updated-preview" },
      },
    });
    expect(result.current.dialog).toBeNull();
  });

  it("確認後に割当が変わった場合は古い確認を閉じて再確認を求める", async () => {
    const error = new ConvexError(
      "今日以降のシフトの割り当てが変更されました。\n内容を確認してから、もう一度削除してください。",
    );
    mocks.removePerson.mockRejectedValue(error);
    const { result } = renderHook(() =>
      useUserManagerActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemovePerson());
    await act(async () => {
      await result.current.onConfirmRemoval();
    });

    expect(result.current.dialog).toBeNull();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });
});
