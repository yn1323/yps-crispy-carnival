// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrganizationBillingView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  actions: {
    getPlanPrice: vi.fn(),
    startPaidCheckout: vi.fn(),
    inspectPendingCheckout: vi.fn(),
    cancelPendingCheckout: vi.fn(),
    previewPaidPlanChange: vi.fn(),
    changePaidPlanNow: vi.fn(),
    schedulePaidPlanChange: vi.fn(),
    scheduleServiceStopAtPeriodEnd: vi.fn(),
    cancelScheduledPlanChange: vi.fn(),
    openCustomerPortal: vi.fn(),
    cancelTrialContinuation: vi.fn(),
  },
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  toasterCreate: vi.fn(),
  openBillingUrl: vi.fn(),
  setAtom: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await vi.importActual<typeof import("convex/server")>("convex/server");
  return {
    useMutation: () => mocks.mutation,
    useAction: (reference: never) => {
      const name = getFunctionName(reference).replace("ForOrganization", "");
      if (name === "organizationStripe/actions:getPlanPrice") return mocks.actions.getPlanPrice;
      if (name === "organizationStripe/actions:startPaidCheckout") return mocks.actions.startPaidCheckout;
      if (name === "organizationStripe/actions:inspectPendingCheckout") return mocks.actions.inspectPendingCheckout;
      if (name === "organizationStripe/actions:cancelPendingCheckout") return mocks.actions.cancelPendingCheckout;
      if (name === "organizationStripe/actions:previewPaidPlanChange") return mocks.actions.previewPaidPlanChange;
      if (name === "organizationStripe/actions:changePaidPlanNow") return mocks.actions.changePaidPlanNow;
      if (name === "organizationStripe/actions:schedulePaidPlanChange") return mocks.actions.schedulePaidPlanChange;
      if (name === "organizationStripe/actions:scheduleServiceStopAtPeriodEnd") {
        return mocks.actions.scheduleServiceStopAtPeriodEnd;
      }
      if (name === "organizationStripe/actions:cancelScheduledPlanChange") {
        return mocks.actions.cancelScheduledPlanChange;
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
  useSetAtom: () => mocks.setAtom,
}));

import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useStripeBillingController } from "./BillingSettings/useStripeBillingController";
import { useOrganizationCreationController } from "./OrganizationCreation/useOrganizationCreationController";
import { useOrganizationDeletionController } from "./OrganizationDeletion/useOrganizationDeletionController";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";

const billing: OrganizationBillingView = {
  state: "standard",
  currentPlan: "standard",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 25 },
  shopUsage: { current: 1, max: 5 },
  managerUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

const organizationId = "organization-app" as Id<"organizations">;

beforeEach(() => {
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
  it("組織名変更は明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() =>
      useOrganizationNameController({
        organizationId,
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

  it("店舗追加は明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() => useShopManagementController({ organizationId, canAddShop: true }));
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

  it("請求先変更は明示organizationIdを送る", async () => {
    mocks.mutation.mockResolvedValue({ changed: true });
    const { result } = renderHook(() => useBillingSettingsController({ organizationId, billing }));

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

  it("課金controllerは料金取得に明示organizationIdを使う", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });

    renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing,
      }),
    );

    await waitFor(() => expect(mocks.actions.getPlanPrice).toHaveBeenCalledTimes(2));
    expect(mocks.actions.getPlanPrice.mock.calls).toEqual([
      [{ organizationId: "organization-app", targetPlan: "standard" }],
      [{ organizationId: "organization-app", targetPlan: "pro" }],
    ]);
  });

  it("組織名の変更中に権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ canUpdate }) =>
        useOrganizationNameController({
          organizationId,
          organizationName: "さくらダイニング",
          canUpdateOrganizationName: canUpdate,
        }),
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
      initialProps: { organizationId, canAddShop: true },
    });
    act(() => result.current.addShop());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ organizationId, canAddShop: false });

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
      initialProps: { organizationId, canAddShop: true },
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
        organizationId: "organization-app",
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

  it("組織作成は対象組織を送り、一度だけ実行して作成した組織と店舗を完了先へ渡す", async () => {
    let resolveMutation: ((shopId: string) => void) | undefined;
    mocks.mutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = (shopId: string) =>
            resolve({ organizationId: "organization-created", shopId, created: true });
        }),
    );
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { organizationId, canCreateOrganization: true, onCreated },
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
        organizationId: "organization-app",
        requestId: "request-1",
      }),
    );
    await act(async () => resolveMutation?.("shop-created"));
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "新しい組織を作りました",
      }),
    );
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created", "organization-created");
    expect(result.current.dialog.dialog).toBeNull();
  });

  it("組織作成上限では入口を押せて上限理由をsnackbarへ表示する", () => {
    const reason = "作成できる組織は3つまでです";
    const { result } = renderHook(() =>
      useOrganizationCreationController({
        organizationId,
        canCreateOrganization: false,
        createOrganizationDisabledReason: reason,
        onCreated: vi.fn(),
      }),
    );

    act(() => result.current.createOrganization());

    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast.mock.calls[0]?.[0]).toMatchObject({ message: reason });
    expect(result.current.dialog.dialog).toBeNull();
  });

  it("組織作成は作成したorganizationIdを完了先へ渡す", async () => {
    mocks.mutation.mockResolvedValue({
      organizationId: "organization-created",
      shopId: "shop-created",
      created: true,
    });
    const onCreated = vi.fn();
    const { result } = renderHook(() =>
      useOrganizationCreationController({
        canCreateOrganization: true,
        organizationId,
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
      organizationId: "organization-app",
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
      .mockResolvedValueOnce({ organizationId: "organization-created", shopId: "shop-created", created: false })
      .mockResolvedValueOnce({
        organizationId: "organization-created-next",
        shopId: "shop-created-next",
        created: true,
      });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { organizationId, canCreateOrganization: true, onCreated },
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
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created", "organization-created");
    expect(result.current.dialog.dialog).toBeNull();

    act(() => result.current.createOrganization());
    await act(async () => {
      await result.current.dialog.onSubmit(data);
    });

    expect(mocks.mutation.mock.calls.map(([args]) => args.requestId)).toEqual(["request-1", "request-1", "request-2"]);
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenLastCalledWith("shop-created-next", "organization-created-next");
  });

  it("組織作成は失敗したDialogを閉じて開き直すと新しいrequestIdを使う", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2"),
    });
    mocks.mutation
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ organizationId: "organization-created", shopId: "shop-created", created: true });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { organizationId, canCreateOrganization: true, onCreated },
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
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("shop-created", "organization-created");
  });

  it("閉じたDialogの古いsubmitは、新しく開いた作成intentへ流用しない", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2"),
    });
    const onCreated = vi.fn();
    const { result } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { organizationId, canCreateOrganization: true, onCreated },
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
      organizationId: "organization-app",
      requestId: "request-2",
    });
  });

  it("組織作成の権限を失うとDialogを閉じ、古いsubmitからmutationを呼ばない", async () => {
    const onCreated = vi.fn();
    const { result, rerender } = renderHook((input) => useOrganizationCreationController(input), {
      initialProps: { organizationId, canCreateOrganization: true, onCreated },
    });
    act(() => result.current.createOrganization());
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ organizationId, canCreateOrganization: false, onCreated });

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
      organizationId,
      organizationUpdatedAt: 1_721_286_400_000,
      organizationName: "さくらダイニング",
      canDeleteOrganization: true,
    };
    const { result } = renderHook(() => useOrganizationDeletionController(input));

    act(() => result.current.open());
    expect(result.current.dialog.dialog).toEqual({
      organizationName: "さくらダイニング",
    });
    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        confirmOrganizationId: "organization-app",
        expectedOrganizationUpdatedAt: 1_721_286_400_000,
        requestId: "request-1",
      }),
    );
  });

  it("組織削除成功後はDialogの履歴guardを除去してから次の画面へ遷移する", async () => {
    mocks.mutation.mockResolvedValue(undefined);
    const replaceLocation = vi.fn();
    const input = {
      organizationId,
      organizationUpdatedAt: 1_721_286_400_000,
      organizationName: "さくらダイニング",
      canDeleteOrganization: true,
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
      organizationId,
      organizationUpdatedAt: 1_721_286_400_000,
      organizationName: "さくらダイニング",
      canDeleteOrganization: true,
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
    const input = { organizationId, billing };
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
    mocks.actions.getPlanPrice.mockImplementation(({ targetPlan }: { targetPlan: "standard" | "pro" }) =>
      targetPlan === "standard"
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
    mocks.actions.startPaidCheckout.mockImplementation(
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
        organizationId,
        organizationName: "さくらダイニング",
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "startPaidPlan",
      targetPlan: "standard",
      intentKey: "request-1",
      organizationName: "さくらダイニング",
      source: "immediate",
      billingStartsOn: "Stripeでの支払い完了日",
      price: { status: "loading" },
    });
    expect(mocks.actions.getPlanPrice).toHaveBeenCalledWith({
      organizationId: "organization-app",
      targetPlan: "standard",
    });
    expect(mocks.actions.getPlanPrice).toHaveBeenCalledWith({
      organizationId: "organization-app",
      targetPlan: "pro",
    });

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
      expect(mocks.actions.startPaidCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        requestId: "request-1",
        targetPlan: "standard",
      }),
    );

    await act(async () => resolveCheckout?.({ status: "available", url: "https://checkout.stripe.example/session" }));
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/session");
  });

  it("トライアルのStandard継続登録では変更前後と請求開始日を確認する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.startPaidCheckout.mockResolvedValue({
      status: "available",
      url: "https://checkout.stripe.example/trial-standard",
    });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: false,
      hasStripeCustomer: false,
      trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: trialBilling,
      }),
    );

    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));
    act(() => result.current.managePlan());

    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "startPaidPlan",
        currentPlan: "trial",
        targetPlan: "standard",
        source: "trial",
        billingStartsOn: "2026年9月1日",
      }),
    );

    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.startPaidCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        requestId: "request-1",
        targetPlan: "standard",
      }),
    );
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/trial-standard");
  });

  it("Freeの課金状態が先に変わっても、Checkout URL取得後に一度だけ遷移する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.inspectPendingCheckout.mockResolvedValue({ status: "unchanged" });
    let resolveCheckout: ((value: { status: "available"; url: string }) => void) | undefined;
    mocks.actions.startPaidCheckout.mockImplementation(
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
    const { result, rerender } = renderHook(
      (billingView: OrganizationBillingView) =>
        useStripeBillingController({
          organizationId,
          organizationName: "さくらダイニング",
          billing: billingView,
        }),
      { initialProps: freeBilling },
    );

    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));
    act(() => result.current.managePlan("standard"));
    act(() => result.current.dialog.onSubmit());
    await waitFor(() => expect(mocks.actions.startPaidCheckout).toHaveBeenCalledTimes(1));

    rerender({
      ...freeBilling,
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "standard",
      hasStripeCustomer: true,
      canManagePlan: false,
    });
    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    expect(mocks.openBillingUrl).not.toHaveBeenCalled();

    await act(async () =>
      resolveCheckout?.({ status: "available", url: "https://checkout.stripe.example/state-first" }),
    );
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/state-first");
  });

  it("Checkout待機中に料金ページを離れた場合は、遅延結果でStripeへ遷移しない", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    let resolveCheckout: ((value: { status: "available"; url: string }) => void) | undefined;
    mocks.actions.startPaidCheckout.mockImplementation(
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
    const { result, unmount } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: freeBilling,
      }),
    );

    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));
    act(() => result.current.managePlan("standard"));
    act(() => result.current.dialog.onSubmit());
    await waitFor(() => expect(mocks.actions.startPaidCheckout).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => resolveCheckout?.({ status: "available", url: "https://checkout.stripe.example/late" }));

    expect(mocks.openBillingUrl).not.toHaveBeenCalled();
  });

  it("Checkout待機中に組織が変わった場合は、古い組織のURLへ遷移しない", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    let resolveCheckout: ((value: { status: "available"; url: string }) => void) | undefined;
    mocks.actions.startPaidCheckout.mockImplementation(
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
    const { result, rerender } = renderHook(
      ({ activeOrganizationId }: { activeOrganizationId: Id<"organizations"> }) =>
        useStripeBillingController({
          organizationId: activeOrganizationId,
          organizationName: "さくらダイニング",
          billing: freeBilling,
        }),
      { initialProps: { activeOrganizationId: organizationId } },
    );

    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));
    act(() => result.current.managePlan("standard"));
    act(() => result.current.dialog.onSubmit());
    await waitFor(() => expect(mocks.actions.startPaidCheckout).toHaveBeenCalledTimes(1));

    rerender({ activeOrganizationId: "organization-other" as Id<"organizations"> });
    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    await act(async () =>
      resolveCheckout?.({ status: "available", url: "https://checkout.stripe.example/stale-organization" }),
    );

    expect(mocks.openBillingUrl).not.toHaveBeenCalled();
  });

  it("randomUUIDがないブラウザでも安全な乱数から課金Dialogを開く", async () => {
    let sequence = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((values: Uint8Array) => {
        values.fill(0);
        values[15] = ++sequence;
        return values;
      }),
    });
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing: freeBilling }),
    );
    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));

    act(() => result.current.managePlan("standard"));

    expect(result.current.dialog.dialog).toMatchObject({
      kind: "startPaidPlan",
      intentKey: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
    });
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("Web Cryptoが利用できない場合は料金をerrorにし、クリック失敗を案内する", async () => {
    vi.stubGlobal("crypto", {});
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing: freeBilling }),
    );
    await waitFor(() => {
      expect(result.current.planPrices.standard).toEqual({ status: "error" });
      expect(result.current.planPrices.pro).toEqual({ status: "error" });
    });

    act(() => result.current.managePlan("standard"));

    expect(result.current.dialog.dialog).toBeNull();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "browser_crypto_unavailable" }),
    );
  });

  it("FreeからProは対応するPriceを確認して対象plan付きCheckoutを開始する", async () => {
    mocks.actions.getPlanPrice.mockImplementation(({ targetPlan }: { targetPlan: "standard" | "pro" }) =>
      Promise.resolve({
        status: "available",
        currency: "jpy",
        unitAmount: targetPlan === "pro" ? 8000 : 3000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      }),
    );
    mocks.actions.startPaidCheckout.mockResolvedValue({
      status: "available",
      url: "https://checkout.stripe.example/pro",
    });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing: freeBilling }),
    );

    await waitFor(() => expect(result.current.planPrices.pro.status).toBe("available"));
    act(() => result.current.managePlan("pro"));
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "startPaidPlan",
      targetPlan: "pro",
      price: { status: "available", value: { unitAmount: 8000 } },
    });
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.actions.startPaidCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        targetPlan: "pro",
        requestId: "request-1",
      }),
    );
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/pro");
  });

  it("Checkoutが利用不可なら外部遷移せず、安全な案内を表示する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.startPaidCheckout.mockResolvedValue({ status: "unavailable", reason: "configuration_pending" });
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
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

  it("Stripeのキャンセル戻りは組織を明示して一度だけ復旧Actionを呼び、完了後に戻り値を消費する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.cancelPendingCheckout.mockResolvedValue({ status: "cancelled" });
    const onStripeResultHandled = vi.fn();
    const freeBilling: OrganizationBillingView = {
      ...billing,
      state: "free",
      currentPlan: "free",
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: {
        organizationId,
        organizationName: "さくらダイニング",
        billing: freeBilling,
        stripeResult: "cancelled" as const,
        onStripeResultHandled,
      },
    });

    await waitFor(() =>
      expect(mocks.actions.cancelPendingCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "支払いをキャンセルしました",
      description: "元のプランに戻しました。",
    });
    expect(onStripeResultHandled).toHaveBeenCalledTimes(1);

    rerender({
      organizationId,
      organizationName: "さくらダイニング",
      billing: freeBilling,
      stripeResult: "cancelled",
      onStripeResultHandled,
    });
    expect(mocks.actions.cancelPendingCheckout).toHaveBeenCalledTimes(1);
  });

  it("ブラウザバックで戻り値がなくてもopen Checkoutを照合し、支払いの継続または明示キャンセルを選べる", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.inspectPendingCheckout.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.example/pending-session",
    });
    mocks.actions.cancelPendingCheckout.mockResolvedValue({ status: "cancelled" });
    const pendingBilling: OrganizationBillingView = {
      ...billing,
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "standard",
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: pendingBilling,
      }),
    );

    await waitFor(() =>
      expect(mocks.actions.inspectPendingCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
      }),
    );
    await waitFor(() => expect(result.current.pendingCheckout.status).toBe("open"));
    expect(mocks.actions.cancelPendingCheckout).not.toHaveBeenCalled();

    act(() => {
      const pageShow = new Event("pageshow");
      Object.defineProperty(pageShow, "persisted", { value: true });
      window.dispatchEvent(pageShow);
    });
    await waitFor(() => expect(mocks.actions.inspectPendingCheckout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pendingCheckout.status).toBe("open"));

    act(() => result.current.pendingCheckout.onContinue());
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.example/pending-session");

    act(() => result.current.pendingCheckout.onCancel());
    await waitFor(() =>
      expect(mocks.actions.cancelPendingCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "支払いをキャンセルしました",
      description: "元のプランに戻しました。",
    });
  });

  it("Stripe Customer未作成のTrialではSetup Checkoutを照合しない", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
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
      hasStripeCustomer: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: trialBilling,
      }),
    );

    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));
    expect(mocks.actions.inspectPendingCheckout).not.toHaveBeenCalled();
    expect(result.current.pendingCheckout).toMatchObject({ purpose: null, status: "idle" });
  });

  it("Trialのopen Setup Checkoutをmountと履歴復元で照合し、継続または取消を選べる", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.inspectPendingCheckout.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.example/trial-pending-session",
    });
    mocks.actions.cancelPendingCheckout.mockResolvedValue({ status: "cancelled" });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: false,
      hasStripeCustomer: true,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: trialBilling,
      }),
    );

    await waitFor(() =>
      expect(mocks.actions.inspectPendingCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingCheckout).toMatchObject({
        purpose: "trialPaymentMethodSetup",
        status: "open",
      }),
    );

    act(() => {
      const pageShow = new Event("pageshow");
      Object.defineProperty(pageShow, "persisted", { value: true });
      window.dispatchEvent(pageShow);
    });
    await waitFor(() => expect(mocks.actions.inspectPendingCheckout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pendingCheckout.status).toBe("open"));

    act(() => result.current.pendingCheckout.onContinue());
    expect(mocks.openBillingUrl).toHaveBeenCalledExactlyOnceWith(
      "https://checkout.stripe.example/trial-pending-session",
    );

    act(() => {
      result.current.pendingCheckout.onCancel();
      result.current.pendingCheckout.onCancel();
    });
    await waitFor(() =>
      expect(mocks.actions.cancelPendingCheckout).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingCheckout).toMatchObject({
        purpose: "trialPaymentMethodSetup",
        status: "idle",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "支払い方法の登録をやめました",
      description: "トライアルはそのまま利用できます。",
    });

    act(() => result.current.managePlan("standard"));
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", currentPlan: "trial" });
  });

  it("TrialのSetup Checkout operationがなければidleへ戻り、プラン操作を再開できる", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.inspectPendingCheckout.mockResolvedValue({ status: "unchanged" });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: false,
      hasStripeCustomer: true,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: trialBilling,
      }),
    );

    await waitFor(() => expect(result.current.pendingCheckout.status).toBe("idle"));
    act(() => result.current.managePlan("standard"));
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", currentPlan: "trial" });
  });

  it("閲覧のみのメンバーはpending CheckoutをStripeへ照合しない", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    const pendingBilling: OrganizationBillingView = {
      ...billing,
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "standard",
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: pendingBilling,
        canManagePendingCheckout: false,
      }),
    );

    await waitFor(() => expect(mocks.actions.getPlanPrice).toHaveBeenCalled());
    expect(mocks.actions.inspectPendingCheckout).not.toHaveBeenCalled();
    expect(result.current.pendingCheckout.status).toBe("idle");
  });

  it("価格を取得できない場合はDialog内で案内し、再読み込みできる", async () => {
    let standardPriceRequestCount = 0;
    mocks.actions.getPlanPrice.mockImplementation(({ targetPlan }: { targetPlan: "standard" | "pro" }) => {
      if (targetPlan === "pro") {
        return Promise.resolve({
          status: "available",
          currency: "jpy",
          unitAmount: 6000,
          interval: "month",
          intervalCount: 1,
          taxBehavior: "inclusive",
        });
      }
      standardPriceRequestCount += 1;
      return Promise.resolve(
        standardPriceRequestCount === 1
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
        organizationId,
        organizationName: "さくらダイニング",
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
    expect(mocks.actions.startPaidCheckout).not.toHaveBeenCalled();

    act(() => result.current.dialog.onRetryPrice());
    expect(result.current.dialog.dialog).toMatchObject({ price: { status: "loading" } });
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        price: { status: "available", value: { currency: "jpy", unitAmount: 3000 } },
      }),
    );
    expect(mocks.actions.getPlanPrice).toHaveBeenCalledTimes(3);
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
    mocks.actions.getPlanPrice.mockImplementation(({ targetPlan }: { targetPlan: "standard" | "pro" }) =>
      targetPlan === "standard"
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
        organizationId,
        organizationName: "さくらダイニング",
        billing: freeBilling,
      }),
    );

    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", price: { status: "loading" } });
    act(() => result.current.dialog.onClose());
    expect(result.current.dialog.dialog).toBeNull();
    act(() => result.current.managePlan());
    expect(result.current.dialog.dialog).toMatchObject({ kind: "startPaidPlan", price: { status: "loading" } });
    expect(mocks.actions.getPlanPrice).toHaveBeenCalledTimes(2);

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

  it("TrialのStandard継続登録済み状態ではCheckoutを増やさず、取消を確認して一度だけ受け付ける", async () => {
    mocks.actions.cancelTrialContinuation.mockResolvedValue({ status: "accepted" });
    const trialBilling: OrganizationBillingView = {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: true,
      targetPlan: "standard",
      trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    };
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
        billing: trialBilling,
      }),
    );

    act(() => result.current.managePlan("free"));
    expect(result.current.dialog.dialog).toMatchObject({
      kind: "cancelTrialContinuation",
      currentPlan: "trial",
      intentKey: "request-1",
      effectiveOn: "2026年9月1日",
    });
    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });

    await waitFor(() =>
      expect(mocks.actions.cancelTrialContinuation).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        requestId: "request-1",
      }),
    );
    expect(mocks.actions.getPlanPrice).toHaveBeenCalledTimes(2);
    expect(mocks.actions.startPaidCheckout).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "Standard継続の取り消しを受け付けました",
      }),
    );
  });

  it("active Standardの解約予約と予約済み状態の取消を対応するActionへ接続する", async () => {
    mocks.actions.scheduleServiceStopAtPeriodEnd.mockResolvedValue({ status: "accepted" });
    mocks.actions.cancelScheduledPlanChange.mockResolvedValue({ status: "accepted" });
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationId, organizationName: "さくらダイニング", billing },
    });

    act(() => result.current.managePlan("free"));
    expect(result.current.dialog.dialog?.kind).toBe("scheduleServiceStop");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.scheduleServiceStopAtPeriodEnd).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        requestId: "request-1",
      }),
    );
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
        title: "解約を受け付けました",
      }),
    );

    rerender({
      organizationId,
      organizationName: "さくらダイニング",
      billing: {
        ...billing,
        state: "scheduledChange",
        currentPlan: "standard",
        targetPlan: "free",
        restrictAtPeriodEnd: true,
        nextEvent: { label: "契約終了日", date: "2026年8月31日" },
        canScheduleFree: false,
      },
    });
    act(() => result.current.managePlan("standard"));
    expect(result.current.dialog.dialog?.kind).toBe("cancelScheduledPlanChange");
    act(() => result.current.dialog.onSubmit());
    await waitFor(() =>
      expect(mocks.actions.cancelScheduledPlanChange).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        requestId: "request-1",
      }),
    );
    await waitFor(() => expect(mocks.showSuccessToast).toHaveBeenCalledTimes(2));
    expect(mocks.showSuccessToast).toHaveBeenNthCalledWith(2, {
      title: "解約予約の取り消しを受け付けました",
    });
  });

  it("StandardからProは同じproration dateの見積もり確認後に一度だけ即時変更する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 8000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.previewPaidPlanChange.mockResolvedValue({
      status: "available",
      currency: "jpy",
      amountDue: 4200,
      currentPeriodEnd: Date.parse("2026-09-01T00:00:00+09:00"),
      prorationDate: 1_780_000_000,
    });
    mocks.actions.changePaidPlanNow.mockResolvedValue({ status: "accepted" });
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing }),
    );

    act(() => result.current.managePlan("pro"));
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "changePaidPlanNow",
        targetPlan: "pro",
        preview: {
          status: "available",
          value: { amountDue: 4200, prorationDate: 1_780_000_000 },
        },
        price: { status: "available" },
      }),
    );
    expect(mocks.actions.previewPaidPlanChange).toHaveBeenCalledExactlyOnceWith({
      organizationId: "organization-app",
      targetPlan: "pro",
      requestId: "request-1",
    });

    act(() => {
      result.current.dialog.onSubmit();
      result.current.dialog.onSubmit();
    });
    await waitFor(() =>
      expect(mocks.actions.changePaidPlanNow).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        targetPlan: "pro",
        prorationDate: 1_780_000_000,
        requestId: "request-1",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "Proへの変更を受け付けました",
    });
  });

  it("日割り見積もり中のDialogを閉じて開き直しても、新しい確認が読み込み中のまま残らない", async () => {
    let requestSequence = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
    );
    mocks.actions.getPlanPrice.mockResolvedValue({
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
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing }),
    );
    await waitFor(() => expect(result.current.planPrices.standard.status).toBe("available"));

    act(() => result.current.managePlan("pro"));
    const firstIntent = result.current.dialog.dialog?.intentKey;
    act(() => result.current.dialog.onClose());
    act(() => result.current.managePlan("pro"));
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

  it("ProからStandardは期間末変更と必要削減人数を確認して予約する", async () => {
    mocks.actions.getPlanPrice.mockResolvedValue({
      status: "available",
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    mocks.actions.schedulePaidPlanChange.mockResolvedValue({ status: "accepted" });
    const proBilling: OrganizationBillingView = {
      ...billing,
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 28, max: 50 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
      nextEvent: { label: "次回更新日", date: "2026年8月31日" },
    };
    const { result } = renderHook(() =>
      useStripeBillingController({ organizationId, organizationName: "さくらダイニング", billing: proBilling }),
    );

    act(() => result.current.managePlan("standard"));
    await waitFor(() =>
      expect(result.current.dialog.dialog).toMatchObject({
        kind: "schedulePlanChange",
        targetPlan: "standard",
        price: { status: "available" },
        effectiveOn: "2026年8月31日",
        requiredReductions: { people: 3, shops: 0, managers: 0 },
      }),
    );
    act(() => result.current.dialog.onSubmit());

    await waitFor(() =>
      expect(mocks.actions.schedulePaidPlanChange).toHaveBeenCalledExactlyOnceWith({
        organizationId: "organization-app",
        targetPlan: "standard",
        requestId: "request-1",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "Standardへの変更予約を受け付けました",
    });
  });

  it("確認中にorganizationIdが変わったらDialogを閉じ、古い確定操作を受け付けない", async () => {
    const input = { organizationId, organizationName: "さくらダイニング", billing };
    const { result, rerender } = renderHook((props) => useStripeBillingController(props), {
      initialProps: input,
    });
    act(() => result.current.managePlan("free"));
    const staleSubmit = result.current.dialog.onSubmit;

    rerender({ ...input, organizationId: "organization-other" as Id<"organizations"> });

    await waitFor(() => expect(result.current.dialog.dialog).toBeNull());
    act(() => staleSubmit());
    expect(mocks.actions.scheduleServiceStopAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("支払い方法と請求書・領収書はorganizationIdを送り、Portalのredirect結果だけで外部遷移する", async () => {
    mocks.actions.openCustomerPortal.mockResolvedValue({
      status: "redirect",
      url: "https://billing.stripe.example/session",
    });
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
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
      organizationId: "organization-app",
      requestId: "request-1",
    });
    expect(mocks.openBillingUrl).toHaveBeenCalledTimes(1);
  });

  it("Stripe Customer未作成ではPortalを開かない", async () => {
    const { result } = renderHook(() =>
      useStripeBillingController({
        organizationId,
        organizationName: "さくらダイニング",
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

  it("支払い不要Proでは古い確定操作を含む全Stripe Actionを呼ばない", async () => {
    const { result, rerender } = renderHook((input) => useStripeBillingController(input), {
      initialProps: { organizationId, organizationName: "さくらダイニング", billing },
    });
    await waitFor(() => expect(mocks.actions.getPlanPrice).toHaveBeenCalledTimes(2));
    act(() => result.current.managePlan());
    const staleSubmit = result.current.dialog.onSubmit;
    for (const action of Object.values(mocks.actions)) action.mockClear();

    rerender({
      organizationId,
      organizationName: "さくらダイニング",
      billing: {
        ...billing,
        state: "pro",
        currentPlan: "pro",
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
