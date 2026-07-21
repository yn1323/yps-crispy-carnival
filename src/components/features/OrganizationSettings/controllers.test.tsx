// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationBillingView, OrganizationPersonView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  actions: {
    getProPrice: vi.fn(),
    startProCheckout: vi.fn(),
    openCustomerPortal: vi.fn(),
    scheduleFreeAtPeriodEnd: vi.fn(),
    cancelScheduledFree: vi.fn(),
    cancelTrialContinuation: vi.fn(),
  },
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  toasterCreate: vi.fn(),
  openBillingUrl: vi.fn(),
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
  const { getFunctionName } = await vi.importActual<typeof import("convex/server")>("convex/server");
  return {
    useMutation: () => mocks.mutation,
    useAction: (reference: never) => {
      const name = getFunctionName(reference);
      if (name === "organizationStripe/actions:getProPrice") return mocks.actions.getProPrice;
      if (name === "organizationStripe/actions:startProCheckout") return mocks.actions.startProCheckout;
      if (name === "organizationStripe/actions:openCustomerPortal") return mocks.actions.openCustomerPortal;
      if (name === "organizationStripe/actions:scheduleFreeAtPeriodEnd") {
        return mocks.actions.scheduleFreeAtPeriodEnd;
      }
      if (name === "organizationStripe/actions:cancelScheduledFree") return mocks.actions.cancelScheduledFree;
      if (name === "organizationStripe/actions:cancelTrialContinuation") {
        return mocks.actions.cancelTrialContinuation;
      }
      throw new Error(`unexpected action: ${name}`);
    },
  };
});

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: mocks.toasterCreate },
}));

vi.mock("./BillingSettings/openBillingUrl", () => ({
  openBillingUrl: mocks.openBillingUrl,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => mocks.selectedShop,
  useSetAtom: () => mocks.setAtom,
}));

import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useStripeBillingController } from "./BillingSettings/useStripeBillingController";
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
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 30 },
  shopUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

beforeEach(() => {
  mocks.selectedShop.shopId = "shop-current";
  mocks.mutation.mockReset();
  for (const action of Object.values(mocks.actions)) action.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.toasterCreate.mockReset();
  mocks.openBillingUrl.mockReset();
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

  it("Freeは確認をすぐ開いて価格を読み込み、同じrequestIdでCheckoutを一度だけ開始する", async () => {
    let resolvePrice:
      | ((value: {
          status: "available";
          currency: string;
          unitAmount: number;
          interval: "month";
          intervalCount: number;
        }) => void)
      | undefined;
    mocks.actions.getProPrice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrice = resolve;
        }),
    );
    let resolveCheckout: ((value: { status: "redirect"; url: string }) => void) | undefined;
    mocks.actions.startProCheckout.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheckout = resolve;
        }),
    );
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({
      intentKey: "request-1",
      organizationName: "さくらダイニング",
      source: "immediate",
      billingStartsOn: "Stripeでの支払い完了後",
      shopNames: ["渋谷店", "新宿店"],
      price: { status: "loading" },
    });
    expect(mocks.actions.getProPrice).toHaveBeenCalledExactlyOnceWith({ shopId: "shop-current" });

    await act(async () =>
      resolvePrice?.({
        status: "available",
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
      }),
    );
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        price: {
          status: "available",
          value: {
            currency: "jpy",
            unitAmount: 3000,
            interval: "month",
            intervalCount: 1,
          },
        },
      }),
    );

    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });
    await waitFor(() =>
      expect(mocks.actions.startProCheckout).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );

    await act(async () => resolveCheckout?.({ status: "redirect", url: "https://checkout.stripe.example/session" }));
    await waitFor(() =>
      expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/session"),
    );
  });

  it("トライアルのPro継続登録では終了境界日を請求開始として確認する", async () => {
    mocks.actions.getProPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
    });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: false,
      trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: trialBilling,
      }),
    );

    act(() => result.current.managePlan());

    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "startPro",
        source: "trial",
        billingStartsOn: "2026年9月1日",
        shopNames: ["渋谷店", "新宿店"],
      }),
    );
  });

  it("Checkoutが利用不可なら外部遷移せず、安全な案内を表示する", async () => {
    mocks.actions.getProPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
    });
    mocks.actions.startProCheckout.mockResolvedValue({ status: "unavailable", reason: "configuration_pending" });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "startPro",
        price: { status: "available" },
      }),
    );
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith({
        title: "決済機能は準備中です",
        description: "料金または決済設定の確認が完了してから、もう一度お試しください。",
        type: "info",
        duration: 8000,
      }),
    );
    expect(mocks.openBillingUrl).not.toHaveBeenCalled();
    expect(result.current.dialog.dialog?.intentKey).toBe("request-1");
  });

  it("価格を取得できない場合はDialog内で案内し、再読み込みできる", async () => {
    mocks.actions.getProPrice
      .mockResolvedValueOnce({ status: "unavailable", reason: "price_unavailable" })
      .mockResolvedValueOnce({
        status: "available",
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
      });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());

    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "startPro",
        price: { status: "unavailable", reason: "price_unavailable" },
      }),
    );
    expect(mocks.toasterCreate).not.toHaveBeenCalled();
    expect(mocks.actions.startProCheckout).not.toHaveBeenCalled();

    act(() => result.current.dialog.onRetryPrice());
    expect(result.current.dialog.dialog).toMatchObject({ price: { status: "loading" } });
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        price: { status: "available", value: { currency: "jpy", unitAmount: 3000 } },
      }),
    );
    expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(2);
  });

  it("価格の読み込み中にDialogを閉じても、再クリックですぐ同じ確認を開く", async () => {
    let resolvePrice:
      | ((value: {
          status: "available";
          currency: string;
          unitAmount: number;
          interval: "month";
          intervalCount: number;
        }) => void)
      | undefined;
    mocks.actions.getProPrice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrice = resolve;
        }),
    );
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPro", price: { status: "loading" } });
    act(() => result.current.dialog.onClose());
    expect(result.current.dialog.dialog).toBeNull();
    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPro", price: { status: "loading" } });
    expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolvePrice?.({
        status: "available",
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
      }),
    );
    await waitFor(() => expect(result.current.dialog.dialog).toMatchObject({ price: { status: "available" } }));
  });

  it("TrialのPro継続登録済み状態では価格やCheckoutを呼ばず、取消を確認して一度だけ受け付ける", async () => {
    mocks.actions.cancelTrialContinuation.mockResolvedValue({ status: "accepted" });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: true,
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: trialBilling,
      }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "cancelTrialContinuation",
      intentKey: "request-1",
      trialEndsOn: "2026年8月31日",
    });
    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });

    await waitFor(() =>
      expect(mocks.actions.cancelTrialContinuation).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );
    expect(mocks.actions.getProPrice).not.toHaveBeenCalled();
    expect(mocks.actions.startProCheckout).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "Pro継続の取り消しを受け付けました",
      }),
    );
  });

  it("active ProのFree予約と予約済み状態の取消を対応するActionへ接続する", async () => {
    mocks.actions.scheduleFreeAtPeriodEnd.mockResolvedValue({ status: "accepted" });
    mocks.actions.cancelScheduledFree.mockResolvedValue({ status: "accepted" });
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationName: "さくらダイニング", shopNames: ["渋谷店", "新宿店"], billing },
    });

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog?.kind).toBe("scheduleFree");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.scheduleFreeAtPeriodEnd).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );

    rerender({
      organizationName: "さくらダイニング",
      shopNames: ["渋谷店", "新宿店"],
      billing: {
        ...billing,
        state: "scheduledFree",
        targetPlan: "free",
        nextEvent: { label: "無料適用予定日", date: "2026年8月31日" },
        canScheduleFree: false,
      },
    });
    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog?.kind).toBe("cancelScheduledFree");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.cancelScheduledFree).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );
  });

  it("確認中に選択グループが変わったらDialogを閉じ、古い確定操作を受け付けない", async () => {
    const input = { organizationName: "さくらダイニング", shopNames: ["渋谷店", "新宿店"], billing };
    const { result, rerender } = renderHook((props) => useStripeBillingController(props), {
      initialProps: input,
    });
    act(() => result.current.managePlan());
    const staleSubmit = result.current.dialog.onSubmit;

    mocks.selectedShop.shopId = "shop-other";
    rerender({ ...input });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    act(() => staleSubmit());
    expect(mocks.actions.scheduleFreeAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("支払い方法と請求書・領収書はIDを渡さず、Portalのredirect結果だけで外部遷移する", async () => {
    mocks.actions.openCustomerPortal.mockResolvedValue({
      status: "redirect",
      url: "https://billing.stripe.example/session",
    });
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing,
      }),
    );

    act(() => {
      result.current.updatePaymentMethod();
      result.current.updatePaymentMethod();
    });
    await waitFor(() => expect(mocks.actions.openCustomerPortal).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://billing.stripe.example/session"),
    );

    mocks.actions.openCustomerPortal.mockResolvedValue({ status: "unavailable", reason: "in_progress" });
    act(() => result.current.openBillingDocuments());
    await waitFor(() => expect(mocks.actions.openCustomerPortal).toHaveBeenCalledTimes(2));
    expect(mocks.actions.openCustomerPortal).toHaveBeenNthCalledWith(2, {
      shopId: "shop-current",
      requestId: "request-1",
    });
    expect(mocks.openBillingUrl).toHaveBeenCalledTimes(1);
  });

  it("Stripe Customer未作成ではPortalを開かない", async () => {
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationName: "さくらダイニング",
        shopNames: ["渋谷店", "新宿店"],
        billing: {
          ...billing,
          hasStripeCustomer: false,
          canUpdatePaymentMethod: false,
          paymentMethodDisabledReason: "Stripeの契約情報を準備中です。しばらくしてからもう一度お試しください。",
        },
      }),
    );

    act(() => {
      result.current.updatePaymentMethod();
      result.current.openBillingDocuments();
    });

    await waitFor(() => expect(mocks.actions.openCustomerPortal).not.toHaveBeenCalled());
  });

  it("支払い不要Proでは古い確定操作を含む全Stripe Actionを呼ばない", async () => {
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationName: "さくらダイニング", shopNames: ["渋谷店", "新宿店"], billing },
    });
    act(() => result.current.managePlan());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({
      organizationName: "さくらダイニング",
      shopNames: ["渋谷店", "新宿店"],
      billing: {
        ...billing,
        isComplimentary: true,
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      },
    });
    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    act(() => {
      staleSubmit();
      result.current.managePlan();
      result.current.updatePaymentMethod();
      result.current.openBillingDocuments();
    });

    await waitFor(() => {
      for (const action of Object.values(mocks.actions)) expect(action).not.toHaveBeenCalled();
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
