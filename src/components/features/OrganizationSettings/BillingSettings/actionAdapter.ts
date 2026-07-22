import type { BillingPlanPriceState } from "../types";
import type { BillingProrationPreviewState, BillingUnavailableReason } from "./script";

type UnavailableResult = { status: "unavailable"; reason: BillingUnavailableReason };

export type BillingUrlActionResult = UnavailableResult | { status: "available"; url: string };
export type BillingAcceptedActionResult = UnavailableResult | { status: "accepted" };

export function toPlanPriceState(result: unknown): BillingPlanPriceState {
  if (!isRecord(result)) return { status: "error" };
  if (result.status === "unavailable" && typeof result.reason === "string") {
    return { status: "unavailable", reason: result.reason };
  }
  if (
    result.status === "available" &&
    typeof result.currency === "string" &&
    typeof result.unitAmount === "number" &&
    isBillingInterval(result.interval) &&
    typeof result.intervalCount === "number"
  ) {
    return {
      status: "available",
      value: {
        currency: result.currency,
        unitAmount: result.unitAmount,
        interval: result.interval,
        intervalCount: result.intervalCount,
      },
    };
  }
  return { status: "error" };
}

export function toProrationPreviewState(result: unknown): BillingProrationPreviewState {
  if (!isRecord(result)) return { status: "error" };
  if (result.status === "unavailable" && isUnavailableReason(result.reason)) {
    return { status: "unavailable", reason: result.reason };
  }
  if (
    result.status === "available" &&
    typeof result.currency === "string" &&
    typeof result.amountDue === "number" &&
    typeof result.currentPeriodEnd === "number" &&
    typeof result.prorationDate === "number"
  ) {
    return {
      status: "available",
      value: {
        currency: result.currency,
        amountDue: result.amountDue,
        currentPeriodEnd: result.currentPeriodEnd,
        prorationDate: result.prorationDate,
      },
    };
  }
  return { status: "error" };
}

export function asBillingUrlActionResult(result: unknown): BillingUrlActionResult | null {
  if (!isRecord(result)) return null;
  if (result.status === "unavailable" && isUnavailableReason(result.reason)) {
    return { status: "unavailable", reason: result.reason };
  }
  // 既存Portalはredirect、新しいCheckoutはavailableを返す。画面側では同じURL遷移として扱う。
  if ((result.status === "available" || result.status === "redirect") && typeof result.url === "string") {
    return { status: "available", url: result.url };
  }
  return null;
}

export function asBillingAcceptedActionResult(result: unknown): BillingAcceptedActionResult | null {
  if (!isRecord(result)) return null;
  if (result.status === "unavailable" && isUnavailableReason(result.reason)) {
    return { status: "unavailable", reason: result.reason };
  }
  if (result.status === "accepted") return { status: "accepted" };
  return null;
}

function isBillingInterval(value: unknown): value is "day" | "week" | "month" | "year" {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function isUnavailableReason(value: unknown): value is BillingUnavailableReason {
  return (
    value === "configuration_pending" ||
    value === "not_allowed" ||
    value === "price_unavailable" ||
    value === "in_progress" ||
    value === "request_already_used" ||
    value === "provider_unavailable"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
