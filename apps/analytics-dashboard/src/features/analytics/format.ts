import { getDeadlineCutoff } from "@convex/_lib/dateFormat";

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
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(new Date(value));
}
export function formatDateTime(value: string | number | null | undefined) {
  if (value == null || value === "") return "記録なし";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(
    new Date(value),
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
