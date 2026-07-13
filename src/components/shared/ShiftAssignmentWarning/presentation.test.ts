import { describe, expect, it } from "vitest";
import { ASSIGNMENT_WARNING_TEXTS, getAssignmentWarningSettingText } from "./presentation";

describe("getAssignmentWarningSettingText", () => {
  it("確認事項コードを設定文言へ変換する", () => {
    expect(getAssignmentWarningSettingText("OFF_REQUEST")).toBe(ASSIGNMENT_WARNING_TEXTS.OFF_REQUEST);
    expect(getAssignmentWarningSettingText("OUTSIDE_REQUESTED_TIME")).toBe(
      ASSIGNMENT_WARNING_TEXTS.OUTSIDE_REQUESTED_TIME,
    );
    expect(getAssignmentWarningSettingText("NOT_SUBMITTED")).toBe(ASSIGNMENT_WARNING_TEXTS.NOT_SUBMITTED);
  });

  it("未知の確認事項はその他の文言へ変換する", () => {
    expect(getAssignmentWarningSettingText("UNKNOWN")).toBe(ASSIGNMENT_WARNING_TEXTS.OTHER);
  });
});
