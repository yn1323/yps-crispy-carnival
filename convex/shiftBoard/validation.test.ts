import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import {
  type AssignmentIssue,
  buildAssignmentIssue,
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

  it("不正な日付形式はINVALID_DATE_FORMAT", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [assignment({ date: "2026-02-31" })],
    });
    expect(issues).toEqual([buildAssignmentIssue("INVALID_DATE_FORMAT", "2026-02-31", "staff1")]);
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

  it("不正な時刻形式はINVALID_TIME_FORMAT", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      assignments: [
        assignment({ startTime: "bad", endTime: "18:00" }),
        assignment({ staffId: "staff2", startTime: "09:00", endTime: "36:30" }),
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["INVALID_TIME_FORMAT", "INVALID_TIME_FORMAT"]);
  });

  it("パターン選択の募集でパターン未指定ならSHIFT_TYPE_REQUIRED", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "09:00", endTime: "13:00" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_REQUIRED"]);
  });

  it("存在しない勤務パターンIDならSHIFT_TYPE_NOT_FOUND", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "09:00", endTime: "13:00", optionId: "unknown" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_NOT_FOUND"]);
  });

  it("勤務パターンの時間と一致しなければSHIFT_TYPE_TIME_MISMATCH", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [assignment({ startTime: "10:00", endTime: "14:00", optionId: "morning" })],
    });
    expect(issues.map((i) => i.code)).toEqual(["SHIFT_TYPE_TIME_MISMATCH"]);
  });

  it("時間指定の募集で勤務パターンIDを指定するとSHIFT_TYPE_NOT_ALLOWED", () => {
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

  it("パターン選択の募集では別パターン同士の時間重複を許可する", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 0 },
          { id: "middle", name: "中番", startTime: "13:00", endTime: "18:00", sortOrder: 1 },
        ],
      },
      assignments: [
        assignment({ startTime: "10:00", endTime: "15:00", optionId: "early" }),
        assignment({ startTime: "13:00", endTime: "18:00", optionId: "middle" }),
      ],
    });
    expect(issues).toEqual([]);
  });

  it("パターン選択の募集でも同じパターンの二重登録はOVERLAP", () => {
    const issues = validateShiftAssignments({
      ...baseInput,
      pattern: SHIFT_TYPE_PATTERN,
      assignments: [
        assignment({ startTime: "09:00", endTime: "13:00", optionId: "morning" }),
        assignment({ startTime: "09:00", endTime: "13:00", optionId: "morning" }),
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

describe("validateShiftAssignments（休憩）", () => {
  type BreakInput = { startTime: string; endTime: string };
  const DATE_ONLY_PATTERN: ShiftSubmissionPattern = { kind: "dateOnly" };
  const rest = (startTime: string, endTime: string): BreakInput => ({ startTime, endTime });
  /** 10:00-18:00の勤務へ休憩を付けた、時間指定の割当。 */
  const withBreaks = (breaks: BreakInput[]) => ({ ...assignment({}), breaks });
  const codesOf = (input: Parameters<typeof validateShiftAssignments>[0]) =>
    validateShiftAssignments(input).map(({ code, date, staffId }) => ({ code, date, staffId }));
  const issueOf = (code: AssignmentIssue["code"]) => [{ code, date: "2026-01-20", staffId: "staff1" }];

  it("勤務の内側で重ならない休憩は、上限の3件まで違反にしない", () => {
    expect(
      validateShiftAssignments({
        ...baseInput,
        assignments: [
          withBreaks([rest("14:00", "15:00")]),
          { ...assignment({ staffId: "staff2" }), breaks: [] },
          {
            ...assignment({ staffId: "staff3" }),
            // 勤務の開始・終了に接する休憩と、隣り合う休憩は許可する。
            breaks: [rest("10:00", "10:30"), rest("10:30", "11:00"), rest("17:30", "18:00")],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("休憩が4件あるとBREAK_LIMIT", () => {
    expect(
      validateShiftAssignments({
        ...baseInput,
        assignments: [
          withBreaks([rest("11:00", "11:30"), rest("12:00", "12:30"), rest("13:00", "13:30"), rest("14:00", "14:30")]),
        ],
      }),
    ).toEqual([
      {
        code: "BREAK_LIMIT",
        date: "2026-01-20",
        staffId: "staff1",
        message: "休憩は1つの勤務に3件まで入れられます",
      },
    ]);
  });

  it.each([
    { name: "開始と終了が同じ", breaks: [rest("14:00", "14:00")] },
    { name: "開始が終了より後", breaks: [rest("15:00", "14:00")] },
    { name: "時刻の形式が不正", breaks: [rest("14時", "15時")] },
  ])("休憩の$name とBREAK_INVALID_TIME", ({ breaks }) => {
    expect(codesOf({ ...baseInput, assignments: [withBreaks(breaks)] })).toEqual(issueOf("BREAK_INVALID_TIME"));
  });

  it.each([
    { name: "勤務の開始より前に始まる", breaks: [rest("09:30", "10:30")] },
    { name: "勤務の終了より後に終わる", breaks: [rest("17:30", "18:30")] },
    { name: "勤務の時間帯と重ならない", breaks: [rest("19:00", "20:00")] },
    { name: "勤務全体と同じ", breaks: [rest("10:00", "18:00")] },
  ])("時間指定で休憩が$name とBREAK_OUT_OF_SHIFT", ({ breaks }) => {
    expect(codesOf({ ...baseInput, assignments: [withBreaks(breaks)] })).toEqual(issueOf("BREAK_OUT_OF_SHIFT"));
  });

  it.each([
    { name: "勤務パターンの終了より後に終わる", breaks: [rest("12:30", "13:30")] },
    { name: "勤務パターンの開始より前に始まる", breaks: [rest("08:30", "09:30")] },
    { name: "勤務パターン全体と同じ", breaks: [rest("09:00", "13:00")] },
  ])("パターン選択で休憩が$name とBREAK_OUT_OF_SHIFT", ({ breaks }) => {
    expect(
      codesOf({
        ...baseInput,
        pattern: SHIFT_TYPE_PATTERN,
        assignments: [{ ...assignment({ startTime: "09:00", endTime: "13:00", optionId: "morning" }), breaks }],
      }),
    ).toEqual(issueOf("BREAK_OUT_OF_SHIFT"));
  });

  it("パターン選択でも、勤務パターンの内側の休憩は違反にしない", () => {
    expect(
      validateShiftAssignments({
        ...baseInput,
        pattern: SHIFT_TYPE_PATTERN,
        assignments: [
          {
            ...assignment({ startTime: "09:00", endTime: "13:00", optionId: "morning" }),
            breaks: [rest("11:00", "11:30")],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("休憩どうしが重なるとBREAK_OVERLAP", () => {
    expect(
      validateShiftAssignments({
        ...baseInput,
        assignments: [withBreaks([rest("12:00", "13:00"), rest("12:30", "13:30")])],
      }),
    ).toEqual([
      { code: "BREAK_OVERLAP", date: "2026-01-20", staffId: "staff1", message: "休憩の時間帯が重なっています" },
    ]);
  });

  it("1つの勤務に休憩の違反が複数あっても、最初の1件だけを報告する", () => {
    expect(
      codesOf({
        ...baseInput,
        assignments: [withBreaks([rest("15:00", "14:00"), rest("09:00", "09:30")])],
      }),
    ).toEqual(issueOf("BREAK_INVALID_TIME"));
  });

  it("勤務そのものに違反がある場合は、休憩の違反を重ねて報告しない", () => {
    expect(
      codesOf({
        ...baseInput,
        assignments: [{ ...assignment({ date: "2026-01-27" }), breaks: [rest("15:00", "14:00")] }],
      }),
    ).toEqual([{ code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: "staff1" }]);
  });

  it("日付選択では、勤務の時刻の外にある休憩も許可する", () => {
    expect(
      validateShiftAssignments({
        ...baseInput,
        pattern: DATE_ONLY_PATTERN,
        assignments: [
          { ...assignment({ startTime: "10:00", endTime: "12:00" }), breaks: [rest("14:00", "15:00")] },
          {
            ...assignment({ staffId: "staff2", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("12:00", "13:00")],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("日付選択でも、件数・時刻の順序・重なりの違反は報告する", () => {
    expect(
      codesOf({
        ...baseInput,
        pattern: DATE_ONLY_PATTERN,
        assignments: [
          {
            ...assignment({ staffId: "staff1", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("10:00", "10:30"), rest("11:00", "11:30"), rest("12:00", "12:30"), rest("13:00", "13:30")],
          },
          {
            ...assignment({ staffId: "staff2", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("13:00", "12:00")],
          },
          {
            ...assignment({ staffId: "staff3", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("12:00", "13:00"), rest("12:30", "13:30")],
          },
        ],
      }),
    ).toEqual([
      { code: "BREAK_LIMIT", date: "2026-01-20", staffId: "staff1" },
      { code: "BREAK_INVALID_TIME", date: "2026-01-20", staffId: "staff2" },
      { code: "BREAK_OVERLAP", date: "2026-01-20", staffId: "staff3" },
    ]);
  });

  // 日付選択の勤務は時刻を持たない。保存される09:00-22:00は置き場所としての値で、店舗の受付時間ではないため、
  // その外の時刻の休憩も受け付ける。時刻として正しくない休憩だけを拒否する。
  it("日付選択では、勤務の保存用の時刻の外にある休憩も受け付け、開始と終了が逆の休憩は拒否する", () => {
    expect(
      codesOf({
        ...baseInput,
        pattern: DATE_ONLY_PATTERN,
        assignments: [
          { ...assignment({ startTime: "09:00", endTime: "22:00" }), breaks: [rest("22:00", "23:00")] },
          {
            ...assignment({ staffId: "staff2", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("08:00", "09:30")],
          },
          {
            ...assignment({ staffId: "staff3", startTime: "09:00", endTime: "22:00" }),
            breaks: [rest("15:00", "14:00")],
          },
        ],
      }),
    ).toEqual([{ code: "BREAK_INVALID_TIME", date: "2026-01-20", staffId: "staff3" }]);
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
