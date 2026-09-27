import type { AnalyticsApiEnvelope, AnalyticsPageInfoDto } from "@/api/analyticsTypes";

/** APIは1回で全件を一定数まで確認し、最大20行を返す。条件に合う行が少ないときは、続きを数回まで自動で読む。 */
export const LIST_PAGE_SIZE = 20;
const AUTO_CONTINUE_REQUESTS = 10;

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
    if (done || rows.length >= LIST_PAGE_SIZE || request + 1 >= AUTO_CONTINUE_REQUESTS)
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
