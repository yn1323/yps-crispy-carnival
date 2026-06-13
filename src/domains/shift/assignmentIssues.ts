import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import { formatDateWithWeekday } from "./date";

export type DisplayIssue = {
  key: string;
  date: string;
  staffId: string;
  label: string;
};

const issueKey = (issue: AssignmentIssue) => `${issue.staffId}-${issue.date}-${issue.code}`;

// 同じセル（スタッフ×日付）で同じ違反が複数セグメントから報告された場合は1件に畳む
const dedupeIssues = (issues: AssignmentIssue[]): AssignmentIssue[] => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issueKey(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// エラー一覧UI用の表示行に整形する（日付昇順 → スタッフ名順）。
// 例: 「1/21(水) 鈴木太郎：定休日にはシフトを登録できません」
export const toDisplayIssues = (
  issues: AssignmentIssue[],
  staffs: Array<{ id: string; name: string }>,
): DisplayIssue[] => {
  const nameById = new Map(staffs.map((staff) => [staff.id, staff.name]));
  return dedupeIssues(issues)
    .map((issue) => ({ ...issue, staffName: nameById.get(issue.staffId) ?? "不明なスタッフ" }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.staffName.localeCompare(b.staffName, "ja") || a.code.localeCompare(b.code),
    )
    .map((issue) => ({
      key: issueKey(issue),
      date: issue.date,
      staffId: issue.staffId,
      label: `${formatDateWithWeekday(issue.date)} ${issue.staffName}：${issue.message}`,
    }));
};

// DateRailのエラーバッジ用に、日付ごとのエラー件数を数える
export const issueCountByDate = (issues: AssignmentIssue[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const issue of dedupeIssues(issues)) {
    counts.set(issue.date, (counts.get(issue.date) ?? 0) + 1);
  }
  return counts;
};
