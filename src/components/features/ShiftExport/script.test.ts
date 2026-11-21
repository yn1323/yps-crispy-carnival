import { describe, expect, it } from "vitest";
import { createExportFixture } from "./fixtures";
import { buildExportSchedule, getExportFileName, getExportTitle } from "./script";

describe("buildExportSchedule", () => {
  it("31日をJSTの日付と保存順で並べ、割当なし・定休日を - にする", () => {
    const data = createExportFixture();
    data.assignments.push({ ...data.assignments[0], date: "2026-08-02" });
    const result = buildExportSchedule(data);
    expect(result.dates).toHaveLength(31);
    expect(result.dates[0]).toEqual({ date: "2026-08-01", label: "1(土)", dayOfWeek: 6, isClosed: false });
    expect(result.rows.map(({ staffId }) => staffId)).toEqual(["staff-2", "staff-1"]);
    expect(result.bodyLineCount).toBe(2);
    expect(result.rows[0].cells.slice(0, 3)).toEqual([
      { lines: ["09:00", "17:00"] },
      { lines: ["-"] },
      { lines: ["-"] },
    ]);
  });
  it("分割勤務と24時以降をそれぞれの開始・終了で保持する", () => {
    const data = createExportFixture();
    data.assignments.push({ ...data.assignments[0], startTime: "22:00", endTime: "26:00" });
    expect(buildExportSchedule(data).rows[0].cells[0].lines).toEqual(["09:00", "17:00", "22:00", "26:00"]);
  });
  it("同名の現スタッフと削除済みスタッフを区別し、保存順と割当を保つ", () => {
    const data = createExportFixture({
      staffs: [
        { id: "staff-2", name: "田中 花子", isRemoved: true },
        { id: "staff-1", name: "田中 花子", isRemoved: false },
      ],
    });
    const result = buildExportSchedule(data);
    expect(result.rows.map(({ staffId, staffName }) => ({ staffId, staffName }))).toEqual([
      { staffId: "staff-2", staffName: "田中 花子（削除済み）" },
      { staffId: "staff-1", staffName: "田中 花子" },
    ]);
    expect(result.rows.map(({ cells }) => cells[0].lines)).toEqual([["09:00", "17:00"], ["-"]]);
  });
  it("日付選択を1行、勤務パターンを重複除去して設定順・全体最大行数にする", () => {
    const data = createExportFixture();
    data.recruitment.submissionPattern = { kind: "dateOnly" };
    expect(buildExportSchedule(data).rows[0].cells[0].lines).toEqual(["○"]);
    data.recruitment.submissionPattern = {
      kind: "shiftType",
      options: [
        { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 2 },
        { id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 1 },
      ],
    };
    data.assignments = ["late", "early", "late"].map((optionId) => ({ ...data.assignments[0], optionId }));
    const result = buildExportSchedule(data);
    expect(result.rows[0].cells[0].lines).toEqual(["早番", "遅番"]);
    expect(result.bodyLineCount).toBe(2);
    data.assignments[0].optionId = "missing";
    expect(() => buildExportSchedule(data)).toThrow("勤務パターン");
  });
  describe("ポジションと休憩のある勤務", () => {
    const positions = [
      { id: "hall", name: "ホール" },
      { id: "kitchen", name: "キッチン" },
    ];

    it("時間指定は勤務の開始と終了だけを出し、ポジションの違う隣の勤務を1つにまとめる", () => {
      const data = createExportFixture({ positions });
      data.assignments = [
        {
          ...data.assignments[0],
          startTime: "09:00",
          endTime: "13:00",
          positionId: "hall",
          breaks: [{ startTime: "11:00", endTime: "11:30" }],
        },
        { ...data.assignments[0], startTime: "13:00", endTime: "17:00", positionId: "kitchen" },
      ];
      const result = buildExportSchedule(data);
      expect(result.rows[0].cells[0].lines).toEqual(["09:00", "17:00"]);
      expect(result.bodyLineCount).toBe(2);
    });

    it("日付選択は○だけ、パターン選択はパターン名だけを出す", () => {
      const dateOnly = createExportFixture({ positions });
      dateOnly.recruitment.submissionPattern = { kind: "dateOnly" };
      dateOnly.assignments = [
        { ...dateOnly.assignments[0], positionId: "kitchen", breaks: [{ startTime: "14:00", endTime: "15:00" }] },
      ];
      expect(buildExportSchedule(dateOnly).rows[0].cells[0].lines).toEqual(["○"]);

      const shiftType = createExportFixture({ positions });
      shiftType.recruitment.submissionPattern = {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 1 },
          { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 2 },
        ],
      };
      shiftType.assignments = [
        { ...shiftType.assignments[0], optionId: "late", startTime: "17:00", endTime: "22:00", positionId: "kitchen" },
        {
          ...shiftType.assignments[0],
          optionId: "early",
          positionId: "hall",
          breaks: [{ startTime: "12:00", endTime: "13:00" }],
        },
      ];
      const result = buildExportSchedule(shiftType);
      expect(result.rows[0].cells[0].lines).toEqual(["早番", "遅番"]);
      expect(result.bodyLineCount).toBe(2);
    });

    it("休憩の時刻が正しくない場合は帳票を作らない", () => {
      const data = createExportFixture({ positions });
      data.assignments = [{ ...data.assignments[0], breaks: [{ startTime: "13:00", endTime: "12:00" }] }];
      expect(() => buildExportSchedule(data)).toThrowError("休憩時間");
    });
  });

  it("月をまたぐ1日から31日を扱い、範囲外と出力ブロックを拒否する", () => {
    const data = createExportFixture({ assignments: [] });
    data.recruitment.periodStart = "2026-08-31";
    data.recruitment.periodEnd = "2026-09-01";
    expect(buildExportSchedule(data).dates.map(({ label }) => label)).toEqual(["31(月)", "1(火)"]);
    data.recruitment.periodEnd = "2026-08-31";
    expect(buildExportSchedule(data).dates).toHaveLength(1);
    data.recruitment.periodEnd = "2026-10-01";
    expect(() => buildExportSchedule(data)).toThrow();
  });
  it("ファイル名から区切り文字・制御文字を除き、セル用の元の名前は残す", () => {
    const schedule = buildExportSchedule(
      createExportFixture({
        shopName: "=店舗/本店\n",
        staffs: [{ id: "staff-2", name: "=SUM(1,2)", isRemoved: false }],
      }),
    );
    expect(getExportFileName(schedule, "xlsx")).toBe("=店舗_本店__シフト表_2026-08-01_2026-08-31.xlsx");
    expect(schedule.rows[0].staffName).toBe("=SUM(1,2)");
  });
  it("日別を選ぶと、PDFのファイル名にだけ日別と付け、一覧の内容は変えない", () => {
    const data = createExportFixture();
    const overview = buildExportSchedule(data);
    const daily = buildExportSchedule(data, false, false, "daily");

    expect(overview.view).toBe("overview");
    expect(daily.view).toBe("daily");
    expect(daily.daily?.sheets.map(({ date }) => date)).toEqual(["2026-08-01"]);
    expect({ ...daily, view: "overview" }).toEqual(overview);
    expect(getExportFileName(daily, "pdf")).toBe("シフトリ駅前店_シフト表_日別_2026-08-01_2026-08-31.pdf");
    // Excelは日別を選んでいても一覧を出す。
    expect(getExportFileName(daily, "xlsx")).toBe("シフトリ駅前店_シフト表_2026-08-01_2026-08-31.xlsx");
    expect(getExportFileName(overview, "pdf")).toBe("シフトリ駅前店_シフト表_2026-08-01_2026-08-31.pdf");
  });
  it.each([
    ["同じ", "2026-08-01", "2026-08-31", "2026/08/01~08/31 シフトリ駅前店"],
    ["異なる", "2026-12-28", "2027-01-03", "2026/12/28~2027/01/03 シフトリ駅前店"],
  ])("開始・終了年が%s場合の期間と店舗名を帳票タイトルへ整形する", (_, periodStart, periodEnd, expected) => {
    const data = createExportFixture({ assignments: [] });
    data.recruitment.periodStart = periodStart;
    data.recruitment.periodEnd = periodEnd;

    expect(getExportTitle(buildExportSchedule(data))).toBe(expected);
  });

  it("連絡事項の一覧は選んだときだけ日付順・保存したスタッフ順に作り、メモの有無は常に返す", () => {
    const fixture = createExportFixture({
      dateNotes: [
        { staffId: "staff-1", date: "2026-08-03", note: "鈴木のメモ" },
        { staffId: "staff-2", date: "2026-08-03", note: "田中のメモ" },
        { staffId: "staff-2", date: "2026-08-01", note: "初日のメモ" },
      ],
    });

    const withoutNotes = buildExportSchedule(fixture);
    expect(withoutNotes.hasDateNotes).toBe(true);
    expect(withoutNotes.noteRows).toEqual([]);

    expect(
      buildExportSchedule(fixture, false, true).noteRows.map(({ dateLabel, staffName, note }) => [
        dateLabel,
        staffName,
        note,
      ]),
    ).toEqual([
      ["8/1(土)", "田中 花子", "初日のメモ"],
      ["8/3(月)", "田中 花子", "田中のメモ"],
      ["8/3(月)", "鈴木 太郎", "鈴木のメモ"],
    ]);
    expect(buildExportSchedule(createExportFixture()).hasDateNotes).toBe(false);
  });

  it("出力対象外のスタッフ・期間外・重複・空や長すぎるメモでは部分的な帳票を作らない", () => {
    const valid = { staffId: "staff-1", date: "2026-08-03", note: "メモ" };
    for (const dateNotes of [
      [{ ...valid, staffId: "missing" }],
      [{ ...valid, date: "2026-09-01" }],
      [valid, { ...valid, note: "重複" }],
      [{ ...valid, note: "" }],
      [{ ...valid, note: "あ".repeat(101) }],
    ]) {
      expect(() => buildExportSchedule(createExportFixture({ dateNotes }), false, true)).toThrow();
    }
  });
});
