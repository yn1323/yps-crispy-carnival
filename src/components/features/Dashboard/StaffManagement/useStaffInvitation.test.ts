// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const personId = (value: string) => value as Id<"organizationPeople">;
const registrationLinkId = (value: string) => value as Id<"shopRegistrationLinks">;

const mocks = vi.hoisted(() => ({
  addStaffs: vi.fn(),
  addOrganizationPersonToShop: vi.fn(),
  ensureShopRegistrationLink: vi.fn(),
  rotateShopRegistrationLink: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutationIndex = mocks.shopMutationCallCount % 4;
    mocks.shopMutationCallCount += 1;
    if (mutationIndex === 0) return mocks.addStaffs;
    if (mutationIndex === 1) return mocks.addOrganizationPersonToShop;
    if (mutationIndex === 2) return mocks.ensureShopRegistrationLink;
    return mocks.rotateShopRegistrationLink;
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
  mocks.rotateShopRegistrationLink.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
  vi.spyOn(crypto, "randomUUID").mockReturnValue("3fe27945-d0b8-4ea4-bd24-5ce95738af27");
});

describe("useStaffInvitation", () => {
  it("利用人数上限エラーを解決導線へ変換し、自動で再実行しない", async () => {
    mocks.addStaffs.mockRejectedValue(new Error("利用人数が現在のプラン上限を超えます。\n現在50名、上限50名です。"));
    const { result } = renderHook(() => useStaffInvitation(false, true));

    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "51人目", email: "staff51@example.com" }] });
    });

    expect(result.current.peopleCapacityResolution).toEqual({ kind: "limitReached", current: 50, max: 50 });
    expect(mocks.addStaffs).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("削除履歴を画面へ出さず、一度の通常追加として完了する", async () => {
    mocks.addStaffs.mockResolvedValueOnce({ status: "added", staffIds: ["staff-reactivated"] });
    const data = { entries: [{ name: "入力名", email: "hanako@example.com" }] };
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      await result.current.onAddStaffs(data);
    });

    expect(mocks.addStaffs).toHaveBeenCalledOnce();
    expect(mocks.addStaffs).toHaveBeenCalledWith({
      entries: data.entries,
      requestId: "3fe27945-d0b8-4ea4-bd24-5ce95738af27",
    });
    expect(result.current.dialog.isOpen).toBe(false);
    expect(result.current).not.toHaveProperty("reactivationConfirmation");
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "スタッフを追加しました",
      description: "必要な案内通知の送信を受け付けました。\n募集中のシフトがある場合は、提出リンクも送信します。",
    });
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("旧backendの未確定responseを成功扱いせず、再読み込みを案内する", async () => {
    mocks.addStaffs.mockResolvedValueOnce({ status: "legacy-unconfirmed", candidates: [] });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "入力名", email: "hanako@example.com" }] });
    });

    expect(result.current.dialog.isOpen).toBe(true);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(
      new Error("スタッフ追加の処理が更新されました。画面を再読み込みして、もう一度お試しください。"),
    );
  });

  it("閲覧専用へ切り替わると招待Dialogを閉じ、以後の追加処理を開始しない", async () => {
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffInvitation(isReadOnly), {
      initialProps: { isReadOnly: false },
    });

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("manual");
    });
    expect(result.current.dialog.isOpen).toBe(true);
    expect(result.current.selectedMethod).toBe("manual");
    expect(mocks.ensureShopRegistrationLink).not.toHaveBeenCalled();

    rerender({ isReadOnly: true });
    expect(result.current.dialog.isOpen).toBe(false);
    expect(result.current.selectedMethod).toBeNull();
    expect(result.current.registrationUrl).toBeNull();

    mocks.addStaffs.mockClear();
    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "対象スタッフ", email: "staff@example.com" }] });
    });
    expect(mocks.addStaffs).not.toHaveBeenCalled();
  });

  it("開いただけでは登録リンクを取得せず、リンク選択後は同じopen内で成功結果を再利用する", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({
      linkId: registrationLinkId("link-1"),
      registrationUrl: "https://example.com/register",
    });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());

    expect(result.current.dialog.isOpen).toBe(true);
    expect(result.current.selectedMethod).toBeNull();
    expect(result.current.registrationUrl).toBeNull();
    expect(mocks.ensureShopRegistrationLink).not.toHaveBeenCalled();

    await act(async () => {
      result.current.onSelectMethod("link");
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });

    expect(result.current.selectedMethod).toBe("link");
    expect(result.current.registrationUrl).toBe("https://example.com/register");
    expect(result.current.registrationUrlError).toBe(false);
    expect(mocks.ensureShopRegistrationLink).toHaveBeenCalledOnce();

    act(() => result.current.onBackToMethods());
    expect(result.current.selectedMethod).toBeNull();

    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });

    expect(result.current.registrationUrl).toBe("https://example.com/register");
    expect(mocks.ensureShopRegistrationLink).toHaveBeenCalledOnce();
  });

  it("登録リンク取得失敗は局所エラーにし、raw errorをtoastへ出さず再試行できる", async () => {
    const error = new Error("token=raw-secret を含む内部エラー");
    mocks.ensureShopRegistrationLink.mockRejectedValueOnce(error).mockResolvedValueOnce({
      linkId: registrationLinkId("link-after-retry"),
      registrationUrl: "https://example.com/register-after-retry",
    });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });

    expect(result.current.registrationUrl).toBeNull();
    expect(result.current.registrationUrlError).toBe(true);
    expect(result.current.isRegistrationUrlLoading).toBe(false);
    expect(mocks.showErrorToast).not.toHaveBeenCalled();

    await act(async () => {
      result.current.onRetryRegistrationUrl();
      await Promise.resolve();
    });

    expect(result.current.registrationUrl).toBe("https://example.com/register-after-retry");
    expect(result.current.registrationUrlError).toBe(false);
    expect(mocks.ensureShopRegistrationLink).toHaveBeenCalledTimes(2);
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("閉じたdialog sessionの登録リンク取得結果を再open後へ反映しない", async () => {
    let resolveFirst: ((value: { linkId: Id<"shopRegistrationLinks">; registrationUrl: string }) => void) | undefined;
    let resolveSecond: ((value: { linkId: Id<"shopRegistrationLinks">; registrationUrl: string }) => void) | undefined;
    mocks.ensureShopRegistrationLink
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const { result } = renderHook(() => useStaffInvitation());

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("link");
    });
    expect(result.current.isRegistrationUrlLoading).toBe(true);

    act(() => {
      result.current.onClose();
      result.current.onOpen();
      result.current.onSelectMethod("link");
    });
    expect(mocks.ensureShopRegistrationLink).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond?.({
        linkId: registrationLinkId("current-link"),
        registrationUrl: "https://example.com/current-session",
      });
      await Promise.resolve();
    });
    expect(result.current.registrationUrl).toBe("https://example.com/current-session");

    await act(async () => {
      resolveFirst?.({
        linkId: registrationLinkId("stale-link"),
        registrationUrl: "https://example.com/stale-session",
      });
      await Promise.resolve();
    });
    expect(result.current.registrationUrl).toBe("https://example.com/current-session");
    expect(result.current.registrationUrlError).toBe(false);
  });

  it("閉じたdialog sessionの登録リンク取得エラーを再open後へ反映しない", async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    mocks.ensureShopRegistrationLink.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation());

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("link");
    });
    expect(result.current.isRegistrationUrlLoading).toBe(true);

    act(() => {
      result.current.onClose();
      result.current.onOpen();
    });

    await act(async () => {
      rejectFirst?.(new Error("token=stale-secret を含む古いエラー"));
      await Promise.resolve();
    });

    expect(result.current.selectedMethod).toBeNull();
    expect(result.current.registrationUrl).toBeNull();
    expect(result.current.registrationUrlError).toBe(false);
    expect(result.current.isRegistrationUrlLoading).toBe(false);
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("登録リンク再発行をsingle-flightで実行し、処理中はDialogと経路を固定して新しいリンクへ更新する", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({
      linkId: registrationLinkId("link-before-rotation"),
      registrationUrl: "https://example.com/register-before-rotation",
    });
    let resolveRotation:
      | ((value: { status: "rotated"; linkId: Id<"shopRegistrationLinks">; registrationUrl: string }) => void)
      | undefined;
    mocks.rotateShopRegistrationLink.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRotation = resolve;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });
    act(() => result.current.onRequestRegistrationLinkRotation());
    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(true);

    let firstRotation: Promise<unknown> | undefined;
    let secondRotation: Promise<unknown> | undefined;
    act(() => {
      firstRotation = result.current.onRotateRegistrationLink();
      secondRotation = result.current.onRotateRegistrationLink();
      result.current.onBackToMethods();
      result.current.onClose();
    });

    expect(mocks.rotateShopRegistrationLink).toHaveBeenCalledExactlyOnceWith({
      expectedLinkId: "link-before-rotation",
    });
    expect(result.current.dialog.isOpen).toBe(true);
    expect(result.current.selectedMethod).toBe("link");
    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(true);
    expect(result.current.isRotatingRegistrationLink).toBe(true);

    await act(async () => {
      resolveRotation?.({
        status: "rotated",
        linkId: registrationLinkId("link-after-rotation"),
        registrationUrl: "https://example.com/register-after-rotation",
      });
      await Promise.all([firstRotation, secondRotation]);
    });

    expect(result.current.registrationLinkId).toBe("link-after-rotation");
    expect(result.current.registrationUrl).toBe("https://example.com/register-after-rotation");
    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(false);
    expect(result.current.isRotatingRegistrationLink).toBe(false);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "登録リンクを再発行しました" });
  });

  it("再発行済みresponseは現在のリンクへ同期し、再発行成功を重ねて通知しない", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({
      linkId: registrationLinkId("stale-expected-link"),
      registrationUrl: "https://example.com/stale-expected-link",
    });
    mocks.rotateShopRegistrationLink.mockResolvedValue({
      status: "current",
      linkId: registrationLinkId("current-link"),
      registrationUrl: "https://example.com/current-link",
    });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });
    act(() => result.current.onRequestRegistrationLinkRotation());
    await act(async () => {
      await result.current.onRotateRegistrationLink();
    });

    expect(result.current.registrationLinkId).toBe("current-link");
    expect(result.current.registrationUrl).toBe("https://example.com/current-link");
    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(false);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("再発行失敗後は確認画面を維持し、busy解除後に同じリンクから再試行できる", async () => {
    const error = new Error("登録リンクを再発行できませんでした");
    mocks.ensureShopRegistrationLink.mockResolvedValue({
      linkId: registrationLinkId("retry-source-link"),
      registrationUrl: "https://example.com/retry-source-link",
    });
    mocks.rotateShopRegistrationLink.mockRejectedValueOnce(error).mockResolvedValueOnce({
      status: "rotated",
      linkId: registrationLinkId("retry-result-link"),
      registrationUrl: "https://example.com/retry-result-link",
    });
    const { result } = renderHook(() => useStaffInvitation());

    act(() => result.current.onOpen());
    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });
    act(() => result.current.onRequestRegistrationLinkRotation());
    await act(async () => {
      await result.current.onRotateRegistrationLink();
    });

    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(true);
    expect(result.current.isRotatingRegistrationLink).toBe(false);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onRotateRegistrationLink();
    });

    expect(mocks.rotateShopRegistrationLink).toHaveBeenCalledTimes(2);
    expect(result.current.registrationLinkId).toBe("retry-result-link");
    expect(result.current.isConfirmingRegistrationLinkRotation).toBe(false);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "登録リンクを再発行しました" });
  });

  it("閉じたdialog sessionの再発行responseを状態やtoastへ反映しない", async () => {
    mocks.ensureShopRegistrationLink.mockResolvedValue({
      linkId: registrationLinkId("link-before-read-only"),
      registrationUrl: "https://example.com/register-before-read-only",
    });
    let resolveRotation:
      | ((value: { status: "rotated"; linkId: Id<"shopRegistrationLinks">; registrationUrl: string }) => void)
      | undefined;
    mocks.rotateShopRegistrationLink.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRotation = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffInvitation(isReadOnly), {
      initialProps: { isReadOnly: false },
    });

    act(() => result.current.onOpen());
    await act(async () => {
      result.current.onSelectMethod("link");
      await Promise.resolve();
    });
    act(() => result.current.onRequestRegistrationLinkRotation());
    let rotation: Promise<unknown> | undefined;
    act(() => {
      rotation = result.current.onRotateRegistrationLink();
    });

    rerender({ isReadOnly: true });
    expect(result.current.dialog.isOpen).toBe(false);

    await act(async () => {
      resolveRotation?.({
        status: "rotated",
        linkId: registrationLinkId("stale-rotated-link"),
        registrationUrl: "https://example.com/stale-rotated-link",
      });
      await rotation;
    });

    expect(result.current.registrationLinkId).toBeNull();
    expect(result.current.registrationUrl).toBeNull();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("手入力追加中は方法選択へ戻らず、別経路のスタッフ追加を開始しない", async () => {
    let resolveAddition: ((value: { status: "added"; staffIds: string[] }) => void) | undefined;
    mocks.addStaffs.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAddition = resolve;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation(false, true));
    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("manual");
    });

    let addition: Promise<unknown> | undefined;
    act(() => {
      addition = result.current.onAddStaffs({ entries: [{ name: "追加対象", email: "target@example.com" }] });
      result.current.onBackToMethods();
      result.current.onSelectMethod("organization");
      void result.current.onAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.selectedMethod).toBe("manual");
    expect(result.current.dialog.isOpen).toBe(true);
    expect(mocks.addStaffs).toHaveBeenCalledOnce();
    expect(mocks.addOrganizationPersonToShop).not.toHaveBeenCalled();

    await act(async () => {
      resolveAddition?.({ status: "added", staffIds: ["staff-1"] });
      await addition;
    });
  });

  it("登録済みスタッフの連打を一度の追加にまとめ、成功時だけモーダルを閉じる", async () => {
    let resolveAddition: ((value: { staffId: string }) => void) | undefined;
    mocks.addOrganizationPersonToShop.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAddition = resolve;
        }),
    );
    const { result } = renderHook(() => useStaffInvitation(false, true));

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("organization");
    });

    let firstAddition: Promise<unknown> | undefined;
    let secondAddition: Promise<unknown> | undefined;
    act(() => {
      firstAddition = result.current.onAddOrganizationPerson(personId("person-1"));
      secondAddition = result.current.onAddOrganizationPerson(personId("person-1"));
      result.current.onClose();
    });

    expect(mocks.addOrganizationPersonToShop).toHaveBeenCalledOnce();
    expect(mocks.addOrganizationPersonToShop).toHaveBeenCalledWith({
      personId: "person-1",
      requestId: "3fe27945-d0b8-4ea4-bd24-5ce95738af27",
    });
    expect(result.current.dialog.isOpen).toBe(true);
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

  it("登録済みスタッフの追加に失敗した場合はモーダルを閉じない", async () => {
    const error = new Error("追加できませんでした");
    mocks.addOrganizationPersonToShop.mockRejectedValue(error);
    const { result } = renderHook(() => useStaffInvitation(false, true));

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("organization");
    });
    await act(async () => {
      await result.current.onAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.dialog.isOpen).toBe(true);
    expect(mocks.showErrorToast).toHaveBeenCalledWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("登録済みスタッフ追加が表示対象から外れたら方法選択と古い追加handlerを無効化する", async () => {
    const { result, rerender } = renderHook(
      ({ showOrganizationPeopleAddition }) => useStaffInvitation(false, showOrganizationPeopleAddition),
      { initialProps: { showOrganizationPeopleAddition: true } },
    );
    const previousAddOrganizationPerson = result.current.onAddOrganizationPerson;

    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("organization");
    });
    expect(result.current.selectedMethod).toBe("organization");
    rerender({ showOrganizationPeopleAddition: false });
    expect(result.current.selectedMethod).toBeNull();

    act(() => result.current.onSelectMethod("organization"));
    await act(async () => {
      await previousAddOrganizationPerson(personId("person-1"));
    });

    expect(result.current.selectedMethod).toBeNull();
    expect(result.current.showOrganizationPeopleAddition).toBe(false);
    expect(mocks.addOrganizationPersonToShop).not.toHaveBeenCalled();
  });

  it("登録済みスタッフ追加の処理中に表示対象から外れた場合はDialogを閉じずtoastを表示しない", async () => {
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
    act(() => {
      result.current.onOpen();
      result.current.onSelectMethod("organization");
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
