import type {
  CurrentSubscriptionPrice,
  CurrentSubscriptionPriceState,
  DashboardPlanStatusSource,
  PaidPlanName,
  PlanName,
  PlanPriceDisplayState,
  PlanStatusCardData,
} from "./types";

const JST_TIME_ZONE = "Asia/Tokyo";
const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
export const MAX_PLAN_STATUS_TIMER_DELAY_MS = 2_147_483_647;

export function buildPlanStatusCardData(
  source: DashboardPlanStatusSource,
  price: CurrentSubscriptionPriceState = { status: "idle" },
  now = Date.now(),
): PlanStatusCardData | null {
  switch (source.kind) {
    case "trial": {
      if (!Number.isFinite(source.trialEndsAt) || now >= source.trialEndsAt) return null;
      const continuationPlanName = source.selectedPaidPlan ? paidPlanName(source.selectedPaidPlan) : undefined;
      const canChoosePlan = continuationPlanName === undefined && source.canManagePlan;

      return {
        kind: "trial",
        remainingDays: remainingJstDays(source.trialEndsAt, now),
        // trialEndsAt は最終利用日の翌日 0:00 JST という排他的境界。
        trialEndsOnLabel: formatJstDate(source.trialEndsAt - 1),
        continuationPlanName,
        description: continuationPlanName
          ? `トライアル終了後は${continuationPlanName}プランへ移行します。`
          : source.canManagePlan
            ? "継続して利用するには、プランの選択が必要です。"
            : "プランの選択は、契約を管理できる管理者が行えます。",
        primaryAction: canChoosePlan ? "choosePlan" : "openPlanAndPayment",
        primaryActionLabel: canChoosePlan ? "プランを選ぶ" : "プランと支払いを確認する",
        showRemindLater: canChoosePlan,
      };
    }
    case "freePlan":
      return {
        kind: "freePlan",
        description: source.canManagePlan
          ? "無料の基本機能を利用しています。必要に応じて有料プランを選べます。"
          : "無料の基本機能を利用しています。プランの変更は、契約を管理できる管理者が行えます。",
        primaryAction: source.canManagePlan ? "choosePlan" : "openPlanAndPayment",
        primaryActionLabel: source.canManagePlan ? "プランを選ぶ" : "プランと支払いを確認する",
      };
    case "paidPlan": {
      const scheduledChange = source.scheduledChange;
      const targetPlanName = scheduledChange ? planName(scheduledChange.targetPlan) : undefined;

      return {
        kind: "paidPlan",
        planName: paidPlanName(source.plan),
        badgeLabel: source.isComplimentary ? "支払い不要" : scheduledChange ? "変更予定" : "利用中",
        description: source.isComplimentary
          ? "Businessプランの機能を料金なしで利用できます。"
          : scheduledChange && targetPlanName
            ? `${formatJstDate(scheduledChange.effectiveAt)}に${targetPlanName}プランへ変更します。`
            : undefined,
        nextEventLabel:
          !source.isComplimentary && !scheduledChange && source.currentPeriodEndsAt
            ? `次回更新日：${formatJstDate(source.currentPeriodEndsAt)}`
            : undefined,
        price: source.isComplimentary ? null : toPlanPriceDisplayState(price),
        primaryActionLabel: source.canManagePlan ? "プランと支払いへ" : "プランと支払いを確認する",
      };
    }
    case "paymentPending": {
      const currentPlanName = source.currentPlan ? planName(source.currentPlan) : undefined;
      const targetPlanName = paidPlanName(source.targetPlan);
      return {
        kind: "paymentPending",
        currentPlanName,
        targetPlanName,
        description: currentPlanName
          ? `${targetPlanName}プランへの変更結果を確認しています。確認中は${currentPlanName}プランが適用されます。`
          : `${targetPlanName}プランの支払い結果を確認しています。確認が完了するまでお待ちください。`,
        primaryActionLabel: "プランと支払いを確認する",
      };
    }
    case "paymentIssue": {
      const canUpdatePaymentMethod = source.canUpdatePaymentMethod;
      return {
        kind: "paymentIssue",
        planName: source.plan ? paidPlanName(source.plan) : undefined,
        phase: source.phase,
        description:
          source.phase === "grace"
            ? canUpdatePaymentMethod
              ? "サービスの停止を防ぐため、お支払い方法を更新してください。"
              : "支払い方法の更新は、契約を管理できる管理者が行えます。"
            : canUpdatePaymentMethod
              ? "サービスの利用を再開するため、お支払い方法を更新してください。"
              : "契約の復旧は、支払い方法を管理できる管理者が行えます。",
        recoveryDeadlineLabel: source.recoveryDeadlineAt
          ? `支払い期限：${formatJstDate(source.recoveryDeadlineAt)}`
          : undefined,
        primaryAction: canUpdatePaymentMethod ? "updatePaymentMethod" : "viewPaymentIssueDetails",
        primaryActionLabel: canUpdatePaymentMethod ? "支払い方法を更新する" : "詳細を確認する",
        showDetailsAction: canUpdatePaymentMethod,
      };
    }
    case "restricted":
      return {
        kind: "restricted",
        planName: source.displayPlan ? planName(source.displayPlan) : undefined,
        description: source.canManagePlan
          ? "利用状況または契約状態を確認し、契約制限を解消してください。"
          : "契約を管理できる管理者に、利用状況または契約状態の確認を依頼してください。",
        primaryActionLabel: "プランと支払いを確認する",
      };
  }
}

export function toCurrentSubscriptionPriceState(result: unknown): CurrentSubscriptionPriceState {
  if (!isRecord(result)) return { status: "error" };
  if (result.status === "unavailable" && typeof result.reason === "string") {
    return { status: "unavailable", reason: result.reason };
  }
  if (
    result.status === "available" &&
    typeof result.currency === "string" &&
    typeof result.unitAmount === "number" &&
    isBillingInterval(result.interval) &&
    typeof result.intervalCount === "number" &&
    (result.taxBehavior === undefined || result.taxBehavior === "inclusive" || result.taxBehavior === "exclusive")
  ) {
    return {
      status: "available",
      value: {
        currency: result.currency,
        unitAmount: result.unitAmount,
        interval: result.interval,
        intervalCount: result.intervalCount,
        taxBehavior: result.taxBehavior,
      },
    };
  }
  return { status: "error" };
}

export function formatJstDate(timestamp: number): string {
  const parts = jstDateParts(timestamp);
  return `${parts.year}/${parts.month}/${parts.day}`;
}

export function remainingJstDays(targetTimestamp: number, nowTimestamp: number): number {
  const target = jstDateParts(targetTimestamp);
  const now = jstDateParts(nowTimestamp);
  const targetDate = Date.UTC(target.year, target.month - 1, target.day);
  const nowDate = Date.UTC(now.year, now.month - 1, now.day);
  return Math.max(0, Math.round((targetDate - nowDate) / DAY_IN_MS));
}

export function getPlanStatusNextTimeBoundary(
  source: DashboardPlanStatusSource | null | undefined,
  now: number,
): number | null {
  if (source?.kind !== "trial" || !Number.isFinite(source.trialEndsAt) || now >= source.trialEndsAt) return null;
  return Math.min(source.trialEndsAt, getNextJstDayBoundary(now));
}

export function getPlanStatusTimerDelay(boundary: number, now: number): number {
  return Math.min(Math.max(boundary - now, 0), MAX_PLAN_STATUS_TIMER_DELAY_MS);
}

export function formatCurrentSubscriptionPrice(price: CurrentSubscriptionPrice): string {
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    currencyDisplay: "name",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const amount = formatter.format(price.unitAmount / 10 ** fractionDigits);
  const interval = billingIntervalLabel(price.interval, price.intervalCount);
  const tax = price.taxBehavior === "inclusive" ? "（税込）" : price.taxBehavior === "exclusive" ? "（税抜）" : "";
  return `${interval} ${amount}${tax}`;
}

function toPlanPriceDisplayState(price: CurrentSubscriptionPriceState): PlanPriceDisplayState {
  switch (price.status) {
    case "idle":
      return { status: "idle" };
    case "loading":
      return { status: "loading" };
    case "available":
      return { status: "available", label: formatCurrentSubscriptionPrice(price.value) };
    case "error":
      return { status: "error", message: "現在の料金を取得できませんでした。" };
    case "unavailable":
      if (price.reason === "not_allowed") {
        return {
          status: "unavailable",
          message: "現在の料金を表示する権限がありません。",
          canRetry: false,
        };
      }
      return {
        status: "unavailable",
        message:
          price.reason === "configuration_pending" || price.reason === "price_unavailable"
            ? "現在の料金は準備中です。"
            : "現在の料金を取得できませんでした。",
        canRetry: true,
      };
  }
}

function paidPlanName(plan: "pro" | "business"): PaidPlanName {
  return plan === "pro" ? "Pro" : "Business";
}

function planName(plan: "free" | "pro" | "business"): PlanName {
  return plan === "free" ? "Free" : paidPlanName(plan);
}

function billingIntervalLabel(interval: CurrentSubscriptionPrice["interval"], count: number): string {
  if (count === 1) {
    switch (interval) {
      case "day":
        return "日額";
      case "week":
        return "週額";
      case "month":
        return "月額";
      case "year":
        return "年額";
    }
  }
  const unit = interval === "day" ? "日" : interval === "week" ? "週" : interval === "month" ? "か月" : "年";
  return `${count}${unit}ごと`;
}

function jstDateParts(timestamp: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: JST_TIME_ZONE,
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function getNextJstDayBoundary(timestamp: number): number {
  const current = jstDateParts(timestamp);
  return Date.UTC(current.year, current.month - 1, current.day + 1) - JST_OFFSET_MS;
}

function isBillingInterval(value: unknown): value is CurrentSubscriptionPrice["interval"] {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
