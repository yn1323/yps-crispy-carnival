import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildPlanStatusCardData,
  getPlanStatusNextTimeBoundary,
  getPlanStatusTimerDelay,
  toCurrentSubscriptionPriceState,
} from "./script";
import type {
  CurrentSubscriptionPriceState,
  DashboardPlanStatusSource,
  PlanStatusCardAction,
  PlanStatusCardProps,
} from "./types";

type Props = {
  planStatus: DashboardPlanStatusSource | null | undefined;
  shopId?: string;
  enabled: boolean;
  onOpenBillingSettings: () => void;
};

type KeyedPriceState = {
  key: string;
  value: CurrentSubscriptionPriceState;
};

type ExpansionState = {
  shopId: string | undefined;
  expanded: boolean;
  previousDefaultExpanded: boolean;
};

type UsageRequest = {
  shopId: string;
  now: number;
};

export function usePlanStatusCardController({
  planStatus,
  shopId,
  enabled,
  onOpenBillingSettings,
}: Props): PlanStatusCardProps | null | undefined {
  const getCurrentSubscriptionPrice = useAction(api.organizationStripe.actions.getCurrentSubscriptionPrice);
  const [priceState, setPriceState] = useState<KeyedPriceState | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const latestPriceContextKey = useRef<string | null>(null);
  const inFlightPriceContextKey = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const priceContextKey = getPriceContextKey(planStatus, shopId, enabled);
  const clockResetKey = getClockResetKey(planStatus, shopId);
  latestPriceContextKey.current = priceContextKey;
  const nextTimeBoundary = getPlanStatusNextTimeBoundary(planStatus, currentTime);

  useEffect(() => {
    if (!clockResetKey) return;
    setCurrentTime(Date.now());
  }, [clockResetKey]);

  useEffect(() => {
    if (nextTimeBoundary === null) return;

    const timeoutId = window.setTimeout(
      () => setCurrentTime((previous) => Math.max(Date.now(), previous + 1)),
      getPlanStatusTimerDelay(nextTimeBoundary, currentTime),
    );
    return () => window.clearTimeout(timeoutId);
  }, [currentTime, nextTimeBoundary]);

  const currentPriceState: CurrentSubscriptionPriceState =
    priceContextKey && priceState?.key === priceContextKey ? priceState.value : { status: "idle" };

  const data = useMemo(
    () => (planStatus ? buildPlanStatusCardData(planStatus, currentPriceState, currentTime) : null),
    [currentPriceState, currentTime, planStatus],
  );
  const defaultExpanded = Boolean(
    planStatus?.kind === "paymentIssue" ||
      (planStatus?.kind === "trial" &&
        planStatus.selectedPaidPlan === undefined &&
        data?.kind === "trial" &&
        data.remainingDays <= 7),
  );
  const canSubscribeToUsage = Boolean(enabled && data && shopId);
  const expansionState = useRef<ExpansionState>({
    shopId,
    expanded: defaultExpanded,
    previousDefaultExpanded: defaultExpanded,
  });
  const [usageRequest, setUsageRequest] = useState<UsageRequest | null>(() =>
    canSubscribeToUsage && defaultExpanded && shopId ? { shopId, now: Date.now() } : null,
  );
  const usageQueryArgs =
    canSubscribeToUsage && shopId && usageRequest?.shopId === shopId
      ? { shopId: shopId as Id<"shops">, now: usageRequest.now }
      : "skip";
  const usageQueryResult = useQuery(api.dashboard.queries.getDashboardPlanUsage, usageQueryArgs);
  const usage = usageQueryArgs === "skip" ? undefined : usageQueryResult;

  useEffect(() => {
    const current = expansionState.current;
    if (!canSubscribeToUsage) {
      expansionState.current = {
        shopId,
        expanded: defaultExpanded,
        previousDefaultExpanded: defaultExpanded,
      };
      setUsageRequest(null);
      return;
    }

    if (current.shopId !== shopId) {
      expansionState.current = {
        shopId,
        expanded: defaultExpanded,
        previousDefaultExpanded: defaultExpanded,
      };
      setUsageRequest(canSubscribeToUsage && defaultExpanded && shopId ? { shopId, now: Date.now() } : null);
      return;
    }

    if (!current.previousDefaultExpanded && defaultExpanded) current.expanded = true;
    current.previousDefaultExpanded = defaultExpanded;
    setUsageRequest((previous) => {
      if (!canSubscribeToUsage || !current.expanded || !shopId) return null;
      return previous?.shopId === shopId ? previous : { shopId, now: Date.now() };
    });
  }, [canSubscribeToUsage, defaultExpanded, shopId]);

  const loadCurrentPrice = useCallback(async () => {
    if (!priceContextKey || !shopId || inFlightPriceContextKey.current === priceContextKey) return;

    const requestId = ++requestSequence.current;
    inFlightPriceContextKey.current = priceContextKey;
    setPriceState({ key: priceContextKey, value: { status: "loading" } });

    try {
      const result = await getCurrentSubscriptionPrice({ shopId: shopId as Id<"shops"> });
      if (latestPriceContextKey.current !== priceContextKey || requestSequence.current !== requestId) return;
      setPriceState({ key: priceContextKey, value: toCurrentSubscriptionPriceState(result) });
    } catch {
      if (latestPriceContextKey.current !== priceContextKey || requestSequence.current !== requestId) return;
      setPriceState({ key: priceContextKey, value: { status: "error" } });
    } finally {
      if (inFlightPriceContextKey.current === priceContextKey) inFlightPriceContextKey.current = null;
    }
  }, [getCurrentSubscriptionPrice, priceContextKey, shopId]);

  const handleExpandedChange = useCallback(
    (expanded: boolean) => {
      expansionState.current = {
        ...expansionState.current,
        shopId,
        expanded,
      };
      setUsageRequest(expanded && canSubscribeToUsage && shopId ? { shopId, now: Date.now() } : null);
      if (expanded && currentPriceState.status === "idle") void loadCurrentPrice();
    },
    [canSubscribeToUsage, currentPriceState.status, loadCurrentPrice, shopId],
  );

  useEffect(() => {
    const current = expansionState.current;
    if (priceContextKey && current.shopId === shopId && current.expanded && currentPriceState.status === "idle") {
      void loadCurrentPrice();
    }
  }, [currentPriceState.status, loadCurrentPrice, priceContextKey, shopId]);

  const handleAction = useCallback(
    (action: PlanStatusCardAction) => {
      if (action === "retryCurrentPrice") {
        void loadCurrentPrice();
        return;
      }
      if (action !== "remindLater") onOpenBillingSettings();
    },
    [loadCurrentPrice, onOpenBillingSettings],
  );

  if (!enabled || planStatus === null) return null;
  if (planStatus === undefined) return undefined;
  if (!data) return null;

  return {
    data,
    usage,
    defaultExpanded,
    onAction: handleAction,
    onExpandedChange: handleExpandedChange,
  };
}

function getPriceContextKey(
  planStatus: DashboardPlanStatusSource | null | undefined,
  shopId: string | undefined,
  enabled: boolean,
): string | null {
  if (!enabled || !shopId || planStatus?.kind !== "paidPlan" || planStatus.isComplimentary) return null;
  const scheduledChange = planStatus.scheduledChange
    ? `${planStatus.scheduledChange.targetPlan}:${planStatus.scheduledChange.effectiveAt}`
    : "none";
  return `${shopId}:${planStatus.plan}:${planStatus.currentPeriodEndsAt ?? "none"}:${scheduledChange}`;
}

function getClockResetKey(
  planStatus: DashboardPlanStatusSource | null | undefined,
  shopId: string | undefined,
): string {
  if (!shopId || !planStatus) return "";
  return `${shopId}:${planStatus.kind}:${planStatus.kind === "trial" ? planStatus.trialEndsAt : "timeless"}`;
}
