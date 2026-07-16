// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addStaffs: vi.fn(),
  ensureShopRegistrationLink: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const isAddStaffs = mocks.shopMutationCallCount % 2 === 0;
    mocks.shopMutationCallCount += 1;
    return isAddStaffs ? mocks.addStaffs : mocks.ensureShopRegistrationLink;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useStaffInvitation } from "./useStaffInvitation";

beforeEach(() => {
  mocks.addStaffs.mockReset();
  mocks.ensureShopRegistrationLink.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
  vi.spyOn(crypto, "randomUUID").mockReturnValue("3fe27945-d0b8-4ea4-bd24-5ce95738af27");
});

describe("useStaffInvitation", () => {
  it("利用人数上限エラーを解決導線へ変換し、自動で再追加しない", async () => {
    mocks.addStaffs.mockRejectedValue(new Error("利用人数が現在のプラン上限を超えます（現在 30名 / 上限 30名）"));
    const { result } = renderHook(() => useStaffInvitation());

    await act(async () => {
      await result.current.onAddStaffs({ entries: [{ name: "31人目", email: "staff31@example.com" }] });
    });

    expect(result.current.peopleCapacityResolution).toEqual({ kind: "contact", current: 30, max: 30 });
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
});
