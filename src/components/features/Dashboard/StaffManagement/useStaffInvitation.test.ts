// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const personId = (value: string) => value as Id<"organizationPeople">;

const mocks = vi.hoisted(() => ({
  addStaffs: vi.fn(),
  addOrganizationPersonToShop: vi.fn(),
  ensureShopRegistrationLink: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutationIndex = mocks.shopMutationCallCount % 3;
    mocks.shopMutationCallCount += 1;
    if (mutationIndex === 0) return mocks.addStaffs;
    if (mutationIndex === 1) return mocks.addOrganizationPersonToShop;
    return mocks.ensureShopRegistrationLink;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useStaffInvitation } from "./useStaffInvitation";

beforeEach(() => {
  mocks.addStaffs.mockReset();
  mocks.addOrganizationPersonToShop.mockReset();
  mocks.ensureShopRegistrationLink.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
  vi.spyOn(crypto, "randomUUID").mockReturnValue("3fe27945-d0b8-4ea4-bd24-5ce95738af27");
});

describe("useStaffInvitation", () => {
  it("利用人数上限エラーを解決導線へ変換し、自動で再追加しない", async () => {
    mocks.addStaffs.mockRejectedValue(new Error("利用人数が現在のプラン上限を超えます。\n現在50名、上限50名です。"));
    const { result } = renderHook(() => useStaffInvitation(false, true));

    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "51人目", email: "staff51@example.com" }] });
    });

    expect(result.current.peopleCapacityResolution).toEqual({ kind: "limitReached", current: 50, max: 50 });
    expect(mocks.addStaffs).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("削除済み人物は登録情報を確認して同じrequestIdで明示再追加する", async () => {
    mocks.addStaffs
      .mockResolvedValueOnce({
        status: "requiresConfirmation",
        candidates: [
          {
            personId: "person-removed",
            name: "登録済み 花子",
            email: "hanako@example.com",
          },
        ],
      })
      .mockResolvedValueOnce({ status: "added", staffIds: ["staff-reactivated"] });
    const data = { entries: [{ name: "入力名", email: "hanako@example.com" }] };
    const { result } = renderHook(() => useStaffInvitation());

    await act(async () => {
      await result.current.onAddStaffs(data);
    });

    expect(result.current.reactivationConfirmation.dialog.isOpen).toBe(true);
    expect(result.current.reactivationConfirmation.candidates).toEqual([
      {
        personId: "person-removed",
        name: "登録済み 花子",
        email: "hanako@example.com",
      },
    ]);
    expect(mocks.addStaffs).toHaveBeenNthCalledWith(1, {
      entries: data.entries,
      requestId: "3fe27945-d0b8-4ea4-bd24-5ce95738af27",
    });

    await act(async () => {
      await result.current.reactivationConfirmation.onConfirm();
    });

    expect(mocks.addStaffs).toHaveBeenNthCalledWith(2, {
      entries: data.entries,
      requestId: "3fe27945-d0b8-4ea4-bd24-5ce95738af27",
      confirmReactivationPersonIds: ["person-removed"],
    });
    expect(result.current.reactivationConfirmation.dialog.isOpen).toBe(false);
    expect(result.current.reactivationConfirmation.candidates).toEqual([]);
    expect(mocks.showSuccessToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "スタッフを再追加し、案内通知を送りました" }),
    );
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("閲覧専用へ切り替わると招待Dialogを閉じ、以後の追加処理を開始しない", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({ registrationUrl: "https://example.com/register" });
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffInvitation(isReadOnly), {
      initialProps: { isReadOnly: false },
    });

    await act(async () => {
      result.current.onOpen();
      await Promise.resolve();
    });
    expect(result.current.dialog.isOpen).toBe(true);

    rerender({ isReadOnly: true });
    expect(result.current.dialog.isOpen).toBe(false);
    expect(result.current.registrationUrl).toBeNull();

    mocks.addStaffs.mockClear();
    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "対象スタッフ", email: "staff@example.com" }] });
    });
    expect(mocks.addStaffs).not.toHaveBeenCalled();
  });

  it("モーダルを開くたびにリンク招待タブへ戻す", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({ registrationUrl: "https://example.com/register" });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onTabChange("manual"));
    expect(result.current.activeTab).toBe("manual");

    await act(async () => {
      result.current.onOpen();
      await Promise.resolve();
    });

    expect(result.current.activeTab).toBe("link");
    expect(result.current.registrationUrl).toBe("https://example.com/register");
  });

  it("手入力追加中はタブ切替と別経路のスタッフ追加を開始しない", async () => {
    let resolveAddition: ((value: { status: "added"; staffIds: string[] }) => void) | undefined;
    mocks.addStaffs.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAddition = resolve;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation());
    act(() => result.current.onTabChange("manual"));

    let addition: Promise<unknown> | undefined;
    act(() => {
      addition = result.current.onAddStaffs({ entries: [{ name: "追加対象", email: "target@example.com" }] });
      result.current.onTabChange("organization");
      void result.current.onAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.activeTab).toBe("manual");
    expect(mocks.addStaffs).toHaveBeenCalledOnce();
    expect(mocks.addOrganizationPersonToShop).not.toHaveBeenCalled();

    await act(async () => {
      resolveAddition?.({ status: "added", staffIds: ["staff-1"] });
      await addition;
    });
  });

  it("他店舗スタッフの連打を一度の追加にまとめ、成功時だけモーダルを閉じる", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({ registrationUrl: "https://example.com/register" });
    let resolveAddition: ((value: { staffId: string }) => void) | undefined;
    mocks.addOrganizationPersonToShop.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAddition = resolve;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation(false, true));

    await act(async () => {
      result.current.onOpen();
      await Promise.resolve();
    });

    let firstAddition: Promise<unknown> | undefined;
    let secondAddition: Promise<unknown> | undefined;
    act(() => {
      firstAddition = result.current.onAddOrganizationPerson(personId("person-1"));
      secondAddition = result.current.onAddOrganizationPerson(personId("person-1"));
    });

    expect(mocks.addOrganizationPersonToShop).toHaveBeenCalledOnce();
    expect(mocks.addOrganizationPersonToShop).toHaveBeenCalledWith({
      personId: "person-1",
      requestId: "3fe27945-d0b8-4ea4-bd24-5ce95738af27",
    });
    expect(result.current.addingOrganizationPersonId).toBe("person-1");

    await act(async () => {
      resolveAddition?.({ staffId: "staff-1" });
      await Promise.all([firstAddition, secondAddition]);
    });

    expect(result.current.dialog.isOpen).toBe(false);
    expect(result.current.addingOrganizationPersonId).toBeNull();
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "スタッフを追加しました",
      description: "この店舗のスタッフとして追加しました。",
    });
  });

  it("他店舗スタッフの追加に失敗した場合はモーダルを閉じない", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({ registrationUrl: "https://example.com/register" });
    const error = new Error("追加できませんでした");
    mocks.addOrganizationPersonToShop.mockRejectedValue(error);
    const { result } = renderHook(() => useStaffInvitation(false, true));

    await act(async () => {
      result.current.onOpen();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.onAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.dialog.isOpen).toBe(true);
    expect(mocks.showErrorToast).toHaveBeenCalledWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("他店舗スタッフ追加が非公開ならタブ切替と古い追加handlerを無効化する", async () => {
    const { result, rerender } = renderHook(
      ({ showOrganizationPeopleAddition }) => useStaffInvitation(false, showOrganizationPeopleAddition),
      { initialProps: { showOrganizationPeopleAddition: true } },
    );
    const previousAddOrganizationPerson = result.current.onAddOrganizationPerson;

    act(() => result.current.onTabChange("organization"));
    expect(result.current.activeTab).toBe("organization");
    rerender({ showOrganizationPeopleAddition: false });
    expect(result.current.activeTab).toBe("link");

    act(() => result.current.onTabChange("organization"));
    await act(async () => {
      await previousAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.activeTab).toBe("link");
    expect(result.current.showOrganizationPeopleAddition).toBe(false);
    expect(mocks.addOrganizationPersonToShop).not.toHaveBeenCalled();
  });

  it("他店舗スタッフ追加の処理中に非公開へ切り替わった場合はDialogを閉じずtoastを表示しない", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({ registrationUrl: "https://example.com/register" });
    let resolveAddition: ((value: { staffId: string }) => void) | undefined;
    mocks.addOrganizationPersonToShop.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAddition = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ showOrganizationPeopleAddition }) => useStaffInvitation(false, showOrganizationPeopleAddition),
      { initialProps: { showOrganizationPeopleAddition: true } },
    );
    await act(async () => {
      result.current.onOpen();
      await Promise.resolve();
    });

    let addition: Promise<unknown> | undefined;
    act(() => {
      addition = result.current.onAddOrganizationPerson(personId("person-1"));
    });
    rerender({ showOrganizationPeopleAddition: false });
    await act(async () => {
      resolveAddition?.({ staffId: "staff-1" });
      await addition;
    });

    expect(result.current.dialog.isOpen).toBe(true);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });
});
