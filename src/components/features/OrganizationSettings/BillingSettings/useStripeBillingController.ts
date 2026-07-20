import { useAction } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { OrganizationBillingView } from "../types";
import { openBillingUrl } from "./openBillingUrl";
import {
  type BillingActionDialogState,
  type BillingPlanAction,
  billingUnavailableMessage,
  formatBillingBoundaryDate,
  resolveBillingPlanAction,
} from "./script";

type Input = {
  organizationName: string;
  shopNames: string[];
  billing: OrganizationBillingView;
};

type PortalIntent = { kind: "plan" } | { kind: "paymentMethod" } | { kind: "billingDocuments" };

export function useStripeBillingController(input: Input) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const getProPrice = useAction(api.organizationStripe.actions.getProPrice);
  const startProCheckout = useAction(api.organizationStripe.actions.startProCheckout);
  const openCustomerPortal = useAction(api.organizationStripe.actions.openCustomerPortal);
  const scheduleFreeAtPeriodEnd = useAction(api.organizationStripe.actions.scheduleFreeAtPeriodEnd);
  const cancelScheduledFree = useAction(api.organizationStripe.actions.cancelScheduledFree);
  const cancelTrialContinuation = useAction(api.organizationStripe.actions.cancelTrialContinuation);
  const [dialog, setDialog] = useState<BillingActionDialogState | null>(null);
  const latestRef = useRef(input);
  const selectedShopIdRef = useRef(selectedShop?.shopId);
  const dialogRef = useRef(dialog);
  const startProPriceRequestRef = useRef<{ intentKey: string; shopId: string } | null>(null);
  latestRef.current = input;
  selectedShopIdRef.current = selectedShop?.shopId;
  dialogRef.current = dialog;

  useEffect(() => {
    setDialog((current) => {
      if (!current) return null;
      const action = resolveBillingPlanAction(input.billing);
      return action === current.kind && !input.billing.isComplimentary && selectedShop?.shopId === current.shopId
        ? current
        : null;
    });
  }, [input.billing, selectedShop?.shopId]);

  const { run: prepareStartPro } = useSingleFlight(async (intent: { intentKey: string; shopId: string }) => {
    const current = latestRef.current;
    if (
      current.billing.isComplimentary ||
      resolveBillingPlanAction(current.billing) !== "startPro" ||
      selectedShopIdRef.current !== intent.shopId
    ) {
      if (startProPriceRequestRef.current?.intentKey === intent.intentKey) startProPriceRequestRef.current = null;
      return;
    }

    try {
      const result = await getProPrice({ shopId: intent.shopId as Id<"shops"> });
      const latest = latestRef.current;
      if (
        latest.billing.isComplimentary ||
        resolveBillingPlanAction(latest.billing) !== "startPro" ||
        selectedShopIdRef.current !== intent.shopId
      ) {
        return;
      }

      setDialog((dialog) => {
        if (dialog?.kind !== "startPro" || dialog.intentKey !== intent.intentKey) return dialog;
        return {
          ...dialog,
          price:
            result.status === "unavailable"
              ? { status: "unavailable", reason: result.reason }
              : {
                  status: "available",
                  value: {
                    currency: result.currency,
                    unitAmount: result.unitAmount,
                    interval: result.interval,
                    intervalCount: result.intervalCount,
                  },
                },
        };
      });
    } catch {
      setDialog((dialog) =>
        dialog?.kind === "startPro" && dialog.intentKey === intent.intentKey
          ? { ...dialog, price: { status: "error" } }
          : dialog,
      );
    } finally {
      if (startProPriceRequestRef.current?.intentKey === intent.intentKey) startProPriceRequestRef.current = null;
    }
  });

  const { run: confirm, isRunning } = useSingleFlight(async () => {
    const currentDialog = dialogRef.current;
    const current = latestRef.current;
    if (
      !currentDialog ||
      current.billing.isComplimentary ||
      resolveBillingPlanAction(current.billing) !== currentDialog.kind ||
      selectedShopIdRef.current !== currentDialog.shopId
    ) {
      setDialog(null);
      return;
    }
    if (currentDialog.kind === "startPro" && currentDialog.price.status !== "available") return;

    const args = {
      shopId: currentDialog.shopId as Id<"shops">,
      requestId: currentDialog.intentKey,
    };

    try {
      if (currentDialog.kind === "startPro") {
        const result = await startProCheckout(args);
        if (result.status === "unavailable") {
          showUnavailable(result.reason);
          return;
        }
        setDialog(null);
        openBillingUrl(result.url);
        return;
      }

      const result =
        currentDialog.kind === "cancelTrialContinuation"
          ? await cancelTrialContinuation(args)
          : currentDialog.kind === "scheduleFree"
            ? await scheduleFreeAtPeriodEnd(args)
            : await cancelScheduledFree(args);
      if (result.status === "unavailable") {
        showUnavailable(result.reason);
        return;
      }

      setDialog(null);
      showSuccessToast({ title: acceptedMessage(currentDialog.kind) });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: openPortal } = useSingleFlight(async (intent: PortalIntent) => {
    const current = latestRef.current;
    const shopId = selectedShopIdRef.current;
    if (current.billing.isComplimentary || !shopId || !canOpenPortal(current.billing, intent)) return;

    try {
      const result = await openCustomerPortal({
        shopId: shopId as Id<"shops">,
        requestId: crypto.randomUUID(),
      });
      if (result.status === "unavailable") {
        showUnavailable(result.reason);
        return;
      }
      openBillingUrl(result.url);
    } catch (error) {
      showErrorToast(error);
    }
  });

  const openDialogForAction = (action: Exclude<BillingPlanAction, "startPro" | "openPortal">) => {
    const current = latestRef.current;
    const shopId = selectedShopIdRef.current;
    if (current.billing.isComplimentary || resolveBillingPlanAction(current.billing) !== action || !shopId) return;

    const base = {
      intentKey: crypto.randomUUID(),
      shopId,
      organizationName: current.organizationName,
    };
    if (action === "cancelTrialContinuation") {
      setDialog({
        ...base,
        kind: action,
        trialEndsOn: current.billing.nextEvent?.date,
      });
      return;
    }
    setDialog({
      ...base,
      kind: action,
      effectiveOn: current.billing.nextEvent?.date,
    });
  };

  const managePlan = () => {
    const current = latestRef.current.billing;
    if (current.isComplimentary) return;

    const action = resolveBillingPlanAction(current);
    if (action === "startPro") {
      const shopId = selectedShopIdRef.current;
      if (!shopId) return;
      const pendingRequest = startProPriceRequestRef.current;
      if (pendingRequest && pendingRequest.shopId !== shopId) return;
      const intentKey = pendingRequest?.intentKey ?? crypto.randomUUID();
      setDialog({
        kind: "startPro",
        intentKey,
        shopId,
        organizationName: latestRef.current.organizationName,
        source: current.state === "trial" ? "trial" : "immediate",
        billingStartsOn:
          current.state === "trial"
            ? current.trialEndsAt
              ? formatBillingBoundaryDate(current.trialEndsAt)
              : "トライアル終了後"
            : "Stripeでの支払い完了後",
        shopNames: [...latestRef.current.shopNames],
        price: { status: "loading" },
      });
      if (!pendingRequest) {
        startProPriceRequestRef.current = { intentKey, shopId };
        void prepareStartPro({ intentKey, shopId });
      }
      return;
    }
    if (action === "openPortal") {
      void openPortal({ kind: "plan" });
      return;
    }
    if (action) openDialogForAction(action);
  };

  return {
    managePlan,
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
        const currentDialog = dialogRef.current;
        if (
          currentDialog?.kind !== "startPro" ||
          currentDialog.price.status === "available" ||
          startProPriceRequestRef.current
        ) {
          return;
        }
        startProPriceRequestRef.current = { intentKey: currentDialog.intentKey, shopId: currentDialog.shopId };
        setDialog({ ...currentDialog, price: { status: "loading" } });
        void prepareStartPro({ intentKey: currentDialog.intentKey, shopId: currentDialog.shopId });
      },
      onSubmit: () => void confirm(),
    },
  };
}

function canOpenPortal(billing: OrganizationBillingView, intent: PortalIntent): boolean {
  if (!billing.stripeBillingAvailable) return false;
  if (intent.kind === "plan") {
    return resolveBillingPlanAction(billing) === "openPortal" && billing.canUpdatePaymentMethod;
  }
  return billing.canUpdatePaymentMethod;
}

function showUnavailable(reason: Parameters<typeof billingUnavailableMessage>[0]): void {
  toaster.create({
    ...billingUnavailableMessage(reason),
    duration: 8000,
  });
}

function acceptedMessage(action: Exclude<BillingPlanAction, "startPro" | "openPortal">): string {
  if (action === "cancelTrialContinuation") return "Pro継続の取り消しを受け付けました";
  if (action === "scheduleFree") return "無料への変更予約を受け付けました";
  return "無料への変更予約の取り消しを受け付けました";
}
