import { describe, expect, it } from "vitest";
import { buildAssignmentIssue } from "@/convex/shiftBoard/validation";
import { issueCountByDate, toDisplayIssues } from "./assignmentIssues";

const staffs = [
  { id: "staff1", name: "鈴木太郎" },
  { id: "staff2", name: "佐藤花子" },
];

describe("toDisplayIssues", () => {
  it("日付＋曜日とスタッフ名つきのラベルに整形する", () => {
    const issues = [buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff1")];
    expect(toDisplayIssues(issues, staffs)).toEqual([
      {
        key: "staff1-2026-01-21-CLOSED_DAY",
        date: "2026-01-21",
        staffId: "staff1",
        label: "1/21(水) 鈴木太郎：定休日にはシフトを登録できません",
      },
    ]);
  });

  it("日付昇順 → スタッフ名順にソートする", () => {
    const issues = [
      buildAssignmentIssue("OVERLAP", "2026-01-22", "staff1"),
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff1"),
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff2"),
    ];
    const labels = toDisplayIssues(issues, staffs).map((issue) => issue.label);
    expect(labels).toEqual([
      "1/21(水) 佐藤花子：定休日にはシフトを登録できません",
      "1/21(水) 鈴木太郎：定休日にはシフトを登録できません",
      "1/22(木) 鈴木太郎：同じスタッフの同じ日に、シフト時間が重なっています",
    ]);
  });

  it("同じセル×同じ違反コードは1件に畳む", () => {
    const issues = [
      buildAssignmentIssue("OUT_OF_BOARD_RANGE", "2026-01-20", "staff1"),
      buildAssignmentIssue("OUT_OF_BOARD_RANGE", "2026-01-20", "staff1"),
    ];
    expect(toDisplayIssues(issues, staffs)).toHaveLength(1);
  });

  it("スタッフが見つからない場合は「不明なスタッフ」と表示する", () => {
    const issues = [buildAssignmentIssue("OVERLAP", "2026-01-20", "ghost")];
    expect(toDisplayIssues(issues, staffs)[0].label).toContain("不明なスタッフ");
  });

  it("空配列は空配列を返す", () => {
    expect(toDisplayIssues([], staffs)).toEqual([]);
  });
});

describe("issueCountByDate", () => {
  it("日付ごとのエラー件数を数える（重複は畳む）", () => {
    const issues = [
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff1"),
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff1"),
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff2"),
      buildAssignmentIssue("OVERLAP", "2026-01-22", "staff1"),
    ];
    const counts = issueCountByDate(issues);
    expect(counts.get("2026-01-21")).toBe(2);
    expect(counts.get("2026-01-22")).toBe(1);
    expect(counts.get("2026-01-20")).toBeUndefined();
  });
});
