import { describe, expect, it } from "vitest";
import { type IssueLike, issueCountByDate, toDisplayIssues } from "./assignmentIssues";

const staffs = [
  { id: "staff1", name: "鈴木太郎" },
  { id: "staff2", name: "佐藤花子" },
];

const issue = (code: string, date: string, staffId: string, message = code): IssueLike => ({
  code,
  date,
  staffId,
  message,
});

describe("toDisplayIssues", () => {
  it("日付＋曜日とスタッフ名つきのラベルに整形する", () => {
    const issues = [issue("CLOSED_DAY", "2026-01-21", "staff1", "validation-message")];
    expect(toDisplayIssues(issues, staffs)).toEqual([
      {
        key: "staff1-2026-01-21-CLOSED_DAY",
        code: "CLOSED_DAY",
        date: "2026-01-21",
        staffId: "staff1",
        label: "1/21(水) 鈴木太郎：validation-message",
      },
    ]);
  });

  it("日付昇順 → スタッフ名順にソートする", () => {
    const issues = [
      issue("OVERLAP", "2026-01-22", "staff1"),
      issue("CLOSED_DAY", "2026-01-21", "staff1"),
      issue("CLOSED_DAY", "2026-01-21", "staff2"),
    ];
    const orderedIssueKeys = toDisplayIssues(issues, staffs).map(({ date, staffId, code }) => ({
      date,
      staffId,
      code,
    }));
    expect(orderedIssueKeys).toEqual([
      { date: "2026-01-21", staffId: "staff2", code: "CLOSED_DAY" },
      { date: "2026-01-21", staffId: "staff1", code: "CLOSED_DAY" },
      { date: "2026-01-22", staffId: "staff1", code: "OVERLAP" },
    ]);
  });

  it("同じセル×同じ違反コードは1件に畳む", () => {
    const issues = [
      issue("OUT_OF_BOARD_RANGE", "2026-01-20", "staff1"),
      issue("OUT_OF_BOARD_RANGE", "2026-01-20", "staff1"),
    ];
    expect(toDisplayIssues(issues, staffs)).toHaveLength(1);
  });

  it("スタッフが見つからない場合は「不明なスタッフ」と表示する", () => {
    const issues = [issue("OVERLAP", "2026-01-20", "ghost")];
    expect(toDisplayIssues(issues, staffs)[0].label).toContain("不明なスタッフ");
  });

  it("空配列は空配列を返す", () => {
    expect(toDisplayIssues([], staffs)).toEqual([]);
  });
});

describe("issueCountByDate", () => {
  it("日付ごとのエラー件数を数える（重複は畳む）", () => {
    const issues = [
      issue("CLOSED_DAY", "2026-01-21", "staff1"),
      issue("CLOSED_DAY", "2026-01-21", "staff1"),
      issue("CLOSED_DAY", "2026-01-21", "staff2"),
      issue("OVERLAP", "2026-01-22", "staff1"),
    ];
    const counts = issueCountByDate(issues);
    expect(counts.get("2026-01-21")).toBe(2);
    expect(counts.get("2026-01-22")).toBe(1);
    expect(counts.get("2026-01-20")).toBeUndefined();
  });
});
