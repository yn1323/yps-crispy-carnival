export type WarningSummaryCategoryCode = "OFF_REQUEST" | "OUTSIDE_REQUESTED_TIME" | "NOT_SUBMITTED" | "OTHER";

export type WarningSummaryItem = {
  code: WarningSummaryCategoryCode;
  count: number;
};

const WARNING_SUMMARY_CATEGORY_CODES = [
  "OFF_REQUEST",
  "OUTSIDE_REQUESTED_TIME",
  "NOT_SUBMITTED",
] as const satisfies ReadonlyArray<Exclude<WarningSummaryCategoryCode, "OTHER">>;

export const summarizeAssignmentWarnings = (warnings: Array<{ code: string }>): WarningSummaryItem[] => {
  const items: WarningSummaryItem[] = WARNING_SUMMARY_CATEGORY_CODES.flatMap((code) => {
    const count = warnings.filter((warning) => warning.code === code).length;
    return count > 0 ? [{ code, count }] : [];
  });

  const knownCodes = new Set<string>(WARNING_SUMMARY_CATEGORY_CODES);
  const otherCount = warnings.filter((warning) => !knownCodes.has(warning.code)).length;
  if (otherCount > 0) {
    items.push({ code: "OTHER", count: otherCount });
  }

  return items;
};
