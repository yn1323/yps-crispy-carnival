import {
  organizationEntitlementPlanLabel,
  organizationPaidPlanLabel,
} from "@/convex/organizationBilling/planPresentation";
import type { DashboardPlanStatusSource, PaidPlanName, PlanName, PlanStatusCardData } from "./types";

const JST_TIME_ZONE = "Asia/Tokyo";
const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
export const MAX_PLAN_STATUS_TIMER_DELAY_MS = 2_147_483_647;

export function buildPlanStatusCardData(
  source: DashboardPlanStatusSource,
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
        trialEndsOnLabel: formatJstDateWithWeekday(source.trialEndsAt - 1),
        continuationPlanName,
        description: continuationPlanName
          ? `トライアル終了後は${continuationPlanName}プランへ移行します。`
          : "未選択のまま終了するとFreeプランへ移行します。Freeプランの上限を超えている場合は、上限内に減らすまで業務操作が制限されます。",
        ...(canChoosePlan ? { primaryAction: { action: "choosePlan" as const, label: "プランを選ぶ" } } : {}),
        showRemindLater: canChoosePlan,
      };
    }
    case "freePlan":
      return {
        kind: "freePlan",
        description: source.canManagePlan
          ? "無料の基本機能を利用しています。必要に応じて有料プランを選べます。"
          : "無料の基本機能を利用しています。",
        ...(source.canManagePlan ? { primaryAction: { action: "choosePlan" as const, label: "プランを選ぶ" } } : {}),
      };
    case "paidPlan": {
      const scheduledChange = source.scheduledChange;
      const targetPlanName = scheduledChange ? planName(scheduledChange.targetPlan) : undefined;
      const isServiceStopScheduled = scheduledChange?.restrictAtPeriodEnd === true;

      return {
        kind: "paidPlan",
        planName: paidPlanName(source.plan),
        badgeLabel: source.isComplimentary
          ? "支払い不要"
          : isServiceStopScheduled
            ? "解約予定"
            : scheduledChange
              ? "変更予定"
              : "利用中",
        description: source.isComplimentary
          ? "支払い不要の利用条件により、Proプラン相当の機能を期限なく無料で利用できます。"
          : isServiceStopScheduled && scheduledChange
            ? `${formatJstDate(scheduledChange.effectiveAt)}をもって解約し、Freeプランへ移行します。データは削除されません。`
            : scheduledChange && targetPlanName
              ? `${formatJstDate(scheduledChange.effectiveAt)}に${targetPlanName}プランへ変更します。`
              : undefined,
        nextEventLabel:
          !source.isComplimentary && !scheduledChange && source.currentPeriodEndsAt
            ? `次回更新日：${formatJstDate(source.currentPeriodEndsAt)}`
            : undefined,
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
      };
    }
  }
}

export function formatJstDate(timestamp: number): string {
  const parts = jstDateParts(timestamp);
  return `${parts.year}/${parts.month}/${parts.day}`;
}

export function formatJstDateWithWeekday(timestamp: number): string {
  const parts = jstDateParts(timestamp);
  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  return `${parts.month}/${parts.day}(${weekday})`;
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

function paidPlanName(plan: "standard" | "pro"): PaidPlanName {
  return organizationPaidPlanLabel(plan);
}

function planName(plan: "free" | "standard" | "pro"): PlanName {
  return organizationEntitlementPlanLabel(plan);
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
