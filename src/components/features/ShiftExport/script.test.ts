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
  it("分割勤務と24時以降を最初の開始・最後の終了の2行へまとめる", () => {
    const data = createExportFixture();
    data.assignments.push({ ...data.assignments[0], startTime: "22:00", endTime: "26:00" });
    expect(buildExportSchedule(data).rows[0].cells[0].lines).toEqual(["09:00", "26:00"]);
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
  it("日付指定を1行、勤務区分を重複除去して設定順・全体最大行数にする", () => {
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
    expect(() => buildExportSchedule(data)).toThrow("勤務区分");
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
    expect(() => buildExportSchedule(createExportFixture({ exportBlockReason: "excludedStaffAssignments" }))).toThrow();
  });
  it("確定履歴・内容比較・配送状況を別々に表示し、時刻で推測しない", () => {
    const data = createExportFixture({
      confirmationState: "confirmed",
      contentComparison: "same",
      notificationState: "pending",
    });
    data.recruitment.draftSavedAt = 9999;
    data.recruitment.confirmedAt = 1;
    expect(buildExportSchedule(data)).toMatchObject({
      statusLabel: "確定済み",
      notificationLabel: "前回の通知は処理中",
    });
    expect(buildExportSchedule({ ...data, contentComparison: "different", notificationState: "failed" })).toMatchObject(
      { statusLabel: "確定後に変更あり", notificationLabel: "前回の通知に失敗あり" },
    );
    expect(buildExportSchedule({ ...data, contentComparison: "unknown", notificationState: "unknown" })).toMatchObject({
      statusLabel: "確定済み（変更状況を確認できません）",
      notificationLabel: "前回の通知状況を確認できません",
    });
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
});
