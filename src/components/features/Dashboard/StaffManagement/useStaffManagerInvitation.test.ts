// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff, StaffManagerInvitationState } from "../types";

const mocks = vi.hoisted(() => ({
  createForStaff: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => mocks.createForStaff,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useStaffManagerInvitation } from "./useStaffManagerInvitation";

const availableAddition: StaffManagerInvitationState = {
  kind: "available",
  mode: "addition",
  replacesStaleInvitation: false,
};

const staff = (overrides: Partial<Staff> = {}): Staff => ({
  _id: "staff-target" as Staff["_id"],
  organizationPersonId: "person-target" as Staff["organizationPersonId"],
  name: "対象スタッフ",
  email: "staff@example.com",
  isManager: false,
  isLineLinked: false,
  isLineFollowing: false,
  excludedFromShift: false,
  isOrganizationLinked: true,
  managerInvitationState: availableAddition,
  ...overrides,
});

beforeEach(() => {
  mocks.createForStaff.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  vi.spyOn(crypto, "randomUUID").mockReturnValue("2b79a222-176c-44d6-9b39-d090c1f72efb");
});

describe("useStaffManagerInvitation", () => {
  it("選択中スタッフをrequestId付きで招待し、作成成功を返す", async () => {
    mocks.createForStaff.mockResolvedValue({ status: "created", invitationId: "invitation-1" });
    const target = staff();
    const { result } = renderHook(() => useStaffManagerInvitation(target));
    let succeeded = false;

    await act(async () => {
      succeeded = await result.current.onInvite(target);
    });

    expect(succeeded).toBe(true);
    expect(mocks.createForStaff).toHaveBeenCalledExactlyOnceWith({
      staffId: target._id,
      requestId: "2b79a222-176c-44d6-9b39-d090c1f72efb",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "ログイン案内を送りました",
      description: "本人が案内先のメールアドレスでログインし、招待を受け入れると管理者になります。",
    });
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("すでに同じ招待が受付済みでも成功として扱い、Free交代の案内を表示する", async () => {
    mocks.createForStaff.mockResolvedValue({ status: "alreadyPending", invitationId: "invitation-1" });
    const target = staff({
      managerInvitationState: {
        kind: "available",
        mode: "freeManagerExchange",
        replacesStaleInvitation: false,
      },
    });
    const { result } = renderHook(() => useStaffManagerInvitation(target));
    let succeeded = false;

    await act(async () => {
      succeeded = await result.current.onInvite(target);
    });

    expect(succeeded).toBe(true);
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "ログイン案内を再送しました",
      description: "以前のURLは利用できません。",
    });
  });

  it("確定を短時間に連打してもmutationを一度だけ実行する", async () => {
    let resolveMutation: ((value: { status: "created"; invitationId: string }) => void) | undefined;
    mocks.createForStaff.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const target = staff();
    const { result } = renderHook(() => useStaffManagerInvitation(target));

    const requests: Promise<boolean>[] = [];
    act(() => {
      requests.push(result.current.onInvite(target), result.current.onInvite(target));
    });

    expect(mocks.createForStaff).toHaveBeenCalledOnce();
    resolveMutation?.({ status: "created", invitationId: "invitation-1" });

    let outcomes: boolean[] = [];
    await act(async () => {
      outcomes = await Promise.all(requests);
    });
    expect(outcomes).toEqual([true, false]);
    expect(mocks.createForStaff).toHaveBeenCalledOnce();
  });

  it("古いcallbackは対象スタッフが変わった後に送信しない", async () => {
    const target = staff();
    const anotherStaff = staff({ _id: "staff-another" as Staff["_id"], name: "別スタッフ" });
    const { result, rerender } = renderHook(({ selectedStaff }) => useStaffManagerInvitation(selectedStaff), {
      initialProps: { selectedStaff: target as Staff | null },
    });
    const staleCallback = result.current.onInvite;

    rerender({ selectedStaff: anotherStaff });
    let succeeded = true;
    await act(async () => {
      succeeded = await staleCallback(target);
    });

    expect(succeeded).toBe(false);
    expect(mocks.createForStaff).not.toHaveBeenCalled();
  });

  it("古いcallbackは閲覧専用へ変わった後に送信しない", async () => {
    const target = staff();
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffManagerInvitation(target, { isReadOnly }), {
      initialProps: { isReadOnly: false },
    });
    const staleCallback = result.current.onInvite;

    rerender({ isReadOnly: true });
    await act(async () => {
      await staleCallback(target);
    });

    expect(mocks.createForStaff).not.toHaveBeenCalled();
  });

  it("古いcallbackは招待capabilityを失った後に送信しない", async () => {
    const target = staff();
    const unavailableTarget = staff({
      managerInvitationState: { kind: "unavailable", reason: "管理者枠に空きがありません。" },
    });
    const { result, rerender } = renderHook(({ selectedStaff }) => useStaffManagerInvitation(selectedStaff), {
      initialProps: { selectedStaff: target },
    });
    const staleCallback = result.current.onInvite;

    rerender({ selectedStaff: unavailableTarget });
    await act(async () => {
      await staleCallback(target);
    });

    expect(mocks.createForStaff).not.toHaveBeenCalled();
  });

  it("古いcallbackは管理者招待がhiddenになった後に送信しない", async () => {
    const target = staff();
    const hiddenTarget = staff({ managerInvitationState: { kind: "hidden" } });
    const { result, rerender } = renderHook(({ selectedStaff }) => useStaffManagerInvitation(selectedStaff), {
      initialProps: { selectedStaff: target },
    });
    const staleCallback = result.current.onInvite;

    rerender({ selectedStaff: hiddenTarget });
    await act(async () => {
      await staleCallback(target);
    });

    expect(mocks.createForStaff).not.toHaveBeenCalled();
  });

  it("失敗を表示してfalseを返し、自動再送しない", async () => {
    const error = new Error("管理者と招待中の管理者は、組織全体で5名までです。");
    mocks.createForStaff.mockRejectedValue(error);
    const target = staff();
    const { result } = renderHook(() => useStaffManagerInvitation(target));
    let succeeded = true;

    await act(async () => {
      succeeded = await result.current.onInvite(target);
    });

    expect(succeeded).toBe(false);
    expect(mocks.createForStaff).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
