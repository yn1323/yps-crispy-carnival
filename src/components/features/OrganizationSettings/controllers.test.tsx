// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationBillingView, OrganizationPersonView, OrganizationShopView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
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

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
}));

import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { usePersonRemovalController } from "./PersonRemoval/usePersonRemovalController";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";

const person: OrganizationPersonView = {
  id: "person-1",
  name: "田中 太郎",
  email: "tanaka@example.com",
  managerRole: "active",
  isStaff: true,
  shopNames: ["渋谷店"],
  currentShopStaffId: "staff-1",
  canRemoveFromCurrentShop: true,
  canRemoveManagerRole: true,
  countsTowardPeopleLimit: true,
  canRemove: true,
};

const shop: OrganizationShopView = {
  id: "shop-1",
  name: "渋谷店",
  status: "active",
  isFreeRetainedShop: false,
  canArchive: true,
  canReactivate: false,
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
  canScheduleFree: true,
};

beforeEach(() => {
  mocks.mutation.mockReset();
});

describe("OrganizationSettings controllers", () => {
  it("事業者名の変更中にcapabilityを失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ canUpdate }) =>
        useOrganizationNameController({ organizationName: "さくらダイニング", canUpdateOrganizationName: canUpdate }),
      { initialProps: { canUpdate: true } },
    );
    act(() => result.current.open());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canUpdate: false });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleSubmit("変更後の事業者名"));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("管理者招待のcapabilityとitem操作可否を失うとDialogを閉じ、再送しない", async () => {
    const enabled = {
      canInviteManager: true,
      managerInvitationMode: "addition" as const,
      freeManagerExchangeCandidates: [],
      invitations: [
        {
          id: "invitation-1",
          email: "manager@example.com",
          status: "pending" as const,
          canResend: true,
          canRevoke: true,
        },
      ],
    };
    const { result, rerender } = renderHook((input) => useManagerInvitationController(input), {
      initialProps: enabled,
    });
    act(() => result.current.open());
    const staleResend = result.current.resend;

    rerender({
      ...enabled,
      canInviteManager: false,
      invitations: [{ ...enabled.invitations[0], canResend: false, canRevoke: false }],
    });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleResend("invitation-1"));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("管理者招待の利用人数上限エラーを解決導線へ変換し、自動で再送しない", async () => {
    mocks.mutation.mockRejectedValueOnce(new Error("利用人数が現在のプラン上限を超えます（現在 15名 / 上限 15名）"));
    const { result } = renderHook(() =>
      useManagerInvitationController({
        canInviteManager: true,
        managerInvitationMode: "addition",
        freeManagerExchangeCandidates: [],
        invitations: [],
      }),
    );

    act(() => result.current.open());
    act(() => result.current.dialog.onSubmit("new-manager@example.com"));

    await waitFor(() =>
      expect(result.current.dialog.peopleCapacityResolution).toEqual({
        kind: "upgradeToBusiness",
        current: 15,
        max: 15,
      }),
    );
    expect(mocks.mutation).toHaveBeenCalledOnce();
    expect(result.current.dialog.isOpen).toBe(true);
  });

  it("人物が対象外または消失したら確認Dialogを閉じ、古い確定操作を拒否する", async () => {
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

  it("店舗操作のcapabilityを失うと確認Dialogを閉じ、古い確定操作を拒否する", async () => {
    const { result, rerender } = renderHook((input) => useShopManagementController(input), {
      initialProps: { canAddShop: true, shops: [shop] },
    });
    act(() => result.current.archiveShop(shop.id));
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canAddShop: true, shops: [{ ...shop, canArchive: false }] });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    act(() => staleSubmit({ kind: "archiveShop", shopId: shop.id }));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });

  it("課金設定のcapabilityを失うとDialogを閉じ、請求先変更とFree設定を拒否する", async () => {
    const input = {
      billing,
      freeSelection: {
        selectedManagerId: "person-1",
        selectedManagerName: "田中 太郎",
        selectedShopId: "shop-1",
        selectedShopName: "渋谷店",
        managerCandidates: [{ id: "person-1", name: "田中 太郎", projectedPeopleCount: 4 }],
        shopCandidates: [{ id: "shop-1", name: "渋谷店" }],
        projectedPeopleCount: 4,
        readOnlyManagerNames: [],
        suspendedShopNames: [],
        isComplete: true,
      },
    };
    const { result, rerender } = renderHook((props) => useBillingSettingsController(props), {
      initialProps: input,
    });
    act(() => result.current.updateBillingEmail());
    const staleEmailSubmit = result.current.dialog.onSubmit;
    const staleFreeSubmit = result.current.saveFreeSelection;

    rerender({
      ...input,
      billing: { ...billing, canUpdateBillingEmail: false, canScheduleFree: false },
    });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleEmailSubmit("new@example.com"));
    await act(async () => staleFreeSubmit("person-1", "shop-1"));
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
  });
});
