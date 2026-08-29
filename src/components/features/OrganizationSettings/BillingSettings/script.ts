import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { organizationPlanLabel } from "@/convex/organizationBilling/planPresentation";
import { formatPricePresentationLine } from "@/src/domains/organizationBilling/pricePresentation";
import type {
  BillingPlan,
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

export type BillingPlanAction =
  | { kind: "startPaidPlan"; targetPlan: PaidBillingPlan }
  | { kind: "changePaidPlanNow"; targetPlan: "pro" }
  | { kind: "schedulePlanChange"; targetPlan: "standard" }
  | { kind: "scheduleServiceStop"; targetPlan: "free" }
  | { kind: "cancelScheduledPlanChange"; targetPlan: BillingProductPlan; isServiceStop?: true }
  | { kind: "cancelTrialContinuation"; targetPlan: PaidBillingPlan };

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
  currentPlan: BillingPlan;
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
      targetPlan: "pro";
      price: BillingPlanPriceState;
      preview: BillingProrationPreviewState;
    })
  | (BillingDialogBase & {
      kind: "cancelTrialContinuation";
      targetPlan: PaidBillingPlan;
      effectiveOn?: string;
    })
  | (BillingDialogBase & {
      kind: "schedulePlanChange";
      targetPlan: "standard";
      price: BillingPlanPriceState;
      effectiveOn?: string;
      requiredReductions: BillingRequiredReductions;
    })
  | (BillingDialogBase & {
      kind: "scheduleServiceStop";
      targetPlan: "free";
      effectiveOn?: string;
    })
  | (BillingDialogBase & {
      kind: "cancelScheduledPlanChange";
      targetPlan: BillingProductPlan;
      effectiveOn?: string;
      isServiceStop?: true;
    });

export function resolveBillingPlanAction(
  billing: OrganizationBillingView,
  targetPlan: BillingProductPlan,
): BillingPlanAction | null {
  if (billing.isComplimentary || !billing.stripeBillingAvailable || !billing.canManagePlan) return null;

  if (billing.state === "scheduledChange") {
    return targetPlan === billing.currentPlan && billing.targetPlan
      ? {
          kind: "cancelScheduledPlanChange",
          targetPlan: billing.targetPlan,
          ...(billing.restrictAtPeriodEnd === true ? { isServiceStop: true as const } : {}),
        }
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
    case "standard":
      if (targetPlan === "pro") return { kind: "changePaidPlanNow", targetPlan };
      return targetPlan === "free" ? { kind: "scheduleServiceStop", targetPlan } : null;
    case "pro":
      if (targetPlan === "standard") return { kind: "schedulePlanChange", targetPlan };
      return targetPlan === "free" ? { kind: "scheduleServiceStop", targetPlan } : null;
    case "pendingActivation":
      return billing.currentPlan === null && isPaidPlan(targetPlan) ? { kind: "startPaidPlan", targetPlan } : null;
    case "initialPaymentPending":
    case "migrationPending":
      return null;
  }
}

export function formatPlanPriceLine(price: BillingPlanPrice): string {
  return formatPricePresentationLine(price);
}

export { formatCurrencyAmount } from "@/src/domains/organizationBilling/pricePresentation";

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
        description: "少し時間をおき、画面の契約状態を確認してから、もう一度お試しください。",
        type: "info",
      };
    case "not_allowed":
      return {
        title: "現在はこの操作を行えません",
        description: "契約状態または操作権限が変わっている可能性があります。\n画面を更新して確認してください。",
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

export const planLabel = organizationPlanLabel;

export function getRequiredReductions(
  billing: OrganizationBillingView,
  targetPlan?: BillingProductPlan,
): BillingRequiredReductions {
  if (!targetPlan && billing.requiredReductions) return billing.requiredReductions;
  const limits = targetPlan ? ORGANIZATION_PLAN_LIMITS[targetPlan] : undefined;
  return {
    people: Math.max(0, billing.peopleUsage.current - (limits?.maxPeople ?? billing.peopleUsage.max)),
    shops: Math.max(0, billing.shopUsage.current - (limits?.maxShops ?? billing.shopUsage.max)),
    managers: Math.max(0, billing.managerUsage.current - (limits?.maxActiveManagers ?? billing.managerUsage.max)),
  };
}

function isPaidPlan(plan: BillingProductPlan): plan is PaidBillingPlan {
  return plan === "standard" || plan === "pro";
}
