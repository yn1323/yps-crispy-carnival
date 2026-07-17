// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationBillingView, OrganizationPersonView, OrganizationShopView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  selectedShop: {
    shopId: "shop-current",
    shopName: "渋谷店",
    shopStatus: "active" as const,
    organizationId: "organization-1",
    organizationName: "さくらダイニング",
    memberStatus: "active" as const,
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { usePersonManagerAssignmentController } from "./ManagerInvitation/usePersonManagerAssignmentController";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { usePersonProfileController } from "./PersonProfile/usePersonProfileController";
import { usePersonRemovalController } from "./PersonRemoval/usePersonRemovalController";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";

const person: OrganizationPersonView = {
  id: "person-1",
  name: "田中 太郎",
  email: "tanaka@example.com",
  managerRole: "active",
  isStaff: true,
  shopNames: ["渋谷店"],
  canRemoveManagerRole: true,
  canRemove: true,
};

const shop: OrganizationShopView = {
  id: "shop-1",
  name: "渋谷店",
  staffCount: 3,
  canDelete: true,
};

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  peopleUsage: { current: 4, max: 15 },
  shopUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  invoices: [],
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
};

beforeEach(() => {
  mocks.mutation.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizationSettings controllers", () => {
  it("グループ名の変更中に権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ canUpdate }) =>
        useOrganizationNameController({ organizationName: "さくらダイニング", canUpdateOrganizationName: canUpdate }),
      { initialProps: { canUpdate: true } },
    );
    act(() => result.current.open());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canUpdate: false });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleSubmit("変更後のグループ名"));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("ユーザーが対象外になったら確認Dialogを閉じ、古い確定操作を拒否する", async () => {
    const { result, rerender } = renderHook(({ people }) => usePersonRemovalController(people), {
      initialProps: { people: [person] },
    });
    act(() => result.current.removePerson(person.id));
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ people: [] });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    act(() => staleSubmit());
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("店舗削除の権限を失うと古い確定操作を拒否する", async () => {
    const { result, rerender } = renderHook((input) => useShopManagementController(input), {
      initialProps: { canAddShop: true, shops: [shop] },
    });
    act(() => result.current.openShop(shop.id));
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canAddShop: true, shops: [{ ...shop, canDelete: false }] });

    await act(async () => {
      await staleSubmit({ kind: "deleteShop", shopId: shop.id });
    });
    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("請求設定の権限を失うとDialogを閉じ、古い請求先変更を拒否する", async () => {
    const input = { billing };
    const { result, rerender } = renderHook((props) => useBillingSettingsController(props), {
      initialProps: input,
    });
    act(() => result.current.updateBillingEmail());
    const staleEmailSubmit = result.current.dialog.onSubmit;

    rerender({
      ...input,
      billing: { ...billing, canUpdateBillingEmail: false },
    });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleEmailSubmit("new@example.com"));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("グループ設定から人物の氏名とメールアドレスを更新する", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const target = { ...person, managerRole: "none" as const };
    const { result } = renderHook(() => usePersonProfileController([target]));

    let succeeded = false;
    await act(async () => {
      succeeded =
        (await result.current.update(target.id, {
          name: "田中 花子",
          email: "hanako@example.com",
        })) === true;
    });

    expect(succeeded).toBe(true);
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      shopId: "shop-current",
      personId: target.id,
      name: "田中 花子",
      email: "hanako@example.com",
      requestId: "request-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "ユーザー情報を更新しました" });
  });

  it("既存スタッフへ管理者のログイン案内を送る", async () => {
    mocks.mutation.mockResolvedValue({ status: "issued", invitationId: "invitation-1" });
    const target = { ...person, managerRole: "none" as const };
    const { result } = renderHook(() => usePersonManagerAssignmentController([target]));

    let succeeded = false;
    await act(async () => {
      succeeded = (await result.current.assign(target.id)) === true;
    });

    expect(succeeded).toBe(true);
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      shopId: "shop-current",
      personId: target.id,
      requestId: "request-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "ログイン案内を送りました",
      description: "本人のアカウントと店舗人物の連携後に管理者になります。",
    });
  });

  it("管理者枠が予約済みでも、同じ外部招待を再送するためのDialogを開く", async () => {
    mocks.mutation.mockResolvedValue({ status: "issued", invitationId: "invitation-1" });
    const { result } = renderHook(() =>
      useManagerInvitationController({
        canInviteManager: false,
        canOpenManagerInvitation: true,
        managerInvitationMode: "addition",
        freeManagerExchangeCandidates: [],
      }),
    );

    act(() => result.current.open());
    expect(result.current.dialog).toMatchObject({ isOpen: true, isResendOnly: true });

    act(() => {
      result.current.dialog.onSubmit({ name: "佐藤 花子", email: "sato@example.com" });
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        name: "佐藤 花子",
        email: "sato@example.com",
        requestId: "request-1",
      }),
    );
    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
  });
});
