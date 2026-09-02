import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { createBrowserUuid } from "@/src/lib/browserUuid";
import type {
  BillingPendingCheckoutPurpose,
  BillingPendingCheckoutStatus,
  BillingPlanPrices,
  BillingProductPlan,
  OrganizationBillingView,
  PaidBillingPlan,
} from "../types";
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
  canManagePendingCheckout?: boolean;
  stripeResult?: "returned" | "cancelled";
  onStripeResultHandled?: () => void;
};

type PendingCheckoutScope = {
  key: string;
  purpose: BillingPendingCheckoutPurpose;
};

type PendingCheckoutState =
  | { scopeKey: null; purpose: null; status: "idle" }
  | ({ scopeKey: string; purpose: BillingPendingCheckoutPurpose } & (
      | { status: Exclude<BillingPendingCheckoutStatus, "open"> }
      | { status: "open"; url: string }
    ));

const INITIAL_PRICES: BillingPlanPrices = {
  standard: { status: "loading" },
  pro: { status: "loading" },
};

export function useStripeBillingController(input: Input) {
  const getPlanPriceForOrganization = useAction(api.organizationStripe.actions.getPlanPriceForOrganization);
  const startPaidCheckoutForOrganization = useAction(api.organizationStripe.actions.startPaidCheckoutForOrganization);
  const inspectPendingCheckoutForOrganization = useAction(
    api.organizationStripe.actions.inspectPendingCheckoutForOrganization,
  );
  const cancelPendingCheckoutForOrganization = useAction(
    api.organizationStripe.actions.cancelPendingCheckoutForOrganization,
  );
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
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckoutState>({
    scopeKey: null,
    purpose: null,
    status: "idle",
  });
  const [pendingCheckoutInspectionRevision, setPendingCheckoutInspectionRevision] = useState(0);
  const [dialog, setDialog] = useState<BillingActionDialogState | null>(null);
  const latestRef = useRef(input);
  const activeScopeId = input.organizationId;
  const stripeResult = input.stripeResult;
  const onStripeResultHandled = input.onStripeResultHandled;
  const activeScopeIdRef = useRef(activeScopeId);
  const dialogRef = useRef(dialog);
  const isMountedRef = useRef(false);
  const handledStripeResultRef = useRef<string | null>(null);
  const inspectedPendingCheckoutRequestRef = useRef<string | null>(null);
  const skipPendingCheckoutInspectionRef = useRef<string | null>(null);
  const priceRequestRef = useRef<Partial<Record<PaidBillingPlan, string>>>({});
  const previewRequestKeysRef = useRef(new Set<string>());
  latestRef.current = input;
  activeScopeIdRef.current = activeScopeId;
  dialogRef.current = dialog;
  const pendingCheckoutScope = resolvePendingCheckoutScope(input);
  const pendingCheckoutKey = pendingCheckoutScope?.key ?? null;
  const pendingCheckoutPurpose = pendingCheckoutScope?.purpose ?? null;
  const shouldInspectPendingCheckout = pendingCheckoutKey !== null && stripeResult !== "cancelled";
  const visiblePendingCheckout: PendingCheckoutState = !pendingCheckoutScope
    ? { scopeKey: null, purpose: null, status: "idle" }
    : pendingCheckout.scopeKey === pendingCheckoutScope.key
      ? pendingCheckout
      : {
          scopeKey: pendingCheckoutScope.key,
          purpose: pendingCheckoutScope.purpose,
          status: "checking",
        };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPlanPrice = useCallback(
    async (targetPlan: PaidBillingPlan, scopeId: string) => {
      let requestKey: string;
      try {
        requestKey = createBrowserUuid();
      } catch {
        if (activeScopeIdRef.current === scopeId) {
          setPlanPrices((current) => ({ ...current, [targetPlan]: { status: "error" } }));
        }
        return;
      }
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
    void loadPlanPrice("standard", activeScopeId);
    void loadPlanPrice("pro", activeScopeId);
  }, [activeScopeId, input.billing.isComplimentary, loadPlanPrice]);

  useEffect(() => {
    setDialog((current) => {
      if (
        current?.kind !== "startPaidPlan" &&
        current?.kind !== "changePaidPlanNow" &&
        current?.kind !== "schedulePlanChange"
      ) {
        return current;
      }
      return { ...current, price: planPrices[current.targetPlan] };
    });
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

  useEffect(() => {
    if (!stripeResult) {
      handledStripeResultRef.current = null;
      return;
    }

    const resultKey = `${activeScopeId}:${stripeResult}`;
    if (handledStripeResultRef.current === resultKey) return;
    handledStripeResultRef.current = resultKey;

    if (stripeResult === "returned") {
      onStripeResultHandled?.();
      return;
    }

    const scope =
      pendingCheckoutKey && pendingCheckoutPurpose
        ? { key: pendingCheckoutKey, purpose: pendingCheckoutPurpose }
        : null;
    let disposed = false;
    if (scope) {
      skipPendingCheckoutInspectionRef.current = scope.key;
      setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "checking" });
    }
    void cancelPendingCheckoutForOrganization({ organizationId: input.organizationId })
      .then((result) => {
        if (disposed) return;
        if (result.status === "unavailable") {
          if (scope && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
            setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
          }
          showUnavailable(result.reason);
          return;
        }
        if (result.status === "cancelled") {
          if (scope && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
            setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "idle" });
          }
          showSuccessToast(cancelledCheckoutMessage(scope?.purpose ?? "paidCheckout"));
        } else if (result.status === "pending") {
          if (scope && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
            setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "pending" });
          }
          showSuccessToast(pendingCheckoutMessage(scope?.purpose ?? "paidCheckout"));
        } else {
          if (scope && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
            setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "idle" });
          }
        }
        onStripeResultHandled?.();
      })
      .catch((error) => {
        if (!disposed) {
          if (scope && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
            setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
          }
          showErrorToast(error);
        }
      });

    return () => {
      disposed = true;
    };
  }, [
    activeScopeId,
    cancelPendingCheckoutForOrganization,
    input.organizationId,
    onStripeResultHandled,
    pendingCheckoutKey,
    pendingCheckoutPurpose,
    stripeResult,
  ]);

  useEffect(() => {
    if (!pendingCheckoutKey) {
      inspectedPendingCheckoutRequestRef.current = null;
      skipPendingCheckoutInspectionRef.current = null;
      setPendingCheckout({ scopeKey: null, purpose: null, status: "idle" });
      return;
    }
    if (!pendingCheckoutPurpose) return;
    const inspectionRequestKey = `${pendingCheckoutKey}:${pendingCheckoutInspectionRevision}`;
    if (
      !shouldInspectPendingCheckout ||
      skipPendingCheckoutInspectionRef.current === pendingCheckoutKey ||
      inspectedPendingCheckoutRequestRef.current === inspectionRequestKey
    ) {
      return;
    }
    inspectedPendingCheckoutRequestRef.current = inspectionRequestKey;

    const scope = { key: pendingCheckoutKey, purpose: pendingCheckoutPurpose };
    let disposed = false;
    setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "checking" });
    void inspectPendingCheckoutForOrganization({ organizationId: input.organizationId })
      .then((result) => {
        if (disposed || resolvePendingCheckoutScope(latestRef.current)?.key !== scope.key) return;
        if (result.status === "open") {
          setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "open", url: result.url });
          return;
        }
        if (result.status === "pending") {
          setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "pending" });
          return;
        }
        if (result.status === "cancelled" || result.status === "unchanged") {
          setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "idle" });
          return;
        }
        setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
      })
      .catch(() => {
        if (!disposed && resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
          setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
        }
      });

    return () => {
      disposed = true;
    };
  }, [
    input.organizationId,
    inspectPendingCheckoutForOrganization,
    pendingCheckoutInspectionRevision,
    pendingCheckoutKey,
    pendingCheckoutPurpose,
    shouldInspectPendingCheckout,
  ]);

  useEffect(() => {
    const inspectAfterHistoryRestore = (event: PageTransitionEvent) => {
      const current = latestRef.current;
      if (!event.persisted || !resolvePendingCheckoutScope(current)) return;
      skipPendingCheckoutInspectionRef.current = null;
      setPendingCheckoutInspectionRevision((revision) => revision + 1);
    };

    window.addEventListener("pageshow", inspectAfterHistoryRestore);
    return () => window.removeEventListener("pageshow", inspectAfterHistoryRestore);
  }, []);

  const { run: stopPendingCheckout, isRunning: isStoppingPendingCheckout } = useSingleFlight(async () => {
    const current = latestRef.current;
    const scope = resolvePendingCheckoutScope(current);
    if (!scope) return;

    skipPendingCheckoutInspectionRef.current = scope.key;
    try {
      const result = await cancelPendingCheckoutForOrganization({ organizationId: current.organizationId });
      if (resolvePendingCheckoutScope(latestRef.current)?.key !== scope.key) return;
      if (result.status === "unavailable") {
        setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
        showUnavailable(result.reason);
        return;
      }
      if (result.status === "cancelled") {
        setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "idle" });
        showSuccessToast(cancelledCheckoutMessage(scope.purpose));
        return;
      }
      if (result.status === "pending") {
        setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "pending" });
        return;
      }
      setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "idle" });
    } catch (error) {
      if (resolvePendingCheckoutScope(latestRef.current)?.key === scope.key) {
        setPendingCheckout({ scopeKey: scope.key, purpose: scope.purpose, status: "unavailable" });
        showErrorToast(error);
      }
    }
  });

  const prepareProrationPreview = useCallback(
    async (intent: { intentKey: string; shopId: string; targetPlan: "pro" }) => {
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
    if (currentDialog.kind === "changePaidPlanNow" && currentDialog.price.status !== "available") return;
    if (currentDialog.kind === "changePaidPlanNow" && currentDialog.preview.status !== "available") return;
    if (currentDialog.kind === "schedulePlanChange" && currentDialog.price.status !== "available") return;

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
        if (!isMountedRef.current || activeScopeIdRef.current !== organizationId) return;
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
        showSuccessToast({ title: "Proへの変更を受け付けました" });
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

  const { run: openPortal } = useSingleFlight(async () => {
    const current = latestRef.current;
    const scopeId = activeScopeIdRef.current;
    if (current.billing.isComplimentary || !scopeId || !canOpenPortal(current.billing)) return;

    try {
      const result = asBillingUrlActionResult(
        await openCustomerPortalForOrganization({
          organizationId: current.organizationId,
          requestId: createBrowserUuid(),
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
    try {
      const current = latestRef.current;
      const scopeId = activeScopeIdRef.current;
      if (current.billing.isComplimentary || !scopeId) return;
      if (visiblePendingCheckout.status !== "idle") return;
      const action = resolveBillingPlanAction(current.billing, targetPlan);
      if (!action) return;

      const base = {
        intentKey: createBrowserUuid(),
        shopId: scopeId,
        organizationName: current.organizationName,
        currentPlan:
          current.billing.currentPlan ?? (current.billing.state === "trial" ? ("trial" as const) : ("free" as const)),
      };
      if (action.kind === "startPaidPlan") {
        const trialBillingStartsOn =
          current.billing.state === "trial" && current.billing.trialEndsAt
            ? formatBillingBoundaryDate(current.billing.trialEndsAt)
            : null;
        setDialog({
          ...base,
          ...action,
          source: current.billing.state === "trial" ? "trial" : "immediate",
          ...(current.billing.state === "trial"
            ? { billingStartsOn: trialBillingStartsOn ?? "トライアル終了後" }
            : { billingStartsOn: "Stripeでの支払い完了日" }),
          price: planPrices[action.targetPlan],
        });
        return;
      }
      if (action.kind === "changePaidPlanNow") {
        setDialog({ ...base, ...action, price: planPrices[action.targetPlan], preview: { status: "loading" } });
        void prepareProrationPreview({ ...base, targetPlan: action.targetPlan });
        return;
      }
      if (action.kind === "cancelTrialContinuation") {
        const effectiveOn = current.billing.trialEndsAt
          ? formatBillingBoundaryDate(current.billing.trialEndsAt)
          : current.billing.nextEvent?.date;
        setDialog({ ...base, ...action, effectiveOn });
        return;
      }
      if (action.kind === "schedulePlanChange") {
        setDialog({
          ...base,
          ...action,
          price: planPrices[action.targetPlan],
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
    } catch (error) {
      showErrorToast(error);
    }
  };

  const retryPlanPrice = (targetPlan: PaidBillingPlan) => {
    const scopeId = activeScopeIdRef.current;
    if (!scopeId || latestRef.current.billing.isComplimentary || priceRequestRef.current[targetPlan]) return;
    void loadPlanPrice(targetPlan, scopeId);
  };

  const retryPendingCheckoutInspection = () => {
    if (!resolvePendingCheckoutScope(latestRef.current)) return;
    if (stripeResult === "cancelled") {
      void stopPendingCheckout();
      return;
    }
    skipPendingCheckoutInspectionRef.current = null;
    setPendingCheckoutInspectionRevision((revision) => revision + 1);
  };
  return {
    planPrices,
    pendingCheckout: {
      purpose: visiblePendingCheckout.purpose,
      status: visiblePendingCheckout.status,
      isCancelling: isStoppingPendingCheckout,
      onContinue: () => {
        if (
          visiblePendingCheckout.status === "open" &&
          resolvePendingCheckoutScope(latestRef.current)?.key === visiblePendingCheckout.scopeKey
        ) {
          openBillingUrl(visiblePendingCheckout.url);
        }
      },
      onCancel: () => void stopPendingCheckout(),
      onRetry: retryPendingCheckoutInspection,
    },
    managePlan,
    retryPlanPrice,
    updatePaymentMethod: () => {
      if (!latestRef.current.billing.isComplimentary) void openPortal();
    },
    openBillingDocuments: () => {
      if (!latestRef.current.billing.isComplimentary) void openPortal();
    },
    dialog: {
      dialog,
      isRunning,
      onClose: () => {
        if (!isRunning) setDialog(null);
      },
      onRetryPrice: () => {
        const current = dialogRef.current;
        if (
          current?.kind === "startPaidPlan" ||
          current?.kind === "changePaidPlanNow" ||
          current?.kind === "schedulePlanChange"
        ) {
          retryPlanPrice(current.targetPlan);
        }
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
  if (billing.state === "free" || billing.state === "trial" || billing.currentPlan === null) return "standard";
  if (billing.state === "scheduledChange") {
    return billing.currentPlan === "trial" ? "standard" : billing.currentPlan;
  }
  if (billing.currentPlan === "pro") return "standard";
  return "pro";
}

function canOpenPortal(billing: OrganizationBillingView): boolean {
  return billing.stripeBillingAvailable && billing.canUpdatePaymentMethod;
}

function resolvePendingCheckoutScope(
  input: Pick<Input, "organizationId" | "billing" | "canManagePendingCheckout">,
): PendingCheckoutScope | null {
  if (
    input.canManagePendingCheckout === false ||
    input.billing.isComplimentary ||
    !input.billing.stripeBillingAvailable
  ) {
    return null;
  }
  if (input.billing.state === "pendingActivation") {
    return {
      key: `${input.organizationId}:paidCheckout:${input.billing.targetPlan ?? "unknown"}`,
      purpose: "paidCheckout",
    };
  }
  if (input.billing.state === "trial" && !input.billing.hasTrialContinuation && input.billing.hasStripeCustomer) {
    return {
      key: `${input.organizationId}:trialPaymentMethodSetup`,
      purpose: "trialPaymentMethodSetup",
    };
  }
  return null;
}

function cancelledCheckoutMessage(purpose: BillingPendingCheckoutPurpose) {
  return purpose === "trialPaymentMethodSetup"
    ? {
        title: "支払い方法の登録をやめました",
        description: "トライアルはそのまま利用できます。",
      }
    : {
        title: "支払いをキャンセルしました",
        description: "元のプランに戻しました。",
      };
}

function pendingCheckoutMessage(purpose: BillingPendingCheckoutPurpose) {
  return purpose === "trialPaymentMethodSetup"
    ? {
        title: "支払い方法の登録結果を確認中です",
        description: "Stripeの状態が確定すると、継続登録が更新されます。",
      }
    : {
        title: "支払い結果を確認中です",
        description: "Stripeの状態が確定すると、プランが更新されます。",
      };
}

function showUnavailable(reason: Parameters<typeof billingUnavailableMessage>[0]): void {
  toaster.create({ ...billingUnavailableMessage(reason), duration: 8000 });
}

function acceptedMessage(dialog: Exclude<BillingActionDialogState, { kind: "startPaidPlan" | "changePaidPlanNow" }>) {
  if (dialog.kind === "cancelTrialContinuation") return `${planLabel(dialog.targetPlan)}継続の取り消しを受け付けました`;
  if (dialog.kind === "schedulePlanChange") return `${planLabel(dialog.targetPlan)}への変更予約を受け付けました`;
  if (dialog.kind === "scheduleServiceStop") return "解約を受け付けました";
  return dialog.isServiceStop ? "解約予約の取り消しを受け付けました" : "プラン変更予約の取り消しを受け付けました";
}
