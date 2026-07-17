import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { createDefaultShiftTypeOptions, DEFAULT_TIME_PATTERN } from "@/src/components/shared/ShopSubmissionPatternForm";

export const SUBMISSION_PATTERN_OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "dateOnly", label: "日ごと", description: "出勤できる日だけ集めます。" },
  { kind: "time", label: "時間指定", description: "日ごとに開始・終了時間を選んでもらいます。" },
  { kind: "shiftType", label: "勤務区分", description: "早番・遅番など、決めた区分から選んでもらいます。" },
];

export const toSubmissionPattern = (
  kind: ShiftSubmissionPattern["kind"],
  current: ShiftSubmissionPattern,
): ShiftSubmissionPattern => {
  if (kind === "time") {
    return current.kind === "time" ? current : DEFAULT_TIME_PATTERN;
  }
  if (kind === "shiftType") {
    return {
      kind: "shiftType",
      options:
        current.kind === "shiftType" && current.options.length > 0 ? current.options : createDefaultShiftTypeOptions(),
    };
  }
  return { kind: "dateOnly" };
};
