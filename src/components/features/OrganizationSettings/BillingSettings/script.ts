import type { OrganizationBillingView } from "../types";

export type BillingUnavailableReason =
  | "billing_off"
  | "configuration_pending"
  | "not_allowed"
  | "price_unavailable"
  | "in_progress"
  | "request_already_used";

export type ProPrice = {
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
};

export type ProPriceState =
  | { status: "loading" }
  | { status: "available"; value: ProPrice }
  | { status: "unavailable"; reason: BillingUnavailableReason }
  | { status: "error" };

export type BillingPlanAction =
  | "startPro"
  | "cancelTrialContinuation"
  | "scheduleFree"
  | "cancelScheduledFree"
  | "openPortal";

type BillingDialogBase = {
  intentKey: string;
  shopId: string;
  organizationName: string;
};

export type BillingActionDialogState =
  | (BillingDialogBase & {
      kind: "startPro";
      source: "trial" | "immediate";
      price: ProPriceState;
      billingStartsOn: string;
      shopNames: string[];
    })
  | (BillingDialogBase & {
      kind: "cancelTrialContinuation";
      trialEndsOn?: string;
    })
  | (BillingDialogBase & {
      kind: "scheduleFree";
      effectiveOn?: string;
    })
  | (BillingDialogBase & {
      kind: "cancelScheduledFree";
      effectiveOn?: string;
    });

export function resolveBillingPlanAction(billing: OrganizationBillingView): BillingPlanAction | null {
  if (billing.isComplimentary || !billing.stripeBillingAvailable || !billing.canManagePlan) return null;

  switch (billing.state) {
    case "trial":
      return billing.hasTrialContinuation ? "cancelTrialContinuation" : "startPro";
    case "free":
    case "restricted":
      return "startPro";
    case "pendingActivation":
      return billing.currentPlan === null ? "startPro" : null;
    case "pro":
      return billing.canScheduleFree ? "scheduleFree" : null;
    case "scheduledFree":
      return "cancelScheduledFree";
    case "grace":
      return "openPortal";
    case "initialPaymentPending":
    case "migrationPending":
      return null;
  }
}

export function formatProPrice(price: ProPrice): { amount: string; interval: string } {
  const currency = price.currency.toUpperCase();
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;

  return {
    amount: formatter.format(price.unitAmount / 10 ** fractionDigits),
    interval: `${price.intervalCount}${intervalUnit(price.interval)}ごと`,
  };
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
    case "billing_off":
      return {
        title: "決済機能は現在停止中です",
        description: "再開までお待ちください。現在の利用状態は変わりません。",
        type: "info",
      };
    case "configuration_pending":
    case "price_unavailable":
      return {
        title: "決済機能は準備中です",
        description: "料金または決済設定の確認が完了してから、もう一度お試しください。",
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

function intervalUnit(interval: ProPrice["interval"]): string {
  if (interval === "day") return "日";
  if (interval === "week") return "週間";
  if (interval === "month") return "か月";
  return "年";
}
