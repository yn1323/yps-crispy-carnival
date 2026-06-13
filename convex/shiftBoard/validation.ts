import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";

// シフト割当バリデーションの構造化エラー。
// サーバー（mutations.ts）とフロント（確定前チェック・エラー一覧UI）で共有する純粋モジュール。
// DBアクセス・Convex APIのインポート禁止（schemas.tsと同じ共有規約）。

export const SHIFT_ASSIGNMENT_VALIDATION = "SHIFT_ASSIGNMENT_VALIDATION" as const;

export type AssignmentIssueCode =
  | "OUT_OF_PERIOD"
  | "CLOSED_DAY"
  | "INVALID_TIME_ORDER"
  | "SHIFT_TYPE_REQUIRED"
  | "SHIFT_TYPE_NOT_FOUND"
  | "SHIFT_TYPE_TIME_MISMATCH"
  | "SHIFT_TYPE_NOT_ALLOWED"
  | "OUT_OF_BOARD_RANGE"
  | "OVERLAP";

export type AssignmentIssue = {
  code: AssignmentIssueCode;
  date: string; // "YYYY-MM-DD"
  staffId: string;
  message: string;
};

export type ShiftAssignmentValidationErrorData = {
  code: typeof SHIFT_ASSIGNMENT_VALIDATION;
  issues: AssignmentIssue[];
};

const ISSUE_MESSAGES: Record<AssignmentIssueCode, string> = {
  OUT_OF_PERIOD: "募集期間内の日付を選んでください",
  CLOSED_DAY: "定休日にはシフトを登録できません",
  INVALID_TIME_ORDER: "終了時間は開始時間より後にしてください",
  SHIFT_TYPE_REQUIRED: "勤務区分を選択してください",
  SHIFT_TYPE_NOT_FOUND: "勤務区分が見つかりません",
  SHIFT_TYPE_TIME_MISMATCH: "勤務区分の時間と一致しません",
  SHIFT_TYPE_NOT_ALLOWED: "勤務区分の募集ではありません",
  OUT_OF_BOARD_RANGE: "設定したシフト時間内にしてください",
  OVERLAP: "同じスタッフの同じ日に、シフト時間が重なっています",
};

export function buildAssignmentIssue(code: AssignmentIssueCode, date: string, staffId: string): AssignmentIssue {
  return { code, date, staffId, message: ISSUE_MESSAGES[code] };
}

export function getBoardTimeRange(pattern: ShiftSubmissionPattern): { startTime: string; endTime: string } {
  if (pattern.kind === "time") return { startTime: pattern.startTime, endTime: pattern.endTime };
  if (pattern.kind === "shiftType" && pattern.options.length > 0) {
    const starts = pattern.options
      .map((option) => option.startTime)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    const ends = pattern.options.map((option) => option.endTime).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    return { startTime: starts[0], endTime: ends[ends.length - 1] };
  }
  return { startTime: "09:00", endTime: "22:00" };
}

export type ShiftAssignmentValidationInput = {
  assignments: Array<{ staffId: string; date: string; startTime: string; endTime: string; optionId?: string }>;
  periodStart: string;
  periodEnd: string;
  closedDates: string[];
  pattern: ShiftSubmissionPattern;
};

// 全assignmentを検証し、違反を全件収集して返す（最初のエラーでthrowしない）。
// 1つのassignmentに複数の違反がある場合はチェック順で最初の1件のみ報告する
// （例: 時間順序が不正なら、ボード時間外チェックの誤検知を重ねて出さない）。
export function validateShiftAssignments(input: ShiftAssignmentValidationInput): AssignmentIssue[] {
  const { startTime, endTime } = getBoardTimeRange(input.pattern);
  const boardStartMinutes = timeToMinutes(startTime);
  const boardEndMinutes = timeToMinutes(endTime);
  const closedDateSet = new Set(input.closedDates);
  const shiftTypeOptionById =
    input.pattern.kind === "shiftType"
      ? new Map(input.pattern.options.map((option) => [option.id, option]))
      : new Map<string, never>();

  const issues: AssignmentIssue[] = [];
  const rangesByStaffDate = new Map<string, Array<{ start: number; end: number }>>();

  for (const a of input.assignments) {
    const pushIssue = (code: AssignmentIssueCode) => issues.push(buildAssignmentIssue(code, a.date, a.staffId));

    if (a.date < input.periodStart || a.date > input.periodEnd) {
      pushIssue("OUT_OF_PERIOD");
      continue;
    }
    if (closedDateSet.has(a.date)) {
      pushIssue("CLOSED_DAY");
      continue;
    }

    const startMinutes = timeToMinutes(a.startTime);
    const endMinutes = timeToMinutes(a.endTime);

    if (startMinutes >= endMinutes) {
      pushIssue("INVALID_TIME_ORDER");
      continue;
    }

    if (input.pattern.kind === "shiftType") {
      if (a.optionId === undefined) {
        pushIssue("SHIFT_TYPE_REQUIRED");
        continue;
      }
      const option = shiftTypeOptionById.get(a.optionId);
      if (!option) {
        pushIssue("SHIFT_TYPE_NOT_FOUND");
        continue;
      }
      if (a.startTime !== option.startTime || a.endTime !== option.endTime) {
        pushIssue("SHIFT_TYPE_TIME_MISMATCH");
        continue;
      }
    } else if (a.optionId !== undefined) {
      pushIssue("SHIFT_TYPE_NOT_ALLOWED");
      continue;
    }

    if (startMinutes < boardStartMinutes || endMinutes > boardEndMinutes) {
      pushIssue("OUT_OF_BOARD_RANGE");
      continue;
    }

    const key = `${a.staffId}-${a.date}`;
    const ranges = rangesByStaffDate.get(key) ?? [];
    if (ranges.some((range) => startMinutes < range.end && endMinutes > range.start)) {
      pushIssue("OVERLAP");
      continue;
    }
    ranges.push({ start: startMinutes, end: endMinutes });
    rangesByStaffDate.set(key, ranges);
  }

  return issues;
}

// ConvexErrorのdataはサーバー境界を越える際にJSON文字列へシリアライズされることがある
// （convex-test等）。文字列ならパースを試み、構造化データに揃える。
function normalizeErrorData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

// ConvexErrorのdataからバリデーションissuesを取り出す（フロントのcatch用）。
// 構造化エラーでなければnullを返し、呼び出し元は従来のtoast表示にフォールバックする。
export function parseShiftAssignmentValidationError(error: unknown): AssignmentIssue[] | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const data = normalizeErrorData((error as { data: unknown }).data);
  if (typeof data !== "object" || data === null) return null;
  const { code, issues } = data as { code?: unknown; issues?: unknown };
  if (code !== SHIFT_ASSIGNMENT_VALIDATION || !Array.isArray(issues)) return null;
  return issues.filter(
    (issue): issue is AssignmentIssue =>
      typeof issue === "object" &&
      issue !== null &&
      typeof issue.code === "string" &&
      typeof issue.date === "string" &&
      typeof issue.staffId === "string" &&
      typeof issue.message === "string",
  );
}
