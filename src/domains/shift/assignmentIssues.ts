import { formatDateWithWeekday } from "./date";

// エラー（AssignmentIssue）とワーニング（AssignmentWarning）を同じ表示/集計に通すための共通形。
export type IssueLike = {
  code: string;
  date: string;
  staffId: string;
  message: string;
};

export type DisplayIssue = {
  key: string;
  code: string;
  date: string;
  staffId: string;
  label: string;
};

const issueKey = (issue: IssueLike) => `${issue.staffId}-${issue.date}-${issue.code}`;

// 同じセル（スタッフ×日付）で同じ違反が複数セグメントから報告された場合は1件に畳む
const dedupeIssues = <T extends IssueLike>(issues: T[]): T[] => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issueKey(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// エラー/確認事項の一覧UI用の表示行に整形する（日付昇順 → スタッフ名順）。
// 例: 「1/21(水) 鈴木太郎：定休日にはシフトを登録できません」
export const toDisplayIssues = (issues: IssueLike[], staffs: Array<{ id: string; name: string }>): DisplayIssue[] => {
  const nameById = new Map(staffs.map((staff) => [staff.id, staff.name]));
  return dedupeIssues(issues)
    .map((issue) => ({ ...issue, staffName: nameById.get(issue.staffId) ?? "不明なスタッフ" }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.staffName.localeCompare(b.staffName, "ja") || a.code.localeCompare(b.code),
    )
    .map((issue) => ({
      key: issueKey(issue),
      code: issue.code,
      date: issue.date,
      staffId: issue.staffId,
      label: `${formatDateWithWeekday(issue.date)} ${issue.staffName}：${issue.message}`,
    }));
};

// DateRailのバッジ用に、日付ごとのエラー/確認事項の件数を数える
export const issueCountByDate = (issues: IssueLike[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const issue of dedupeIssues(issues)) {
    counts.set(issue.date, (counts.get(issue.date) ?? 0) + 1);
  }
  return counts;
};
