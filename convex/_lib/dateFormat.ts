/**
 * Convexバックエンド用の日付フォーマットユーティリティ
 * dayjsが使えない環境向け（文字列ベース）
 */

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-01-20" → "1/20(月)" */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = DAY_NAMES[date.getDay()];
  return `${month}/${day}(${dayName})`;
}

/** "2026-01-20", "2026-01-26" → "1/20(月)〜1/26(日)" */
export function formatPeriodLabel(start: string, end: string): string {
  return `${formatDateLabel(start)}〜${formatDateLabel(end)}`;
}

/** deadline の翌日 0:00 の Unix ms を返す（締切日当日はまだ有効）
 * Convex環境はUTCで動作するため T00:00:00 = UTC midnight */
export function getDeadlineCutoff(deadline: string): number {
  const date = new Date(`${deadline}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

/** JST基準の今日の日付を "YYYY-MM-DD" で返す */
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

/** "2026-01-20", "2026-01-26" → ["2026-01-20", "2026-01-21", ...] */
export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
