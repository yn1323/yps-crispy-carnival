export const ASSIGNMENT_WARNING_SUMMARY_TITLE = "確認が必要なシフトがあります";

export const ASSIGNMENT_WARNING_TEXTS = {
  OFF_REQUEST: {
    label: "休み希望の日にシフトを設定",
    compactLabel: "休み希望",
  },
  OUTSIDE_REQUESTED_TIME: {
    label: "希望時間外のシフトを設定",
    compactLabel: "希望時間外",
  },
  NOT_SUBMITTED: {
    label: "未提出のスタッフにシフトを設定",
    compactLabel: "未提出",
  },
  OTHER: {
    label: "その他の確認事項",
    compactLabel: "その他",
  },
} as const;

export type WarningSummaryCategoryCode = keyof typeof ASSIGNMENT_WARNING_TEXTS;

export type WarningSummaryItem = {
  code: WarningSummaryCategoryCode;
  label: string;
  compactLabel: string;
  count: number;
};

const WARNING_SUMMARY_CATEGORY_CODES = [
  "OFF_REQUEST",
  "OUTSIDE_REQUESTED_TIME",
  "NOT_SUBMITTED",
] as const satisfies ReadonlyArray<Exclude<WarningSummaryCategoryCode, "OTHER">>;

export const getAssignmentWarningSettingText = (code: string): string => {
  if (code in ASSIGNMENT_WARNING_TEXTS) {
    return ASSIGNMENT_WARNING_TEXTS[code as WarningSummaryCategoryCode].label;
  }
  return ASSIGNMENT_WARNING_TEXTS.OTHER.label;
};

const toSummaryItem = (code: WarningSummaryCategoryCode, count: number): WarningSummaryItem => ({
  code,
  label: ASSIGNMENT_WARNING_TEXTS[code].label,
  compactLabel: ASSIGNMENT_WARNING_TEXTS[code].compactLabel,
  count,
});

export const summarizeAssignmentWarnings = (warnings: Array<{ code: string }>): WarningSummaryItem[] => {
  const items: WarningSummaryItem[] = WARNING_SUMMARY_CATEGORY_CODES.flatMap((code) => {
    const count = warnings.filter((warning) => warning.code === code).length;
    return count > 0 ? [toSummaryItem(code, count)] : [];
  });

  const knownCodes = new Set<string>(WARNING_SUMMARY_CATEGORY_CODES);
  const otherCount = warnings.filter((warning) => !knownCodes.has(warning.code)).length;
  if (otherCount > 0) {
    items.push(toSummaryItem("OTHER", otherCount));
  }

  return items;
};
