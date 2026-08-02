import type { DataCompleteness } from "./DataStatus";

const numberFormatter = new Intl.NumberFormat("ja-JP");
const percentFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1, style: "percent" });

export function formatCount(value: number | null | undefined, completeness: DataCompleteness = "complete") {
  if (completeness === "partial") {
    return value === null || value === undefined ? "一部集計" : `${numberFormatter.format(value)}（一部）`;
  }
  if (completeness === "unavailable") return "算出不可";
  if (completeness === "error") return "取得失敗";
  if (completeness === "pending") return "集計待ち";
  if (value !== null && value !== undefined) return numberFormatter.format(value);
  return "算出不可";
}

export function formatRate(value: number | null | undefined, completeness: DataCompleteness = "complete") {
  if (completeness === "partial") return "一部集計";
  if (completeness === "unavailable") return "算出不可";
  if (completeness === "error") return "取得失敗";
  if (completeness === "pending") return "集計待ち";
  if (value !== null && value !== undefined) return percentFormatter.format(value);
  return "算出不可";
}

export function rateFromCounts(numerator: number | null, denominator: number | null, completeness: DataCompleteness) {
  if (completeness !== "complete" || numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export function formatDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "未集計";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(date);
}

export function formatDateTime(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "未集計";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

export function formatDurationMs(value: number | null | undefined, completeness: DataCompleteness = "complete") {
  if (completeness === "partial") return "一部集計";
  if (completeness === "unavailable") return "算出不可";
  if (completeness === "error") return "取得失敗";
  if (completeness === "pending") return "集計待ち";
  if (value === null || value === undefined) return "算出不可";
  const days = value / 86_400_000;
  return days >= 1 ? `${days.toFixed(1)}日` : `${(value / 3_600_000).toFixed(1)}時間`;
}
