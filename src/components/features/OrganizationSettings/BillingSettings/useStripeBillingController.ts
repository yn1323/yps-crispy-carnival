import { useAction } from "convex/react";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { BillingPlanPrices, BillingProductPlan, OrganizationBillingView, PaidBillingPlan } from "../types";
import {
  asBillingAcceptedActionResult,
  asBillingUrlActionResult,
  toPlanPriceState,
  toProrationPreviewState,
} from "./actionAdapter";
import { openBillingUrl } from "./openBillingUrl";
import {
  type BillingActionDialogState,
  billingUnavailableMessage,
  formatBillingBoundaryDate,
  getRequiredReductions,
  planLabel,
  resolveBillingPlanAction,
} from "./script";

type Input = {
  organizationName: string;
  billing: OrganizationBillingView;
  // 旧controllerテストと段階的移行用。料金・Checkoutへ店舗名は送らない。
  shopNames?: string[];
};

type PortalIntent = { kind: "plan" } | { kind: "paymentMethod" } | { kind: "billingDocuments" };

const INITIAL_PRICES: BillingPlanPrices = {
  pro: { status: "loading" },
  business: { status: "loading" },
};

export function useStripeBillingController(input: Input) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const getPlanPrice = useAction(api.organizationStripe.actions.getPlanPrice);
  const startPaidCheckout = useAction(api.organizationStripe.actions.startPaidCheckout);
  const previewPaidPlanChange = useAction(api.organizationStripe.actions.previewPaidPlanChange);
  const changePaidPlanNow = useAction(api.organizationStripe.actions.changePaidPlanNow);
  const schedulePaidPlanChange = useAction(api.organizationStripe.actions.schedulePaidPlanChange);
  const scheduleServiceStopAtPeriodEnd = useAction(api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd);
  const cancelScheduledPlanChange = useAction(api.organizationStripe.actions.cancelScheduledPlanChange);
  const openCustomerPortal = useAction(api.organizationStripe.actions.openCustomerPortal);
  const cancelTrialContinuation = useAction(api.organizationStripe.actions.cancelTrialContinuation);
  const [planPrices, setPlanPrices] = useState<BillingPlanPrices>(INITIAL_PRICES);
  const [dialog, setDialog] = useState<BillingActionDialogState | null>(null);
  const latestRef = useRef(input);
  const selectedShopIdRef = useRef(selectedShop?.shopId);
  const dialogRef = useRef(dialog);
  const priceRequestRef = useRef<Partial<Record<PaidBillingPlan, string>>>({});
  const previewRequestKeysRef = useRef(new Set<string>());
  latestRef.current = input;
  selectedShopIdRef.current = selectedShop?.shopId;
  dialogRef.current = dialog;

  const loadPlanPrice = useCallback(
    async (targetPlan: PaidBillingPlan, shopId: string) => {
      const requestKey = crypto.randomUUID();
      priceRequestRef.current[targetPlan] = requestKey;
      setPlanPrices((current) => ({ ...current, [targetPlan]: { status: "loading" } }));
      try {
        const result = await getPlanPrice({ shopId: shopId as Id<"shops">, targetPlan });
        if (
          priceRequestRef.current[targetPlan] !== requestKey ||
          selectedShopIdRef.current !== shopId ||
          latestRef.current.billing.isComplimentary
        ) {
          return;
        }
        setPlanPrices((current) => ({ ...current, [targetPlan]: toPlanPriceState(result) }));
      } catch {
        if (priceRequestRef.current[targetPlan] === requestKey && selectedShopIdRef.current === shopId) {
          setPlanPrices((current) => ({ ...current, [targetPlan]: { status: "error" } }));
        }
      } finally {
        if (priceRequestRef.current[targetPlan] === requestKey) delete priceRequestRef.current[targetPlan];
      }
    },
    [getPlanPrice],
  );

  useEffect(() => {
    const shopId = selectedShop?.shopId;
    if (!shopId || input.billing.isComplimentary) {
      priceRequestRef.current = {};
      setPlanPrices(INITIAL_PRICES);
      return;
    }
    void loadPlanPrice("pro", shopId);
    void loadPlanPrice("business", shopId);
  }, [input.billing.isComplimentary, loadPlanPrice, selectedShop?.shopId]);

  useEffect(() => {
    setDialog((current) =>
      current?.kind === "startPaidPlan" ? { ...current, price: planPrices[current.targetPlan] } : current,
    );
  }, [planPrices]);

  useEffect(() => {
    setDialog((current) => {
      if (!current || input.billing.isComplimentary || selectedShop?.shopId !== current.shopId) return null;
      const actionTarget =
        current.kind === "cancelScheduledPlanChange"
          ? input.billing.currentPlan
          : current.kind === "cancelTrialContinuation"
            ? "free"
            : current.targetPlan;
      if (!actionTarget || actionTarget === "trial") return null;
      const expected = resolveBillingPlanAction(input.billing, actionTarget);
      return expected?.kind === current.kind ? current : null;
    });
  }, [input.billing, selectedShop?.shopId]);

  const prepareProrationPreview = useCallback(
    async (intent: { intentKey: string; shopId: string; targetPlan: "business" }) => {
      if (previewRequestKeysRef.current.has(intent.intentKey) || selectedShopIdRef.current !== intent.shopId) return;
      previewRequestKeysRef.current.add(intent.intentKey);
      try {
        const result = await previewPaidPlanChange({
          shopId: intent.shopId as Id<"shops">,
          targetPlan: intent.targetPlan,
          requestId: intent.intentKey,
        });
        if (selectedShopIdRef.current !== intent.shopId) return;
        setDialog((current) =>
          current?.kind === "changePaidPlanNow" && current.intentKey === intent.intentKey
            ? { ...current, preview: toProrationPreviewState(result) }
            : current,
        );
      } catch {
        setDialog((current) =>
          current?.kind === "changePaidPlanNow" && current.intentKey === intent.intentKey
            ? { ...current, preview: { status: "error" } }
            : current,
        );
      } finally {
        previewRequestKeysRef.current.delete(intent.intentKey);
      }
    },
    [previewPaidPlanChange],
  );

  const { run: confirm, isRunning } = useSingleFlight(async () => {
    const currentDialog = dialogRef.current;
    const current = latestRef.current;
    if (!currentDialog || current.billing.isComplimentary || selectedShopIdRef.current !== currentDialog.shopId) {
      setDialog(null);
      return;
    }

    const actionTarget =
      currentDialog.kind === "cancelScheduledPlanChange"
        ? current.billing.currentPlan
        : currentDialog.kind === "cancelTrialContinuation"
          ? "free"
          : currentDialog.targetPlan;
    const expected =
      actionTarget && actionTarget !== "trial" ? resolveBillingPlanAction(current.billing, actionTarget) : null;
    if (expected?.kind !== currentDialog.kind) {
      setDialog(null);
      return;
    }
    if (currentDialog.kind === "startPaidPlan" && currentDialog.price.status !== "available") return;
    if (currentDialog.kind === "changePaidPlanNow" && currentDialog.preview.status !== "available") return;

    const baseArgs = {
      shopId: currentDialog.shopId as Id<"shops">,
      requestId: currentDialog.intentKey,
    };

    try {
      if (currentDialog.kind === "startPaidPlan") {
        const result = asBillingUrlActionResult(
          await startPaidCheckout({ ...baseArgs, targetPlan: currentDialog.targetPlan }),
        );
        if (!result) throw new Error("Unexpected billing response");
        if (result.status === "unavailable") return showUnavailable(result.reason);
        setDialog(null);
        openBillingUrl(result.url);
        return;
      }

      if (currentDialog.kind === "changePaidPlanNow") {
        if (currentDialog.preview.status !== "available") return;
        const { prorationDate } = currentDialog.preview.value;
        const result = asBillingAcceptedActionResult(
          await changePaidPlanNow({
            ...baseArgs,
            targetPlan: currentDialog.targetPlan,
            prorationDate,
          }),
        );
        if (!result) throw new Error("Unexpected billing response");
        if (result.status === "unavailable") return showUnavailable(result.reason);
        setDialog(null);
        showSuccessToast({ title: "Businessへの変更を受け付けました" });
        return;
      }

      const rawResult =
        currentDialog.kind === "cancelTrialContinuation"
          ? await cancelTrialContinuation(baseArgs)
          : currentDialog.kind === "schedulePlanChange"
            ? await schedulePaidPlanChange({ ...baseArgs, targetPlan: currentDialog.targetPlan })
            : currentDialog.kind === "scheduleServiceStop"
              ? await scheduleServiceStopAtPeriodEnd(baseArgs)
              : await cancelScheduledPlanChange(baseArgs);
      const result = asBillingAcceptedActionResult(rawResult);
      if (!result) throw new Error("Unexpected billing response");
      if (result.status === "unavailable") return showUnavailable(result.reason);
      setDialog(null);
      showSuccessToast({ title: acceptedMessage(currentDialog) });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: openPortal } = useSingleFlight(async (intent: PortalIntent) => {
    const current = latestRef.current;
    const shopId = selectedShopIdRef.current;
    if (current.billing.isComplimentary || !shopId || !canOpenPortal(current.billing, intent)) return;

    try {
      const result = asBillingUrlActionResult(
        await openCustomerPortal({
          shopId: shopId as Id<"shops">,
          requestId: crypto.randomUUID(),
        }),
      );
      if (!result) throw new Error("Unexpected billing response");
      if (result.status === "unavailable") return showUnavailable(result.reason);
      openBillingUrl(result.url);
    } catch (error) {
      showErrorToast(error);
    }
  });

  const managePlan = (targetPlan: BillingProductPlan = defaultTargetPlan(latestRef.current.billing)) => {
    const current = latestRef.current;
    const shopId = selectedShopIdRef.current;
    if (current.billing.isComplimentary || !shopId) return;
    const action = resolveBillingPlanAction(current.billing, targetPlan);
    if (!action) return;
    if (action.kind === "openPortal") {
      void openPortal({ kind: "plan" });
      return;
    }

    const base = {
      intentKey: crypto.randomUUID(),
      shopId,
      organizationName: current.organizationName,
    };
    if (action.kind === "startPaidPlan") {
      setDialog({
        ...base,
        ...action,
        source: current.billing.state === "trial" ? "trial" : "immediate",
        billingStartsOn:
          current.billing.state === "trial"
            ? current.billing.trialEndsAt
              ? formatBillingBoundaryDate(current.billing.trialEndsAt)
              : "トライアル終了後"
            : "Stripeでの支払い完了日",
        price: planPrices[action.targetPlan],
      });
      return;
    }
    if (action.kind === "changePaidPlanNow") {
      setDialog({ ...base, ...action, preview: { status: "loading" } });
      void prepareProrationPreview({ ...base, targetPlan: action.targetPlan });
      return;
    }
    if (action.kind === "cancelTrialContinuation") {
      setDialog({ ...base, ...action, trialEndsOn: current.billing.nextEvent?.date });
      return;
    }
    if (action.kind === "schedulePlanChange") {
      setDialog({
        ...base,
        ...action,
        effectiveOn: current.billing.nextEvent?.date,
        requiredReductions: getRequiredReductions(current.billing, action.targetPlan),
      });
      return;
    }
    if (action.kind === "scheduleServiceStop") {
      setDialog({ ...base, ...action, effectiveOn: current.billing.nextEvent?.date });
      return;
    }
    setDialog({ ...base, ...action, effectiveOn: current.billing.nextEvent?.date });
  };

  const retryPlanPrice = (targetPlan: PaidBillingPlan) => {
    const shopId = selectedShopIdRef.current;
    if (!shopId || latestRef.current.billing.isComplimentary || priceRequestRef.current[targetPlan]) return;
    void loadPlanPrice(targetPlan, shopId);
  };

  return {
    planPrices,
    managePlan,
    retryPlanPrice,
    updatePaymentMethod: () => {
      if (!latestRef.current.billing.isComplimentary) void openPortal({ kind: "paymentMethod" });
    },
    openBillingDocuments: () => {
      if (!latestRef.current.billing.isComplimentary) void openPortal({ kind: "billingDocuments" });
    },
    dialog: {
      dialog,
      isRunning,
      onClose: () => {
        if (!isRunning) setDialog(null);
      },
      onRetryPrice: () => {
        const current = dialogRef.current;
        if (current?.kind === "startPaidPlan") retryPlanPrice(current.targetPlan);
      },
      onRetryPreview: () => {
        const current = dialogRef.current;
        if (current?.kind !== "changePaidPlanNow" || previewRequestKeysRef.current.has(current.intentKey)) return;
        setDialog({ ...current, preview: { status: "loading" } });
        void prepareProrationPreview(current);
      },
      onSubmit: () => void confirm(),
    },
  };
}

function defaultTargetPlan(billing: OrganizationBillingView): BillingProductPlan {
  if (billing.state === "free" || billing.state === "trial" || billing.currentPlan === null) return "pro";
  if (billing.state === "scheduledChange" || billing.state === "scheduledFree") {
    return billing.currentPlan === "trial" ? "pro" : billing.currentPlan;
  }
  if (billing.currentPlan === "business") return "pro";
  return "business";
}

function canOpenPortal(billing: OrganizationBillingView, intent: PortalIntent): boolean {
  if (!billing.stripeBillingAvailable || !billing.canUpdatePaymentMethod) return false;
  if (intent.kind !== "plan") return true;
  return billing.state === "grace";
}

function showUnavailable(reason: Parameters<typeof billingUnavailableMessage>[0]): void {
  toaster.create({ ...billingUnavailableMessage(reason), duration: 8000 });
}

function acceptedMessage(dialog: Exclude<BillingActionDialogState, { kind: "startPaidPlan" | "changePaidPlanNow" }>) {
  if (dialog.kind === "cancelTrialContinuation") return `${planLabel(dialog.targetPlan)}継続の取り消しを受け付けました`;
  if (dialog.kind === "schedulePlanChange") return `${planLabel(dialog.targetPlan)}への変更予約を受け付けました`;
  if (dialog.kind === "scheduleServiceStop") return "利用停止の予約を受け付けました";
  return dialog.isServiceStop ? "利用停止予約の取り消しを受け付けました" : "プラン変更予約の取り消しを受け付けました";
}
