import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
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
  organizationId: Id<"organizations">;
  organizationName: string;
  billing: OrganizationBillingView;
};

type PortalIntent = { kind: "plan" } | { kind: "paymentMethod" } | { kind: "billingDocuments" };

const INITIAL_PRICES: BillingPlanPrices = {
  pro: { status: "loading" },
  business: { status: "loading" },
};

export function useStripeBillingController(input: Input) {
  const getPlanPriceForOrganization = useAction(api.organizationStripe.actions.getPlanPriceForOrganization);
  const startPaidCheckoutForOrganization = useAction(api.organizationStripe.actions.startPaidCheckoutForOrganization);
  const previewPaidPlanChangeForOrganization = useAction(
    api.organizationStripe.actions.previewPaidPlanChangeForOrganization,
  );
  const changePaidPlanNowForOrganization = useAction(api.organizationStripe.actions.changePaidPlanNowForOrganization);
  const schedulePaidPlanChangeForOrganization = useAction(
    api.organizationStripe.actions.schedulePaidPlanChangeForOrganization,
  );
  const scheduleServiceStopAtPeriodEndForOrganization = useAction(
    api.organizationStripe.actions.scheduleServiceStopAtPeriodEndForOrganization,
  );
  const cancelScheduledPlanChangeForOrganization = useAction(
    api.organizationStripe.actions.cancelScheduledPlanChangeForOrganization,
  );
  const openCustomerPortalForOrganization = useAction(api.organizationStripe.actions.openCustomerPortalForOrganization);
  const cancelTrialContinuationForOrganization = useAction(
    api.organizationStripe.actions.cancelTrialContinuationForOrganization,
  );
  const [planPrices, setPlanPrices] = useState<BillingPlanPrices>(INITIAL_PRICES);
  const [dialog, setDialog] = useState<BillingActionDialogState | null>(null);
  const latestRef = useRef(input);
  const activeScopeId = input.organizationId;
  const activeScopeIdRef = useRef(activeScopeId);
  const dialogRef = useRef(dialog);
  const priceRequestRef = useRef<Partial<Record<PaidBillingPlan, string>>>({});
  const previewRequestKeysRef = useRef(new Set<string>());
  latestRef.current = input;
  activeScopeIdRef.current = activeScopeId;
  dialogRef.current = dialog;

  const loadPlanPrice = useCallback(
    async (targetPlan: PaidBillingPlan, scopeId: string) => {
      const requestKey = crypto.randomUUID();
      priceRequestRef.current[targetPlan] = requestKey;
      setPlanPrices((current) => ({ ...current, [targetPlan]: { status: "loading" } }));
      try {
        const result = await getPlanPriceForOrganization({
          organizationId: latestRef.current.organizationId,
          targetPlan,
        });
        if (
          priceRequestRef.current[targetPlan] !== requestKey ||
          activeScopeIdRef.current !== scopeId ||
          latestRef.current.billing.isComplimentary
        ) {
          return;
        }
        setPlanPrices((current) => ({ ...current, [targetPlan]: toPlanPriceState(result) }));
      } catch {
        if (priceRequestRef.current[targetPlan] === requestKey && activeScopeIdRef.current === scopeId) {
          setPlanPrices((current) => ({ ...current, [targetPlan]: { status: "error" } }));
        }
      } finally {
        if (priceRequestRef.current[targetPlan] === requestKey) delete priceRequestRef.current[targetPlan];
      }
    },
    [getPlanPriceForOrganization],
  );

  useEffect(() => {
    if (!activeScopeId || input.billing.isComplimentary) {
      priceRequestRef.current = {};
      setPlanPrices(INITIAL_PRICES);
      return;
    }
    void loadPlanPrice("pro", activeScopeId);
    void loadPlanPrice("business", activeScopeId);
  }, [activeScopeId, input.billing.isComplimentary, loadPlanPrice]);

  useEffect(() => {
    setDialog((current) =>
      current?.kind === "startPaidPlan" ? { ...current, price: planPrices[current.targetPlan] } : current,
    );
  }, [planPrices]);

  useEffect(() => {
    setDialog((current) => {
      if (!current || input.billing.isComplimentary || activeScopeId !== current.shopId) return null;
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
  }, [activeScopeId, input.billing]);

  const prepareProrationPreview = useCallback(
    async (intent: { intentKey: string; shopId: string; targetPlan: "business" }) => {
      if (previewRequestKeysRef.current.has(intent.intentKey) || activeScopeIdRef.current !== intent.shopId) return;
      previewRequestKeysRef.current.add(intent.intentKey);
      try {
        const request = { targetPlan: intent.targetPlan, requestId: intent.intentKey } as const;
        const result = await previewPaidPlanChangeForOrganization({
          organizationId: latestRef.current.organizationId,
          ...request,
        });
        if (activeScopeIdRef.current !== intent.shopId) return;
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
    [previewPaidPlanChangeForOrganization],
  );

  const { run: confirm, isRunning } = useSingleFlight(async () => {
    const currentDialog = dialogRef.current;
    const current = latestRef.current;
    if (!currentDialog || current.billing.isComplimentary || activeScopeIdRef.current !== currentDialog.shopId) {
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

    const requestId = currentDialog.intentKey;
    const organizationId = current.organizationId;

    try {
      if (currentDialog.kind === "startPaidPlan") {
        const result = asBillingUrlActionResult(
          await startPaidCheckoutForOrganization({
            organizationId,
            requestId,
            targetPlan: currentDialog.targetPlan,
          }),
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
          await changePaidPlanNowForOrganization({
            organizationId,
            requestId,
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
          ? await cancelTrialContinuationForOrganization({ organizationId, requestId })
          : currentDialog.kind === "schedulePlanChange"
            ? await schedulePaidPlanChangeForOrganization({
                organizationId,
                requestId,
                targetPlan: currentDialog.targetPlan,
              })
            : currentDialog.kind === "scheduleServiceStop"
              ? await scheduleServiceStopAtPeriodEndForOrganization({ organizationId, requestId })
              : await cancelScheduledPlanChangeForOrganization({ organizationId, requestId });
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
    const scopeId = activeScopeIdRef.current;
    if (current.billing.isComplimentary || !scopeId || !canOpenPortal(current.billing, intent)) return;

    try {
      const result = asBillingUrlActionResult(
        await openCustomerPortalForOrganization({
          organizationId: current.organizationId,
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
    const scopeId = activeScopeIdRef.current;
    if (current.billing.isComplimentary || !scopeId) return;
    const action = resolveBillingPlanAction(current.billing, targetPlan);
    if (!action) return;
    if (action.kind === "openPortal") {
      void openPortal({ kind: "plan" });
      return;
    }

    const base = {
      intentKey: crypto.randomUUID(),
      shopId: scopeId,
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
    const scopeId = activeScopeIdRef.current;
    if (!scopeId || latestRef.current.billing.isComplimentary || priceRequestRef.current[targetPlan]) return;
    void loadPlanPrice(targetPlan, scopeId);
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
