import type {
  BillingPlanPrice,
  BillingPlanPriceState,
  BillingProductPlan,
  BillingRequiredReductions,
  OrganizationBillingView,
  PaidBillingPlan,
} from "../types";

export type BillingUnavailableReason =
  | "configuration_pending"
  | "not_allowed"
  | "price_unavailable"
  | "in_progress"
  | "request_already_used"
  | "provider_unavailable";

export const BILLING_PLAN_LIMITS: Record<BillingProductPlan, { people: number; shops: number; managers: number }> = {
  free: { people: 5, shops: 1, managers: 1 },
  pro: { people: 20, shops: 5, managers: 5 },
  business: { people: 40, shops: 5, managers: 5 },
};

export type BillingPlanAction =
  | { kind: "startPaidPlan"; targetPlan: PaidBillingPlan }
  | { kind: "changePaidPlanNow"; targetPlan: "business" }
  | { kind: "schedulePlanChange"; targetPlan: "free" | "pro" }
  | { kind: "cancelScheduledPlanChange"; targetPlan: BillingProductPlan }
  | { kind: "cancelTrialContinuation"; targetPlan: PaidBillingPlan }
  | { kind: "openPortal"; targetPlan: PaidBillingPlan };

export type BillingProrationPreview = {
  currency: string;
  amountDue: number;
  currentPeriodEnd: number;
  prorationDate: number;
};

export type BillingProrationPreviewState =
  | { status: "loading" }
  | { status: "available"; value: BillingProrationPreview }
  | { status: "unavailable"; reason: BillingUnavailableReason }
  | { status: "error" };

type BillingDialogBase = {
  intentKey: string;
  shopId: string;
  organizationName: string;
};

export type BillingActionDialogState =
  | (BillingDialogBase & {
      kind: "startPaidPlan";
      source: "trial" | "immediate";
      targetPlan: PaidBillingPlan;
      price: BillingPlanPriceState;
      billingStartsOn: string;
    })
  | (BillingDialogBase & {
      kind: "changePaidPlanNow";
      targetPlan: "business";
      preview: BillingProrationPreviewState;
    })
  | (BillingDialogBase & {
      kind: "cancelTrialContinuation";
      targetPlan: PaidBillingPlan;
      trialEndsOn?: string;
    })
  | (BillingDialogBase & {
      kind: "schedulePlanChange";
      targetPlan: "free" | "pro";
      effectiveOn?: string;
      requiredReductions: BillingRequiredReductions;
    })
  | (BillingDialogBase & {
      kind: "cancelScheduledPlanChange";
      targetPlan: BillingProductPlan;
      effectiveOn?: string;
    });

export function resolveBillingPlanAction(
  billing: OrganizationBillingView,
  targetPlan: BillingProductPlan,
): BillingPlanAction | null {
  if (billing.isComplimentary || !billing.stripeBillingAvailable || !billing.canManagePlan) return null;

  if (billing.state === "scheduledChange" || billing.state === "scheduledFree") {
    return targetPlan === billing.currentPlan && billing.targetPlan
      ? { kind: "cancelScheduledPlanChange", targetPlan: billing.targetPlan }
      : null;
  }

  switch (billing.state) {
    case "trial":
      if (billing.hasTrialContinuation) {
        return targetPlan === "free" && billing.targetPlan && billing.targetPlan !== "free"
          ? { kind: "cancelTrialContinuation", targetPlan: billing.targetPlan }
          : null;
      }
      return isPaidPlan(targetPlan) ? { kind: "startPaidPlan", targetPlan } : null;
    case "free":
      return isPaidPlan(targetPlan) ? { kind: "startPaidPlan", targetPlan } : null;
    case "pro":
      if (targetPlan === "business") return { kind: "changePaidPlanNow", targetPlan };
      return targetPlan === "free" ? { kind: "schedulePlanChange", targetPlan } : null;
    case "business":
      return targetPlan === "pro" || targetPlan === "free" ? { kind: "schedulePlanChange", targetPlan } : null;
    case "restricted":
      // 支払い開始に失敗した旧状態だけを復旧対象にする。上限超過中は整理操作に限定する。
      return !billing.limitPlan && billing.currentPlan === null && isPaidPlan(targetPlan)
        ? { kind: "startPaidPlan", targetPlan }
        : null;
    case "pendingActivation":
      return billing.currentPlan === null && isPaidPlan(targetPlan) ? { kind: "startPaidPlan", targetPlan } : null;
    case "grace":
      return billing.currentPlan === targetPlan && isPaidPlan(targetPlan) ? { kind: "openPortal", targetPlan } : null;
    case "initialPaymentPending":
    case "migrationPending":
      return null;
  }
}

export function formatPlanPrice(price: BillingPlanPrice): { amount: string; interval: string } {
  return {
    amount: formatCurrencyAmount(price.currency, price.unitAmount),
    interval: `${price.intervalCount}${intervalUnit(price.interval)}ごと`,
  };
}

// 既存importを壊さず、名称だけ汎用化する。
export const formatProPrice = formatPlanPrice;
export type ProPrice = BillingPlanPrice;
export type ProPriceState = BillingPlanPriceState;

export function formatCurrencyAmount(currencyValue: string, amountInMinorUnit: number): string {
  const currency = currencyValue.toUpperCase();
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(amountInMinorUnit / 10 ** fractionDigits);
}

export function formatBillingBoundaryDate(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}年${value("month")}月${value("day")}日`;
}

export function billingUnavailableMessage(reason: BillingUnavailableReason): {
  title: string;
  description: string;
  type: "info" | "warning";
} {
  switch (reason) {
    case "configuration_pending":
    case "price_unavailable":
      return {
        title: "決済機能は準備中です",
        description: "料金または決済設定の確認が完了してから、もう一度お試しください。",
        type: "info",
      };
    case "provider_unavailable":
      return {
        title: "決済処理を完了できませんでした",
        description: "少し時間をおいて、画面の契約状態を確認してからもう一度お試しください。",
        type: "info",
      };
    case "not_allowed":
      return {
        title: "現在はこの操作を行えません",
        description: "契約状態または操作権限が変わっている可能性があります。画面を更新してご確認ください。",
        type: "warning",
      };
    case "in_progress":
      return {
        title: "別の契約操作を確認中です",
        description: "処理結果が画面に反映されてから、もう一度お試しください。",
        type: "info",
      };
    case "request_already_used":
      return {
        title: "この操作はすでに受け付けています",
        description: "契約状態が画面に反映されるまでお待ちください。",
        type: "info",
      };
  }
}

export function planLabel(plan: BillingProductPlan | "trial"): string {
  if (plan === "trial") return "トライアル";
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Business";
}

export function getRequiredReductions(
  billing: OrganizationBillingView,
  targetPlan?: BillingProductPlan,
): BillingRequiredReductions {
  if (!targetPlan && billing.requiredReductions) return billing.requiredReductions;
  const limits = targetPlan ? BILLING_PLAN_LIMITS[targetPlan] : undefined;
  return {
    people: Math.max(0, billing.peopleUsage.current - (limits?.people ?? billing.peopleUsage.max)),
    shops: Math.max(0, billing.shopUsage.current - (limits?.shops ?? billing.shopUsage.max)),
    managers: Math.max(0, billing.managerUsage.current - (limits?.managers ?? billing.managerUsage.max)),
  };
}

function isPaidPlan(plan: BillingProductPlan): plan is PaidBillingPlan {
  return plan === "pro" || plan === "business";
}

function intervalUnit(interval: BillingPlanPrice["interval"]): string {
  if (interval === "day") return "日";
  if (interval === "week") return "週間";
  if (interval === "month") return "か月";
  return "年";
}
