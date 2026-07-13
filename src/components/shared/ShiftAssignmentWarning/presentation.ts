import type { WarningSummaryCategoryCode } from "@/src/domains/shift/assignmentWarningSummary";

export const ASSIGNMENT_WARNING_SUMMARY_TITLE = "確認が必要なシフトがあります";

export const ASSIGNMENT_WARNING_TEXTS = {
  OFF_REQUEST: "休み希望の日にシフトを設定",
  OUTSIDE_REQUESTED_TIME: "希望時間外のシフトを設定",
  NOT_SUBMITTED: "未提出のスタッフにシフトを設定",
  OTHER: "その他の確認事項",
} as const satisfies Record<WarningSummaryCategoryCode, string>;

export const getAssignmentWarningSettingText = (code: string): string => {
  if (code in ASSIGNMENT_WARNING_TEXTS) {
    return ASSIGNMENT_WARNING_TEXTS[code as WarningSummaryCategoryCode];
  }
  return ASSIGNMENT_WARNING_TEXTS.OTHER;
};
