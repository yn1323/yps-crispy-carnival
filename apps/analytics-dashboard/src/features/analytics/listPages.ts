import type { AnalyticsApiEnvelope, AnalyticsPageInfoDto } from "@/api/analyticsTypes";

/**
 * APIは1回で全件を一定数まで確認し、最大20行を返す。
 * 並べ替えを全件へ適用するため、続きを最後まで自動で読む。
 */
export const LIST_PAGE_SIZE = 20;
/** 想定を超える件数で読み続けないための上限。上限に達した場合は「続きを見る」から再開する。 */
const AUTO_CONTINUE_REQUESTS = 100;

export async function fetchListPages<Data extends { rows: unknown[]; pageInfo: AnalyticsPageInfoDto }>(
  cursor: string | null,
  fetchPage: (cursor: string | null) => Promise<AnalyticsApiEnvelope<Data>>,
) {
  let next = cursor;
  const rows: Data["rows"][number][] = [];
  for (let request = 0; ; request += 1) {
    const page = await fetchPage(next);
    rows.push(...page.data.rows);
    const continueCursor = page.data.pageInfo.continueCursor;
    const done = page.data.pageInfo.isDone || continueCursor === null || continueCursor === next;
    next = continueCursor;
    if (done || request + 1 >= AUTO_CONTINUE_REQUESTS)
      return { env: page.env, data: page.data, rows, nextCursor: done ? null : next };
  }
}

/** 値のない行を末尾へ寄せ、数値は大小、文字列は日本語の自然順で比べる。 */
export function compareSortValues(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null && b != null) return 1;
  if (a != null && b == null) return -1;
  if (a == null || b == null) return 0;
  return typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "ja", { numeric: true });
}
