import { describe, expect, it } from "vitest";
import { summarizeAssignmentWarnings } from "./assignmentWarningSummary";

describe("summarizeAssignmentWarnings", () => {
  it("カテゴリごとに確認事項を集計する", () => {
    const summary = summarizeAssignmentWarnings([
      { code: "OFF_REQUEST" },
      { code: "OUTSIDE_REQUESTED_TIME" },
      { code: "OUTSIDE_REQUESTED_TIME" },
      { code: "NOT_SUBMITTED" },
    ]);

    expect(summary.map(({ code, count }) => ({ code, count }))).toEqual([
      { code: "OFF_REQUEST", count: 1 },
      { code: "OUTSIDE_REQUESTED_TIME", count: 2 },
      { code: "NOT_SUBMITTED", count: 1 },
    ]);
  });

  it("担当外のポジションは、その他へ混ぜずに1つのカテゴリとして数え、未提出の後に並べる", () => {
    const summary = summarizeAssignmentWarnings([
      { code: "POSITION_UNAVAILABLE" },
      { code: "UNKNOWN" },
      { code: "NOT_SUBMITTED" },
      { code: "POSITION_UNAVAILABLE" },
    ]);

    expect(summary).toEqual([
      { code: "NOT_SUBMITTED", count: 1 },
      { code: "POSITION_UNAVAILABLE", count: 2 },
      { code: "OTHER", count: 1 },
    ]);
  });

  it("未知の確認事項はその他に集計する", () => {
    expect(summarizeAssignmentWarnings([{ code: "UNKNOWN" }]).map(({ code, count }) => ({ code, count }))).toEqual([
      { code: "OTHER", count: 1 },
    ]);
  });
});
