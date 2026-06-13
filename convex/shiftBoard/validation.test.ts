import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import {
  type AssignmentIssue,
  buildAssignmentIssue,
  getBoardTimeRange,
  parseShiftAssignmentValidationError,
  SHIFT_ASSIGNMENT_VALIDATION,
  validateShiftAssignments,
} from "./validation";

const TIME_PATTERN: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
  ],
};

const baseInput = {
  periodStart: "2026-01-20",
  periodEnd: "2026-01-26",
  closedDates: [] as string[],
  pattern: TIME_PATTERN,
};

const assignment = (
  overrides: Partial<AssignmentIssue & { startTime: string; endTime: string; optionId: string }>,
) => ({
  staffId: "staff1",
  date: "2026-01-20",
  startTime: "10:00",
  endTime: "18:00",
  ...overrides,
});

describe("getBoardTimeRange", () => {
  it("time提出はそのままの時間範囲を返す", () => {
    expect(getBoardTimeRange(TIME_PATTERN)).toEqual({ startTime: "09:00", endTime: "22:00" });
  });

  it("shiftType提出は全区分の最小開始〜最大終了を返す", () => {
    expect(getBoardTimeRange(SHIFT_TYPE_PATTERN)).toEqual({ startTime: "09:00", endTime: "21:00" });
  });

  it("dateOnly提出はデフォルトの時間範囲を返す", () => {
    expect(getBoardTimeRange({ kind: "dateOnly" })).toEqual({ startTime: "09:00", endTime: "22:00" });
  });
});

describe("validateShiftAssignments", () => {
  it("違反がなければ空配列を返す", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({}), assignment({ staffId: "staff2", date: "2026-01-21" })],
    });
    expect(issues).toEqual([]);
  });

  it("assignmentsが空なら空配列を返す", () => {
    expect(validateShiftAssignments({ ...baseInput, assignments: [] })).toEqual([]);
  });

  it("募集期間外の日付でOUT_OF_PERIOD", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ date: "2026-01-27" })],
    });
    expect(issues).toEqual([
      { code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: "staff1", message: "募集期間内の日付を選んでください" },
    ]);
  });

  it("期間の端の日付は許可される", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ date: "2026-01-20" }), assignment({ date: "2026-01-26" })],
    });
    expect(issues).toEqual([]);
  });

  it("定休日でCLOSED_DAY", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      closedDates: ["2026-01-21"],
      assignments: [assignment({ date: "2026-01-21" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["CLOSED_DAY"]);
  });

  it("終了時間が開始時間以前でINVALID_TIME_ORDER", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [
        assignment({ startTime: "18:00", endTime: "10:00" }),
        assignment({ startTime: "10:00", endTime: "10:00", staffId: "staff2" }),
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["INVALID_TIME_ORDER", "INVALID_TIME_ORDER"]);
  });

  it("勤務区分募集で区分未指定ならSHIFT_TYPE_REQUIRED", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "09:00", endTime: "13:00" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_REQUIRED"]);
  });

  it("存在しない勤務区分IDならSHIFT_TYPE_NOT_FOUND", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "09:00", endTime: "13:00", optionId: "unknown" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_NOT_FOUND"]);
  });

  it("勤務区分の時間と一致しなければSHIFT_TYPE_TIME_MISMATCH", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "10:00", endTime: "14:00", optionId: "morning" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_TIME_MISMATCH"]);
  });

  it("時間募集で勤務区分IDを指定するとSHIFT_TYPE_NOT_ALLOWED", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ optionId: "morning" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_NOT_ALLOWED"]);
  });

  it("ボード時間外でOUT_OF_BOARD_RANGE", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [
        assignment({ startTime: "07:00", endTime: "15:00" }),
        assignment({ staffId: "staff2", startTime: "20:00", endTime: "23:00" }),
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["OUT_OF_BOARD_RANGE", "OUT_OF_BOARD_RANGE"]);
  });

  it("ボード時間ぴったりは許可される", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ startTime: "09:00", endTime: "22:00" })],
    });
    expect(issues).toEqual([]);
  });

  it("同一スタッフ×同一日の時間重複でOVERLAP", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [
        assignment({ startTime: "10:00", endTime: "15:00" }),
        assignment({ startTime: "14:00", endTime: "18:00" }),
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["OVERLAP"]);
  });

  it("隣接する時間帯（終了=開始）は重複にならない", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [
        assignment({ startTime: "10:00", endTime: "14:00" }),
        assignment({ startTime: "14:00", endTime: "18:00" }),
      ],
    });
    expect(issues).toEqual([]);
  });

  it("複数の違反を全件収集する（最初のエラーで止まらない）", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      closedDates: ["2026-01-21"],
      assignments: [
        assignment({ date: "2026-01-27" }),
        assignment({ staffId: "staff2", date: "2026-01-21" }),
        assignment({ staffId: "staff3", startTime: "07:00", endTime: "15:00" }),
        assignment({ staffId: "staff4" }),
      ],
    });
    expect(issues).toEqual([
      buildAssignmentIssue("OUT_OF_PERIOD", "2026-01-27", "staff1"),
      buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff2"),
      buildAssignmentIssue("OUT_OF_BOARD_RANGE", "2026-01-20", "staff3"),
    ]);
  });

  it("1つのassignmentに複数の違反があってもチェック順の最初の1件のみ報告する", () => {
    // 時間順序が不正 かつ ボード時間外: INVALID_TIME_ORDERのみ
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ startTime: "23:00", endTime: "07:00" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["INVALID_TIME_ORDER"]);
  });
});

describe("parseShiftAssignmentValidationError", () => {
  it("構造化エラーからissuesを取り出す", () => {
    const issues = [buildAssignmentIssue("CLOSED_DAY", "2026-01-21", "staff1")];
    const error = { data: { code: SHIFT_ASSIGNMENT_VALIDATION, issues } };
    expect(parseShiftAssignmentValidationError(error)).toEqual(issues);
  });

  it("文字列dataのエラーはnullを返す", () => {
    expect(parseShiftAssignmentValidationError({ data: "Not found" })).toBeNull();
  });

  it("エラーオブジェクト以外はnullを返す", () => {
    expect(parseShiftAssignmentValidationError(new Error("boom"))).toBeNull();
    expect(parseShiftAssignmentValidationError(null)).toBeNull();
    expect(parseShiftAssignmentValidationError(undefined)).toBeNull();
  });

  it("不正な形のissue要素は除外する", () => {
    const valid = buildAssignmentIssue("OVERLAP", "2026-01-20", "staff1");
    const error = { data: { code: SHIFT_ASSIGNMENT_VALIDATION, issues: [valid, { code: "OVERLAP" }, "broken"] } };
    expect(parseShiftAssignmentValidationError(error)).toEqual([valid]);
  });

  it("issuesが全件不正で空になる場合はnullを返す（toastフォールバックさせる）", () => {
    const error = { data: { code: SHIFT_ASSIGNMENT_VALIDATION, issues: [{ code: "OVERLAP" }, "broken"] } };
    expect(parseShiftAssignmentValidationError(error)).toBeNull();
    expect(parseShiftAssignmentValidationError({ data: { code: SHIFT_ASSIGNMENT_VALIDATION, issues: [] } })).toBeNull();
  });
});
