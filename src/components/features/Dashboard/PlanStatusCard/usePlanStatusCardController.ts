import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPlanStatusCardData, getPlanStatusNextTimeBoundary, getPlanStatusTimerDelay } from "./script";
import type { DashboardPlanStatusSource, PlanStatusCardAction, PlanStatusCardProps } from "./types";

type Props = {
  planStatus: DashboardPlanStatusSource | null | undefined;
  shopId?: string;
  expectedOrganizationId?: Id<"organizations">;
  onOpenBillingSettings: () => void;
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
  expectedOrganizationId,
  onOpenBillingSettings,
}: Props): PlanStatusCardProps | null | undefined {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const clockResetKey = getClockResetKey(planStatus, shopId);
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

  const data = useMemo(
    () => (planStatus ? buildPlanStatusCardData(planStatus, currentTime) : null),
    [currentTime, planStatus],
  );
  const defaultExpanded = Boolean(
    planStatus?.kind === "paymentIssue" ||
      planStatus?.kind === "restricted" ||
      (planStatus?.kind === "trial" &&
        planStatus.selectedPaidPlan === undefined &&
        data?.kind === "trial" &&
        data.remainingDays <= 7),
  );
  const canSubscribeToUsage = Boolean(data && shopId);
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
      ? {
          shopId: shopId as Id<"shops">,
          ...(expectedOrganizationId ? { expectedOrganizationId } : {}),
          now: usageRequest.now,
        }
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

  const handleExpandedChange = useCallback(
    (expanded: boolean) => {
      expansionState.current = {
        ...expansionState.current,
        shopId,
        expanded,
      };
      setUsageRequest(expanded && canSubscribeToUsage && shopId ? { shopId, now: Date.now() } : null);
    },
    [canSubscribeToUsage, shopId],
  );

  const handleAction = useCallback(
    (action: PlanStatusCardAction) => {
      if (action !== "remindLater") onOpenBillingSettings();
    },
    [onOpenBillingSettings],
  );

  if (planStatus === null) return null;
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

function getClockResetKey(
  planStatus: DashboardPlanStatusSource | null | undefined,
  shopId: string | undefined,
): string {
  if (!shopId || !planStatus) return "";
  return `${shopId}:${planStatus.kind}:${planStatus.kind === "trial" ? planStatus.trialEndsAt : "timeless"}`;
}
