// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrganizationBillingView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  actions: {
    getProPrice: vi.fn(),
    startProCheckout: vi.fn(),
    previewPaidPlanChange: vi.fn(),
    changePaidPlanNow: vi.fn(),
    schedulePaidPlanChange: vi.fn(),
    scheduleServiceStopAtPeriodEnd: vi.fn(),
    cancelScheduledFree: vi.fn(),
    openCustomerPortal: vi.fn(),
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
      const name = getFunctionName(reference).replace("ForOrganization", "");
      if (name === "organizationStripe/actions:getPlanPrice") return mocks.actions.getProPrice;
      if (name === "organizationStripe/actions:startPaidCheckout") return mocks.actions.startProCheckout;
      if (name === "organizationStripe/actions:previewPaidPlanChange") return mocks.actions.previewPaidPlanChange;
      if (name === "organizationStripe/actions:changePaidPlanNow") return mocks.actions.changePaidPlanNow;
      if (name === "organizationStripe/actions:schedulePaidPlanChange") return mocks.actions.schedulePaidPlanChange;
      if (name === "organizationStripe/actions:scheduleServiceStopAtPeriodEnd") {
        return mocks.actions.scheduleServiceStopAtPeriodEnd;
      }
      if (name === "organizationStripe/actions:cancelScheduledPlanChange") {
        return mocks.actions.cancelScheduledFree;
      }
      if (name === "organizationStripe/actions:openCustomerPortal") return mocks.actions.openCustomerPortal;
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
import { useOrganizationCreationController } from "./OrganizationCreation/useOrganizationCreationController";
import { useOrganizationDeletionController } from "./OrganizationDeletion/useOrganizationDeletionController";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 20 },
  shopUsage: { current: 1, max: 5 },
  managerUsage: { current: 1, max: 5 },
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
  it("app組織名変更はselectedShopではなく明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() =>
      useOrganizationNameController({
        organizationId: "organization-app" as never,
        organizationName: "さくらダイニング",
        canUpdateOrganizationName: true,
      }),
    );

    act(() => result.current.open());
    act(() => result.current.dialog.onSubmit("新しい組織名"));

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        name: "新しい組織名",
        requestId: "request-1",
      }),
    );
  });

  it("app店舗追加はselectedShopではなく明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() =>
      useShopManagementController({ organizationId: "organization-app" as never, canAddShop: true }),
    );
    const data = {
      shopName: "新宿店",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.addShop());
    await act(async () => {
      await result.current.dialog.onSubmit({ kind: "addShop", data });
    });

    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      organizationId: "organization-app",
      ...data,
      requestId: "request-1",
    });
  });

  it("app請求先変更はselectedShopではなく明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() =>
      useBillingSettingsController({ organizationId: "organization-app" as never, billing }),
    );

    act(() => result.current.updateBillingEmail());
    act(() => result.current.dialog.onSubmit("new-billing@example.com"));

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        email: "new-billing@example.com",
        requestId: "request-1",
      }),
    );
  });

  it("app課金controllerは料金取得にselectedShopではなく明示organizationIdを使う", async () => {
    mocks.actions.getProPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });

    renderHook(() =>
      useStripeBillingController({
        organizationId: "organization-app" as never,
        organizationName: "さくらダイニング",
        billing,
      }),
    );

    await waitFor(() => expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(2));
    expect(mocks.actions.getProPrice.mock.calls).toEqual([
      [{ organizationId: "organization-app", targetPlan: "pro" }],
      [{ organizationId: "organization-app", targetPlan: "business" }],
    ]);
  });

  it("組織名の変更中に権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ canUpdate }) =>
        useOrganizationNameController({ organizationName: "さくらダイニング", canUpdateOrganizationName: canUpdate }),
      { initialProps: { canUpdate: true } },
    );
    act(() => result.current.open());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canUpdate: false });

    await waitFor(() => expect(result.current.dialog.isOpen).toBe(false));
    act(() => staleSubmit("変更後の組織名"));
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

  it("組織作成は連絡先の引継元店舗を送り、一度だけ実行して作成した店舗へ遷移する", async () => {
    let resolveMutation: ((shopId: string) => void) | undefined;
    mocks.mutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = (shopId: string) => resolve({ shopId, created: true });
        }),
    );
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { canCreateOrganization: true, onCreated },
    });
    const data = {
      shopName: "二つ目の店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.createOrganization());
    act(() => {
      result.current.dialog.onSubmit(data);
      result.current.dialog.onSubmit(data);
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        ...data,
        sourceShopId: "shop-current",
        requestId: "request-1",
      }),
    );
    await act(async () => resolveMutation?.("shop-created"));
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "新しい組織を作りました",
      }),
    );
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created");
    expect(result.current.dialog.dialog).toBeNull();
  });

  it("app組織作成はselectedShopを送らず、作成したorganizationIdを完了先へ渡す", async () => {
    mocks.mutation.mockResolvedValue({
      organizationId: "organization-created",
      shopId: "shop-created",
      created: true,
    });
    const onCreated = vi.fn();
    const { result } = renderHook(() =>
      useOrganizationCreationController({
        canCreateOrganization: true,
        appMode: true,
        organizationId: "organization-current" as Id<"organizations">,
        sourceShopId: null,
        onCreated,
      }),
    );
    const data = {
      shopName: "二つ目の店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      ...data,
      organizationId: "organization-current",
      requestId: "request-1",
    });
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created", "organization-created");
  });

  it("組織作成は応答喪失後の手動再送で同じrequestIdを使い、作成済み応答を成功とする", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2"),
    });
    const error = new Error("network unavailable");
    mocks.mutation
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ shopId: "shop-created", created: false })
      .mockResolvedValueOnce({ shopId: "shop-created-next", created: true });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { canCreateOrganization: true, onCreated },
    });
    const data = {
      shopName: "二つ目の店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0]?.[0]).toMatchObject({ requestId: "request-1" });
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.dialog.dialog).toEqual({ kind: "createOrganization", requestId: "request-1" });

    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation.mock.calls.map(([args]) => args.requestId)).toEqual(["request-1", "request-1"]);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "新しい組織を作りました",
    });
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created");
    expect(result.current.dialog.dialog).toBeNull();

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation.mock.calls.map(([args]) => args.requestId)).toEqual(["request-1", "request-1", "request-2"]);
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenLastCalledWith("shop-created-next");
  });

  it("組織作成は失敗したDialogを閉じて開き直すと新しいrequestIdを使う", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2"),
    });
    mocks.mutation
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ shopId: "shop-created", created: true });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { canCreateOrganization: true, onCreated },
    });
    const data = {
      shopName: "二つ目の店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });
    act(() => result.current.dialog.onClose());
    expect(result.current.dialog.dialog).toBeNull();

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation.mock.calls.map(([args]) => args.requestId)).toEqual(["request-1", "request-2"]);
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created");
  });

  it("閉じたDialogの古いsubmitは、新しく開いた作成intentへ流用しない", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2"),
    });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { canCreateOrganization: true, onCreated },
    });
    const data = {
      shopName: "二つ目の店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" as const },
    };

    act(() => result.current.createOrganization());
    const staleSubmit = result.current.dialog.onSubmit;
    act(() => result.current.dialog.onClose());
    act(() => result.current.createOrganization());

    await act(async () => {
      await staleSubmit(data);
    });

    expect(result.current.dialog.dialog).toEqual({ kind: "createOrganization", requestId: "request-2" });
    expect(mocks.mutation).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      ...data,
      sourceShopId: "shop-current",
      requestId: "request-2",
    });
  });

  it("組織作成の権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const onCreated = vi.fn();
    const { result, rerender } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { canCreateOrganization: true, onCreated },
    });
    act(() => result.current.createOrganization());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ canCreateOrganization: false, onCreated });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    await act(async () => {
      await staleSubmit({
        shopName: "二つ目の店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
      });
    });
    await waitFor(() => expect(mocks.mutation).not.toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("組織削除は名前を送信せず固定した対象情報で一度だけ実行する", async () => {
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

  it("組織削除成功後はDialogの履歴guardを除去してから次の画面へ遷移する", async () => {
    mocks.mutation.mockResolvedValue(undefined);
    const replaceLocation = vi.fn();
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
    const { result } = renderHook(() => useOrganizationDeletionController(input, { replaceLocation }));

    act(() => result.current.open());
    await act(async () => result.current.dialog.onSubmit());

    expect(replaceLocation).not.toHaveBeenCalled();
    act(() => result.current.dialog.onBackGuardRemoved());
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/dashboard");
    act(() => result.current.dialog.onBackGuardRemoved());
    expect(replaceLocation).toHaveBeenCalledTimes(1);
  });

  it("組織削除の可否や対象が変わると古い確定操作を拒否する", async () => {
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
          taxBehavior: "inclusive";
        }) => void)
      | undefined;
    mocks.actions.getProPrice.mockImplementation(({ targetPlan }: { targetPlan: "pro" | "business" }) =>
      targetPlan === "pro"
        ? new Promise((resolve) => {
            resolvePrice = resolve;
          })
        : Promise.resolve({
            status: "available",
            currency: "jpy",
            unitAmount: 6000,
            interval: "month",
            intervalCount: 1,
            taxBehavior: "inclusive",
          }),
    );
    let resolveCheckout: ((value: { status: "available"; url: string }) => void) | undefined;
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
      kind: "startPaidPlan",
      targetPlan: "pro",
      intentKey: "request-1",
      organizationName: "さくらダイニング",
      source: "immediate",
      billingStartsOn: "Stripeでの支払い完了日",
      price: { status: "loading" },
    });
    expect(mocks.actions.getProPrice).toHaveBeenCalledWith({ shopId: "shop-current", targetPlan: "pro" });
    expect(mocks.actions.getProPrice).toHaveBeenCalledWith({ shopId: "shop-current", targetPlan: "business" });

    await act(async () =>
      resolvePrice?.({
        status: "available",
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
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
        targetPlan: "pro",
      }),
    );

    await act(async () => resolveCheckout?.({ status: "available", url: "https://checkout.stripe.example/session" }));
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
      taxBehavior: "inclusive",
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
        kind: "startPaidPlan",
        targetPlan: "pro",
        source: "trial",
        billingStartsOn: "2026年9月1日",
      }),
    );
  });

  it("FreeからBusinessはBusiness Priceを確認して対象plan付きCheckoutを開始する", async () => {
    mocks.actions.getProPrice.mockImplementation(({ targetPlan }: { targetPlan: "pro" | "business" }) =>
      Promise.resolve({
        status: "available",
        currency: "jpy",
        unitAmount: targetPlan === "business" ? 8000 : 3000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      }),
    );
    mocks.actions.startProCheckout.mockResolvedValue({
      status: "available",
      url: "https://checkout.stripe.example/business",
    });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationName: "さくらダイニング", billing: freeBilling }),
    );

    await waitFor(() => expect(result.current.planPrices.business.status).toBe("available"));
    act(() => result.current.managePlan("business"));
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "startPaidPlan",
      targetPlan: "business",
      price: { status: "available", value: { unitAmount: 8000 } },
    });
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.actions.startProCheckout).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        targetPlan: "business",
        requestId: "request-1",
      }),
    );
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/business");
  });

  it("Checkoutが利用不可なら外部遷移せず、安全な案内を表示する", async () => {
    mocks.actions.getProPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
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
        kind: "startPaidPlan",
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
    let proPriceRequestCount = 0;
    mocks.actions.getProPrice.mockImplementation(({ targetPlan }: { targetPlan: "pro" | "business" }) => {
      if (targetPlan === "business") {
        return Promise.resolve({
          status: "available",
          currency: "jpy",
          unitAmount: 6000,
          interval: "month",
          intervalCount: 1,
          taxBehavior: "inclusive",
        });
      }
      proPriceRequestCount += 1;
      return Promise.resolve(
        proPriceRequestCount === 1
          ? { status: "unavailable", reason: "price_unavailable" }
          : {
              status: "available",
              currency: "jpy",
              unitAmount: 3000,
              interval: "month",
              intervalCount: 1,
              taxBehavior: "inclusive",
            },
      );
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
        kind: "startPaidPlan",
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
    expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(3);
  });

  it("価格の読み込み中にDialogを閉じても、再クリックですぐ同じ確認を開く", async () => {
    let resolvePrice:
      | ((value: {
          status: "available";
          currency: string;
          unitAmount: number;
          interval: "month";
          intervalCount: number;
          taxBehavior: "inclusive";
        }) => void)
      | undefined;
    mocks.actions.getProPrice.mockImplementation(({ targetPlan }: { targetPlan: "pro" | "business" }) =>
      targetPlan === "pro"
        ? new Promise((resolve) => {
            resolvePrice = resolve;
          })
        : Promise.resolve({
            status: "available",
            currency: "jpy",
            unitAmount: 6000,
            interval: "month",
            intervalCount: 1,
            taxBehavior: "inclusive",
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
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", price: { status: "loading" } });
    act(() => result.current.dialog.onClose());
    expect(result.current.dialog.dialog).toBeNull();
    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", price: { status: "loading" } });
    expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(2);

    await act(async () =>
      resolvePrice?.({
        status: "available",
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      }),
    );
    await waitFor(() => expect(result.current.dialog.dialog).toMatchObject({ price: { status: "available" } }));
  });

  it("TrialのPro継続登録済み状態ではCheckoutを増やさず、取消を確認して一度だけ受け付ける", async () => {
    mocks.actions.cancelTrialContinuation.mockResolvedValue({ status: "accepted" });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: true,
      targetPlan: "pro",
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

    act(() => result.current.managePlan("free"));
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
    expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(2);
    expect(mocks.actions.startProCheckout).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "Pro継続の取り消しを受け付けました",
      }),
    );
  });

  it("active Proの利用停止予約と予約済み状態の取消を対応するActionへ接続する", async () => {
    mocks.actions.scheduleServiceStopAtPeriodEnd.mockResolvedValue({ status: "accepted" });
    mocks.actions.cancelScheduledFree.mockResolvedValue({ status: "accepted" });
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationName: "さくらダイニング", shopNames: ["渋谷店", "新宿店"], billing },
    });

    act(() => result.current.managePlan("free"));
    expect(result.current.dialog.dialog?.kind).toBe("scheduleServiceStop");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.scheduleServiceStopAtPeriodEnd).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );

    rerender({
      organizationName: "さくらダイニング",
      shopNames: ["渋谷店", "新宿店"],
      billing: {
        ...billing,
        state: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        restrictAtPeriodEnd: true,
        nextEvent: { label: "利用停止予定日", date: "2026年8月31日" },
        canScheduleFree: false,
      },
    });
    act(() => result.current.managePlan("pro"));
    expect(result.current.dialog.dialog?.kind).toBe("cancelScheduledPlanChange");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.cancelScheduledFree).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );
  });

  it("旧scheduledFree DTOでも引数なしの操作から予約取消を開く", async () => {
    mocks.actions.cancelScheduledFree.mockResolvedValue({ status: "accepted" });
    const legacyScheduledFreeBilling: OrganizationBillingView = {
      ...billing,
      state: "scheduledFree",
      currentPlan: "pro",
      targetPlan: "free",
      nextEvent: { label: "無料適用予定日", date: "2026年8月31日" },
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationName: "さくらダイニング", billing: legacyScheduledFreeBilling }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "cancelScheduledPlanChange",
      targetPlan: "free",
      effectiveOn: "2026年8月31日",
    });
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.actions.cancelScheduledFree).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        requestId: "request-1",
      }),
    );
  });

  it("ProからBusinessは同じproration dateの見積もり確認後に一度だけ即時変更する", async () => {
    mocks.actions.previewPaidPlanChange.mockResolvedValue({
      status: "available",
      currency: "jpy",
      amountDue: 4200,
      currentPeriodEnd: Date.parse("2026-09-01T00:00:00+09:00"),
      prorationDate: 1_780_000_000,
    });
    mocks.actions.changePaidPlanNow.mockResolvedValue({ status: "accepted" });
    const { result } = renderHook(() => useStripeBillingController({ organizationName: "さくらダイニング", billing }));

    act(() => result.current.managePlan("business"));
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "changePaidPlanNow",
        targetPlan: "business",
        preview: {
          status: "available",
          value: { amountDue: 4200, prorationDate: 1_780_000_000 },
        },
      }),
    );
    expect(mocks.actions.previewPaidPlanChange).toHaveBeenCalledExactlyOnceWith({
      shopId: "shop-current",
      targetPlan: "business",
      requestId: "request-1",
    });

    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });
    await waitFor(() =>
      expect(mocks.actions.changePaidPlanNow).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        targetPlan: "business",
        prorationDate: 1_780_000_000,
        requestId: "request-1",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "Businessへの変更を受け付けました",
    });
  });

  it("日割り見積もり中のDialogを閉じて開き直しても、新しい確認が読み込み中のまま残らない", async () => {
    let requestSequence = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
    );
    mocks.actions.getProPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    const previewResolvers = new Map<
      string,
      (result: {
        status: "available";
        currency: string;
        amountDue: number;
        currentPeriodEnd: number;
        prorationDate: number;
      }) => void
    >();
    mocks.actions.previewPaidPlanChange.mockImplementation(
      ({ requestId }: { requestId: string }) =>
        new Promise((resolve) => {
          previewResolvers.set(requestId, resolve);
        }),
    );
    const { result } = renderHook(() => useStripeBillingController({ organizationName: "さくらダイニング", billing }));
    await waitFor(() => expect(result.current.planPrices.pro.status).toBe("available"));

    act(() => result.current.managePlan("business"));
    const firstIntent = result.current.dialog.dialog?.intentKey;
    act(() => result.current.dialog.onClose());
    act(() => result.current.managePlan("business"));
    const secondIntent = result.current.dialog.dialog?.intentKey;

    expect(firstIntent).toBeTruthy();
    expect(secondIntent).toBeTruthy();
    expect(secondIntent).not.toBe(firstIntent);
    await waitFor(() => expect(mocks.actions.previewPaidPlanChange).toHaveBeenCalledTimes(2));
    await act(async () =>
      previewResolvers.get(secondIntent ?? "")?.({
        status: "available",
        currency: "jpy",
        amountDue: 4200,
        currentPeriodEnd: Date.parse("2026-09-01T00:00:00+09:00"),
        prorationDate: 1_780_000_000,
      }),
    );
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        intentKey: secondIntent,
        preview: { status: "available" },
      }),
    );
  });

  it("BusinessからProは期間末変更と必要削減人数を確認して予約する", async () => {
    mocks.actions.schedulePaidPlanChange.mockResolvedValue({ status: "accepted" });
    const businessBilling: OrganizationBillingView = {
      ...billing,
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 23, max: 40 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
      nextEvent: { label: "次回更新日", date: "2026年8月31日" },
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationName: "さくらダイニング", billing: businessBilling }),
    );

    act(() => result.current.managePlan("pro"));
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "schedulePlanChange",
      targetPlan: "pro",
      effectiveOn: "2026年8月31日",
      requiredReductions: { people: 3, shops: 0, managers: 0 },
    });
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.actions.schedulePaidPlanChange).toHaveBeenCalledExactlyOnceWith({
        shopId: "shop-current",
        targetPlan: "pro",
        requestId: "request-1",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "Proへの変更予約を受け付けました",
    });
  });

  it("確認中に選択組織が変わったらDialogを閉じ、古い確定操作を受け付けない", async () => {
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
    expect(mocks.actions.schedulePaidPlanChange).not.toHaveBeenCalled();
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
          paymentMethodDisabledReason: "Stripeの契約情報を準備中です。\nしばらくしてから、もう一度お試しください。",
        },
      }),
    );

    act(() => {
      result.current.updatePaymentMethod();
      result.current.openBillingDocuments();
    });

    await waitFor(() => expect(mocks.actions.openCustomerPortal).not.toHaveBeenCalled());
  });

  it("支払い不要Businessでは古い確定操作を含む全Stripe Actionを呼ばない", async () => {
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationName: "さくらダイニング", shopNames: ["渋谷店", "新宿店"], billing },
    });
    await waitFor(() => expect(mocks.actions.getProPrice).toHaveBeenCalledTimes(2));
    act(() => result.current.managePlan());
    const staleSubmit = result.current.dialog.onSubmit;
    for (const action of Object.values(mocks.actions)) action.mockClear();

    rerender({
      organizationName: "さくらダイニング",
      shopNames: ["渋谷店", "新宿店"],
      billing: {
        ...billing,
        state: "business",
        currentPlan: "business",
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
});
