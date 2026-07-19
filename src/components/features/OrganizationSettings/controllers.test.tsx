// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationBillingView, OrganizationPersonView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  setAtom: vi.fn(),
  selectedShop: {
    shopId: "shop-current",
    shopName: "渋谷店",
    shopStatus: "active" as const,
    organizationId: "organization-1",
    organizationName: "さくらダイニング",
    memberStatus: "active" as const,
  },
}));

vi.mock("convex/react", async () => {
  return {
    useMutation: () => mocks.mutation,
  };
});

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
  useSetAtom: () => mocks.setAtom,
}));

import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { useOrganizationDeletionController } from "./OrganizationDeletion/useOrganizationDeletionController";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";

const person: OrganizationPersonView = {
  id: "person-1",
  name: "田中 太郎",
  email: "tanaka@example.com",
  managerRole: "active",
  isStaff: true,
  shopNames: ["渋谷店"],
  shopIds: ["shop-current"],
  canRemoveManagerRole: true,
  canRemove: true,
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
  mocks.setAtom.mockReset();
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

  it("店舗追加の権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook((input) => useShopManagementController(input), {
      initialProps: { canAddShop: true },
    });
    act(() => result.current.addShop());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canAddShop: false });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    await act(async () => {
      await staleSubmit({
        kind: "addShop",
        data: {
          shopName: "新宿店",
          regularClosedDays: [],
          submissionPattern: { kind: "dateOnly" },
        },
      });
    });
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("店舗追加は短時間に連続送信しても一度だけ受け付ける", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.mutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({ changed: true, accepted: true });
        }),
    );
    const { result } = renderHook((input) => useShopManagementController(input), {
      initialProps: { canAddShop: true },
    });
    const operation = {
      kind: "addShop" as const,
      data: {
        shopName: "新宿店",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" as const },
      },
    };

    act(() => result.current.addShop());
    act(() => {
      result.current.dialog.onSubmit(operation);
      result.current.dialog.onSubmit(operation);
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        ...operation.data,
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );
    await act(async () => resolveMutation?.());
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "店舗を追加しました",
      }),
    );
  });

  it("グループ削除は名前を送信せず固定した対象情報で一度だけ実行する", async () => {
    mocks.mutation.mockImplementation(() => new Promise(() => undefined));
    const input = {
      organizationId: "organization-1",
      organizationUpdatedAt: 1_721_286_400_000,
      organizationName: "さくらダイニング",
      canDeleteOrganization: true,
      selectedShopId: "shop-current",
      shops: [
        {
          shopId: "shop-current",
          shopName: "渋谷店",
          shopStatus: "active" as const,
          organizationId: "organization-1",
          organizationName: "さくらダイニング",
          organizationPlan: "free" as const,
          memberStatus: "active" as const,
        },
      ],
    };
    const { result } = renderHook(() => useOrganizationDeletionController(input));

    act(() => result.current.open());
    expect(result.current.dialog.dialog).toEqual({
      intentKey: "request-1",
      organizationName: "さくらダイニング",
    });
    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        organizationId: "organization-1",
        confirmOrganizationId: "organization-1",
        expectedOrganizationUpdatedAt: 1_721_286_400_000,
        requestId: "request-1",
      }),
    );
  });

  it("グループ削除の可否や対象が変わると古い確定操作を拒否する", async () => {
    const initialInput = {
      organizationId: "organization-1",
      organizationUpdatedAt: 1_721_286_400_000,
      organizationName: "さくらダイニング",
      canDeleteOrganization: true,
      selectedShopId: "shop-current",
      shops: [],
    };
    const { result, rerender } = renderHook((input) => useOrganizationDeletionController(input), {
      initialProps: initialInput,
    });
    act(() => result.current.open());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ ...initialInput, canDeleteOrganization: false });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    await act(async () => staleSubmit());
    expect(mocks.mutation).not.toHaveBeenCalled();
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

  it("管理者枠が予約済みでも、同じ外部招待を再送するためのDialogを開く", async () => {
    mocks.mutation.mockResolvedValue({ status: "issued", invitationId: "invitation-1" });
    const { result } = renderHook(() =>
      useManagerInvitationController({
        canInviteManager: false,
        canOpenManagerInvitation: true,
        managerInvitationMode: "addition",
        freeManagerExchangeCandidates: [],
        people: [],
      }),
    );

    act(() => result.current.open());
    expect(result.current.dialog).toMatchObject({ isOpen: true, isResendOnly: true });

    act(() => {
      result.current.dialog.onSubmit({ kind: "external", name: "佐藤 花子", email: "sato@example.com" });
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

  it("グループ設定のスタッフを選んで管理者のログイン案内を送る", async () => {
    mocks.mutation.mockResolvedValue({ status: "issued", invitationId: "invitation-1" });
    const target = { ...person, managerRole: "none" as const };
    const { result } = renderHook(() =>
      useManagerInvitationController({
        canInviteManager: true,
        canOpenManagerInvitation: true,
        managerInvitationMode: "addition",
        freeManagerExchangeCandidates: [],
        people: [target],
      }),
    );

    act(() => result.current.open());
    expect(result.current.dialog.staffCandidates).toEqual([
      {
        id: target.id,
        name: target.name,
        email: target.email,
        shopNames: target.shopNames,
        isResend: false,
      },
    ]);

    act(() => {
      result.current.dialog.onSubmit({ kind: "person", personId: target.id });
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        personId: target.id,
        requestId: "request-1",
      }),
    );
    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
  });

  it("Freeでは手入力による管理者招待を実行しない", async () => {
    const target = { ...person, id: "person-free", managerRole: "none" as const };
    const { result } = renderHook(() =>
      useManagerInvitationController({
        canInviteManager: true,
        canOpenManagerInvitation: true,
        managerInvitationMode: "freeManagerExchange",
        freeManagerExchangeCandidates: [{ id: target.id, name: target.name, email: target.email ?? "" }],
        people: [target],
      }),
    );

    act(() => result.current.open());
    act(() => {
      result.current.dialog.onSubmit({ kind: "external", name: "佐藤 花子", email: "sato@example.com" });
    });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
