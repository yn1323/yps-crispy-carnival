import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";

export const SUBMISSION_PATTERN_OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "dateOnly", label: "日付選択", description: "出勤できる日だけ集めます。" },
  { kind: "time", label: "時間指定", description: "日ごとに開始・終了時間を選んでもらいます。" },
  { kind: "shiftType", label: "パターン選択", description: "早番・遅番など、決めたパターンから選んでもらいます。" },
];
