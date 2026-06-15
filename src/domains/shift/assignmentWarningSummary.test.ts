import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_WARNING_TEXTS,
  getAssignmentWarningSettingText,
  summarizeAssignmentWarnings,
} from "./assignmentWarningSummary";

describe("summarizeAssignmentWarnings", () => {
  it("カテゴリごとに確認事項を集計する", () => {
    expect(
      summarizeAssignmentWarnings([
        { code: "OFF_REQUEST" },
        { code: "OUTSIDE_REQUESTED_TIME" },
        { code: "OUTSIDE_REQUESTED_TIME" },
        { code: "NOT_SUBMITTED" },
      ]),
    ).toEqual([
      { code: "OFF_REQUEST", label: "休み希望の日にシフトを設定", compactLabel: "休み希望", count: 1 },
      { code: "OUTSIDE_REQUESTED_TIME", label: "希望時間外のシフトを設定", compactLabel: "希望時間外", count: 2 },
      { code: "NOT_SUBMITTED", label: "未提出のスタッフにシフトを設定", compactLabel: "未提出", count: 1 },
    ]);
  });

  it("未知の確認事項はその他に集計する", () => {
    expect(summarizeAssignmentWarnings([{ code: "UNKNOWN" }])).toEqual([
      { code: "OTHER", label: "その他の確認事項", compactLabel: "その他", count: 1 },
    ]);
  });

  it("tooltipとモーダルで使う設定文言を同じ定数から返す", () => {
    expect(getAssignmentWarningSettingText("OFF_REQUEST")).toBe(ASSIGNMENT_WARNING_TEXTS.OFF_REQUEST.label);
    expect(getAssignmentWarningSettingText("OUTSIDE_REQUESTED_TIME")).toBe(
      ASSIGNMENT_WARNING_TEXTS.OUTSIDE_REQUESTED_TIME.label,
    );
    expect(getAssignmentWarningSettingText("NOT_SUBMITTED")).toBe(ASSIGNMENT_WARNING_TEXTS.NOT_SUBMITTED.label);
  });

  it("未知の確認事項はその他の文言を返す", () => {
    expect(getAssignmentWarningSettingText("UNKNOWN")).toBe(ASSIGNMENT_WARNING_TEXTS.OTHER.label);
  });
});
