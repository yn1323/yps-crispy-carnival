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
  describe("ポジションと休憩の出力", () => {
    const positions = [
      { id: "hall", name: "ホール" },
      { id: "kitchen", name: "キッチン" },
    ];

    it("選ばない場合は、ポジションと休憩があっても従来と同じ行にする", () => {
      const data = createExportFixture({ positions });
      data.assignments = [
        {
          ...data.assignments[0],
          positionId: "hall",
          breaks: [{ startTime: "12:00", endTime: "13:00" }],
        },
      ];
      const result = buildExportSchedule(data);
      expect(result.hasShiftDetails).toBe(true);
      expect(result.rows[0].cells[0].lines).toEqual(["09:00", "17:00"]);
      expect(result.bodyLineCount).toBe(2);
    });

    it("時間指定は勤務ごとにポジション名と休憩を足し、ポジションが違う隣の勤務をまとめない", () => {
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
      const result = buildExportSchedule(data, false, false, true);
      expect(result.rows[0].cells[0].lines).toEqual([
        "09:00",
        "13:00",
        "ホール",
        "休憩",
        "11:00",
        "11:30",
        "13:00",
        "17:00",
        "キッチン",
      ]);
      expect(result.bodyLineCount).toBe(9);
      // 選ばない場合は、ポジションをまたいで1つの勤務にまとめる。
      expect(buildExportSchedule(data).rows[0].cells[0].lines).toEqual(["09:00", "17:00"]);
    });

    it("ポジションが1つだけの店舗ではポジション名を出さず、休憩だけを足す", () => {
      const data = createExportFixture({ positions: [positions[0]] });
      data.assignments = [
        {
          ...data.assignments[0],
          positionId: "hall",
          breaks: [
            { startTime: "15:00", endTime: "15:15" },
            { startTime: "12:00", endTime: "13:00" },
          ],
        },
      ];
      const result = buildExportSchedule(data, false, false, true);
      expect(result.hasShiftDetails).toBe(true);
      expect(result.rows[0].cells[0].lines).toEqual([
        "09:00",
        "17:00",
        "休憩",
        "12:00",
        "13:00",
        "休憩",
        "15:00",
        "15:15",
      ]);
    });

    it("日付選択は○の代わりにポジション名を出し、休憩を足す", () => {
      const data = createExportFixture({ positions });
      data.recruitment.submissionPattern = { kind: "dateOnly" };
      data.assignments = [
        {
          ...data.assignments[0],
          positionId: "kitchen",
          breaks: [{ startTime: "14:00", endTime: "15:00" }],
        },
      ];
      expect(buildExportSchedule(data, false, false, true).rows[0].cells[0].lines).toEqual([
        "キッチン",
        "休憩",
        "14:00",
        "15:00",
      ]);
      expect(buildExportSchedule(data).rows[0].cells[0].lines).toEqual(["○"]);
    });

    it("パターン選択は勤務パターンごとにポジション名と休憩を足す", () => {
      const data = createExportFixture({ positions });
      data.recruitment.submissionPattern = {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 1 },
          { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 2 },
        ],
      };
      data.assignments = [
        { ...data.assignments[0], optionId: "late", startTime: "17:00", endTime: "22:00", positionId: "kitchen" },
        {
          ...data.assignments[0],
          optionId: "early",
          positionId: "hall",
          breaks: [{ startTime: "12:00", endTime: "13:00" }],
        },
      ];
      const result = buildExportSchedule(data, false, false, true);
      expect(result.rows[0].cells[0].lines).toEqual(["早番", "ホール", "休憩", "12:00", "13:00", "遅番", "キッチン"]);
      expect(result.bodyLineCount).toBe(7);
    });

    it("ポジションが1つで休憩もない場合は、選べる項目を出さない", () => {
      const data = createExportFixture({ positions: [positions[0]] });
      data.assignments = [{ ...data.assignments[0], positionId: "hall" }];
      expect(buildExportSchedule(data).hasShiftDetails).toBe(false);
      expect(buildExportSchedule(createExportFixture()).hasShiftDetails).toBe(false);
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
