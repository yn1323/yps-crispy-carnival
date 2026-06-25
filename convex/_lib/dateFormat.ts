/**
 * Convexバックエンド用の日付フォーマットユーティリティ
 * dayjsが使えない環境向け（文字列ベース）
 */

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function dateToUtcMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatUtcDate(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  return formatUtcDate(dateToUtcMs(date) + days * MS_PER_DAY);
}

export function getWeekday(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

export function getMondayWeekStart(date: string): string {
  const weekday = getWeekday(date);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, mondayOffset);
}

/** "2026-01-20" → "1/20(月)" */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateToUtcMs(dateStr));
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const dayName = DAY_NAMES[date.getUTCDay()];
  return `${month}/${day}(${dayName})`;
}

/** "2026-01-20", "2026-01-26" → "1/20(月)〜1/26(日)" */
export function formatPeriodLabel(start: string, end: string): string {
  return `${formatDateLabel(start)}〜${formatDateLabel(end)}`;
}

/** 提出締切の表示ラベル。締切日は 23:59 JST まで有効。 */
export function formatDeadlineLabel(deadline: string): string {
  return `${formatDateLabel(deadline)} 23:59`;
}

/** deadline の翌日 0:00 JST の Unix ms を返す（締切日当日はまだ有効） */
export function getDeadlineCutoff(deadline: string): number {
  return dateToUtcMs(deadline) + MS_PER_DAY - JST_OFFSET_MS;
}

/** 提出リンクの閲覧期限。シフト開始日の 0:00 JST 以降は提出リンクを閉じる。 */
export function getSubmitLinkCutoff(periodStart: string): number {
  return dateToUtcMs(periodStart) - JST_OFFSET_MS;
}

/** 提出締切日の前日 17:00 JST の Unix ms を返す。 */
export function getReminderScheduledAt(deadline: string): number {
  return getDeadlineCutoff(deadline) - 31 * 60 * 60 * 1000;
}

/** 提出締切日の翌日 17:00 JST の Unix ms を返す（マネージャーへのシフト確定催促用）。 */
export function getManagerConfirmationReminderAt(deadline: string): number {
  return getDeadlineCutoff(deadline) + 17 * 60 * 60 * 1000;
}

/** JST基準の今日の日付を "YYYY-MM-DD" で返す */
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

/** シフト終了日の翌日 0:00 JST 以降は過去シフトとして扱う。 */
export function isPastShiftPeriod(periodEnd: string, today: string = todayJST()): boolean {
  return periodEnd < today;
}

/** Unix ms（既定: 現在）が属する月を JST基準で "YYYY-MM" として返す */
export function monthJST(ms: number = Date.now()): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Unix ms → "M/D(曜) HH:mm"（JST） */
export function formatDateTimeLabel(ms: number): string {
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const dayName = DAY_NAMES[jst.getUTCDay()];
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day}(${dayName}) ${hours}:${minutes}`;
}

export function formatDateTimeJa(ms: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** "2026-01-20", "2026-01-26" → ["2026-01-20", "2026-01-21", ...] */
export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let current = dateToUtcMs(start), endMs = dateToUtcMs(end); current <= endMs; current += MS_PER_DAY) {
    dates.push(formatUtcDate(current));
  }
  return dates;
}
