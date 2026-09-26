import { getDeadlineCutoff } from "@convex/_lib/dateFormat";
import type { AnalyticsShopAttention, OrganizationBillingSummaryDto } from "@/api/analyticsTypes";

export const METRICS = [
  { key: "registered", label: "新規登録店舗", description: "その日に新しく登録された店舗" },
  { key: "submitted", label: "提出があった店舗", description: "希望シフトの提出・再提出があった店舗" },
  { key: "confirmed", label: "確定した店舗", description: "シフトの確定・再確定があった店舗" },
] as const;

export function formatCount(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("ja-JP").format(value);
}
export function formatDate(value: string | number | null | undefined) {
  if (value == null || value === "") return "記録なし";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日付を確認してください";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(date);
}
export function formatShiftPeriod(period: { periodStart: string; periodEnd: string } | null | undefined) {
  if (!period) return "シフトなし";
  const [startYear, startMonth, startDay] = period.periodStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = period.periodEnd.split("-").map(Number);
  const end = startYear === endYear ? `${endMonth}/${endDay}` : `${endYear}/${endMonth}/${endDay}`;
  return `${startYear}/${startMonth}/${startDay}-${end}`;
}
export function formatDateTime(value: string | number | null | undefined) {
  if (value == null || value === "") return "記録なし";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時を確認してください";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(
    date,
  );
}
/** 期限日はJST翌日0:00の直前まで提出可能。分単位の表示では23:59になる。 */
export function formatDeadline(deadline: string) {
  return formatDateTime(getDeadlineCutoff(deadline) - 1);
}
export function shopPath(shopId: string) {
  return `/shops/${encodeURIComponent(shopId)}`;
}
export function staffPath(shopId: string, staffId: string) {
  return `${shopPath(shopId)}/staff/${encodeURIComponent(staffId)}`;
}
export function cyclePath(shopId: string, recruitmentId: string) {
  return `${shopPath(shopId)}/cycles/${encodeURIComponent(recruitmentId)}`;
}
export function dayShopsPath(date: string, metric: string) {
  return `/shops?${new URLSearchParams({ date, metric })}`;
}
export function lineStatusLabel(status: string) {
  return (
    (
      {
        linked_following: "連携済み・友だち",
        linked_unfollowed: "連携済み・友だち解除",
        unlinked: "未連携",
        unavailable: "確認できません",
      } as Record<string, string>
    )[status] ?? "確認できません"
  );
}
const PLAN_LABELS: Record<"free" | "standard" | "pro", string> = { free: "Free", standard: "Standard", pro: "Pro" };
export function planLabel(plan: "free" | "standard" | "pro" | null) {
  return plan ? PLAN_LABELS[plan] : "未確定";
}
/** 組織の現在の契約状態。期日はトライアル終了または変更予定の日付。 */
export function billingLabel(billing: OrganizationBillingSummaryDto | null) {
  if (!billing) return "確認できません";
  switch (billing.kind) {
    case "trial":
      return `トライアル（${formatDate(billing.dueAt)}まで${billing.targetPlan ? `・${planLabel(billing.targetPlan)}を選択済み` : ""}）`;
    case "initialPaymentPending":
      return `初回支払い待ち（${planLabel(billing.targetPlan)}）`;
    case "pendingActivation":
      return `有効化待ち（${planLabel(billing.targetPlan)}）`;
    case "active":
      return planLabel(billing.plan);
    case "complimentary":
      return `${planLabel(billing.plan)}（無償）`;
    case "scheduledChange":
      return `${planLabel(billing.plan)}（${formatDate(billing.dueAt)}から${planLabel(billing.targetPlan)}）`;
    case "paymentTerminationPending":
      return "支払い失敗・停止処理中";
  }
}
export const ATTENTION_LABELS: Record<AnalyticsShopAttention, string> = {
  shift_ended: "次の募集なし",
  inactive: "14日以上利用なし",
};
