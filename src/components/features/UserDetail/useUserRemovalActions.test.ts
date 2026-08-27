// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  removePersonRef: Symbol("removePerson"),
  removePerson: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { organization: { mutations: { removePersonFromOrganization: mocks.removePersonRef } } },
}));

vi.mock("convex/react", () => ({ useMutation: () => mocks.removePerson }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserRemovalActions } from "./useUserRemovalActions";

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
const removablePersonData = {
  person: { id: personId, name: "対象ユーザー", email: "target@example.com", hasLinkedAccount: true },
  isSelf: false,
  managerRole: "none",
  hasManagerInvitation: false,
  canRemoveManagerRole: false,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: true,
  removeDisabledReason: undefined,
  removalPreview,
  canWrite: true,
  line: {
    status: "unlinked",
    actionShopId: shopId,
    sourceStaffId: null,
    sourceShopId: null,
    canLink: false,
    canDisconnect: false,
  },
  membershipFingerprint: "membership-fingerprint",
  shops: [{ shopId, shopName: "渋谷店", shopStatus: "active", canChangeMembership: true }],
  memberships: [],
} as UserDetailData;

beforeEach(() => {
  mocks.removePerson.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
});

afterEach(() => vi.unstubAllGlobals());

describe("useUserRemovalActions", () => {
  it.each([null, "unknown-shop"])("選択店舗が未指定または不正でも組織内の店舗を使う: %s", async (selectedShopId) => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.removePerson.mockRejectedValue(error);
    const { result } = renderHook(() =>
      useUserRemovalActions({ data: removablePersonData, selectedShopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemovePerson());
    await act(async () => result.current.onConfirmRemoval());

    expect(mocks.removePerson).toHaveBeenCalledExactlyOnceWith({
      shopId,
      personId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "preview-fingerprint" },
    });
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("結果不明の再押下では同じpreviewとrequestIdを再利用する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.removePerson.mockRejectedValueOnce(error).mockResolvedValueOnce({ changed: false });
    const onPersonRemoved = vi.fn();
    const { result } = renderHook(() =>
      useUserRemovalActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved }),
    );

    act(() => result.current.onRequestRemovePerson());
    await act(async () => result.current.onConfirmRemoval());
    await act(async () => result.current.onConfirmRemoval());

    const args = {
      shopId,
      personId,
      requestId,
      removalPreview: { assignmentCount: 2, fingerprint: "preview-fingerprint" },
    };
    expect(mocks.removePerson.mock.calls).toEqual([[args], [args]]);
    expect(onPersonRemoved).toHaveBeenCalledOnce();
  });

  it("キャンセル後の再確認では新しいrequestIdを発行する", () => {
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(requestId).mockReturnValueOnce(nextRequestId);
    const { result } = renderHook(() =>
      useUserRemovalActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemovePerson());
    act(() => result.current.onCloseDialog());
    act(() => result.current.onRequestRemovePerson());
    expect(result.current.dialog).toMatchObject({ requestId: nextRequestId });
  });

  it("preview更新時は古い確認を閉じる", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: UserDetailData }) =>
        useUserRemovalActions({ data, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
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

  it("対象人物または操作店舗が変わると古い確認を閉じる", () => {
    const otherPersonId = "person-other" as Id<"organizationPeople">;
    const otherShopId = "shop-other" as Id<"shops">;
    const { result, rerender } = renderHook(
      ({ data, selectedShopId }: { data: UserDetailData; selectedShopId: Id<"shops"> }) =>
        useUserRemovalActions({ data, selectedShopId, onPersonRemoved: vi.fn() }),
      { initialProps: { data: removablePersonData, selectedShopId: shopId } },
    );

    act(() => result.current.onRequestRemovePerson());
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

  it("割当previewの競合エラーでは確認を閉じて再確認を求める", async () => {
    const error = new ConvexError(
      "今日以降のシフトの割り当てが変更されました。\n内容を確認してから、もう一度削除してください。",
    );
    mocks.removePerson.mockRejectedValue(error);
    const { result } = renderHook(() =>
      useUserRemovalActions({ data: removablePersonData, selectedShopId: shopId, onPersonRemoved: vi.fn() }),
    );

    act(() => result.current.onRequestRemovePerson());
    await act(async () => result.current.onConfirmRemoval());

    expect(result.current.dialog).toBeNull();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("削除capabilityがない場合は確認を開かない", () => {
    const { result } = renderHook(() =>
      useUserRemovalActions({
        data: { ...removablePersonData, canRemove: false, removeDisabledReason: "管理者は削除できません。" },
        selectedShopId: shopId,
        onPersonRemoved: vi.fn(),
      }),
    );

    act(() => result.current.onRequestRemovePerson());

    expect(result.current.dialog).toBeNull();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
});
