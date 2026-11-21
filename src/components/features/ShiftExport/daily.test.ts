import { describe, expect, it } from "vitest";
import { buildExportDaily, DAILY_POSITION_COUNT_ROW_LIMIT } from "./daily";
import { createDailyExportFixture } from "./fixtures";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";

const build = (data: ShiftExportData) => {
  const daily = buildExportDaily(data, buildExportSchedule(data).dates);
  if (!daily) throw new Error("日別を作れる募集のはずです。");
  return daily;
};
const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};
const work = (start: string, end: string, label: string, color: string | null) => ({
  kind: "work",
  start: minutes(start),
  end: minutes(end),
  label,
  color,
});
const rest = (start: string, end: string) => ({ kind: "break", start: minutes(start), end: minutes(end) });

describe("buildExportDaily", () => {
  it("時刻を持たない日付選択の募集では作らない", () => {
    const data = createDailyExportFixture();
    data.recruitment.submissionPattern = { kind: "dateOnly" };
    expect(buildExportDaily(data, buildExportSchedule(data).dates)).toBeNull();
    expect(buildExportSchedule(data, false, false, "daily").view).toBe("overview");
  });

  it("勤務のある人だけを開始の早い順に並べ、定休日と勤務のない日は作らない", () => {
    const data = createDailyExportFixture();
    // 定休日に残った勤務は、一覧と同じく出さない。
    data.assignments.push({ ...data.assignments[0], date: "2026-08-02" });
    const daily = build(data);

    expect(daily.sheets.map(({ date, title }) => ({ date, title }))).toEqual([
      { date: "2026-08-01", title: "2026/08/01(土) シフトリ駅前店" },
      { date: "2026-08-03", title: "2026/08/03(月) シフトリ駅前店" },
    ]);
    expect(daily.sheets[0].rows.map(({ staffName, timeLabel }) => [staffName, timeLabel])).toEqual([
      ["佐藤 一郎", "09:00-17:00"],
      ["鈴木 太郎", "10:00-15:00"],
      ["高橋 美咲", "11:00-20:00"],
      // 開始と終了が同じ人は、スタッフの表示順のままにする。
      ["田中 花子", "17:00-22:00"],
      ["伊藤 健", "17:00-22:00"],
    ]);
    expect(daily.sheets[1].rows.map(({ staffName }) => staffName)).toEqual(["山本 さくら"]);
    expect(daily.sheets.map(({ workerLabel }) => workerLabel)).toEqual(["出勤 5人", "出勤 1人"]);
  });

  it("ポジションの切り替えと休憩を、左から右の順の区間にする", () => {
    const [sato, , takahashi] = build(createDailyExportFixture()).sheets[0].rows;

    expect(sato.segments).toEqual([
      work("09:00", "12:00", "キッチン", "#fb923c"),
      rest("12:00", "13:00"),
      work("13:00", "17:00", "キッチン", "#fb923c"),
    ]);
    expect(takahashi.segments).toEqual([
      work("11:00", "14:00", "ホール", "#60a5fa"),
      work("14:00", "16:00", "キッチン", "#fb923c"),
      rest("16:00", "16:30"),
      work("16:30", "20:00", "キッチン", "#fb923c"),
    ]);
  });

  it("人数をポジションごとに、人数が変わる時刻で区切り、休憩中の人を数えない", () => {
    const daily = build(createDailyExportFixture());
    const format = (key: string) =>
      daily.sheets[0].counts
        .find((count) => count.key === key)
        ?.segments.map(({ start, end, count }) => `${start / 60}-${end / 60}:${count}`);

    expect(daily.sheets[0].counts.map(({ label }) => label)).toEqual(["ホール", "キッチン"]);
    expect(format("hall")).toEqual(["9-10:0", "10-11:1", "11-14:2", "14-15:1", "15-17:0", "17-22:1"]);
    expect(format("kitchen")).toEqual(["9-12:1", "12-13:0", "13-14:1", "14-16:2", "16-16.5:1", "16.5-20:2", "20-22:1"]);
    // その日に勤務のないポジションの行は出さない。
    expect(daily.sheets[1].counts.map(({ label }) => label)).toEqual(["ホール"]);
  });

  it("時刻の軸は期間を通して同じにし、募集の時間帯の外の勤務も正時にそろえて含める", () => {
    const data = createDailyExportFixture();
    data.assignments.push({ ...data.assignments[0], staffId: "staff-6", startTime: "07:30", endTime: "23:15" });
    const daily = build(data);

    expect([daily.axisStart, daily.axisEnd]).toEqual([7 * 60, 24 * 60]);
  });

  it("削除済みのスタッフは行に残し、人数には数えない", () => {
    const data = createDailyExportFixture();
    data.staffs[3] = { ...data.staffs[3], isRemoved: true };
    const sheet = build(data).sheets[0];

    expect(sheet.rows.map(({ staffName }) => staffName)).toEqual([
      "佐藤 一郎",
      "鈴木 太郎（削除済み）",
      "高橋 美咲",
      "田中 花子",
      "伊藤 健",
    ]);
    expect(sheet.counts[0].segments.map(({ count }) => count)).toEqual([0, 1, 0, 1]);
    // 出勤人数も、人数の行と同じく削除済みのスタッフを数えない。
    expect(sheet.workerLabel).toBe("出勤 4人");
  });

  it("ポジションが1つ以下の店舗では名前を書かず、全体の人数を1行で出す", () => {
    const data = createDailyExportFixture({ positions: [{ id: "hall", name: "ホール", color: "#60a5fa" }] });
    data.assignments = data.assignments.map((assignment) => ({ ...assignment, positionId: "hall" }));
    const sheet = build(data).sheets[0];

    expect(sheet.rows[1].segments).toEqual([work("10:00", "15:00", "", "#60a5fa")]);
    // 同じ見た目で隣り合う勤務は1本にまとめる。
    expect(sheet.rows[2].segments.map(({ kind }) => kind)).toEqual(["work", "break", "work"]);
    expect(sheet.counts.map(({ label }) => label)).toEqual(["時間帯人数"]);
    expect(Math.max(...sheet.counts[0].segments.map(({ count }) => count))).toBe(3);
  });

  it("色を持たないポジションと、色でない値は、色なしとして扱う", () => {
    const data = createDailyExportFixture({
      positions: [
        { id: "hall", name: "ホール" },
        { id: "kitchen", name: "キッチン", color: "url(javascript:alert(1))" },
      ],
    });
    const colors = build(data).sheets[0].rows.flatMap(({ segments }) =>
      segments.flatMap((segment) => (segment.kind === "work" ? [segment.color] : [])),
    );

    expect(new Set(colors)).toEqual(new Set([null]));
  });

  it(`ポジションが${DAILY_POSITION_COUNT_ROW_LIMIT + 1}つ以上ある日と、一覧にないポジションの勤務がある日は、全体の人数にまとめる`, () => {
    const many = createDailyExportFixture({
      positions: Array.from({ length: DAILY_POSITION_COUNT_ROW_LIMIT + 1 }, (_, index) => ({
        id: `position-${index}`,
        name: `ポジション${index}`,
      })),
    });
    many.assignments = many.positions?.map((position, index) => ({
      staffId: `staff-${(index % 6) + 1}`,
      date: "2026-08-01",
      startTime: `${String(9 + index).padStart(2, "0")}:00`,
      endTime: `${String(10 + index).padStart(2, "0")}:00`,
      optionId: null,
      positionId: position.id,
    })) as ShiftExportData["assignments"];
    expect(build(many).sheets[0].counts.map(({ label }) => label)).toEqual(["時間帯人数"]);

    const unknown = createDailyExportFixture();
    unknown.assignments[0] = { ...unknown.assignments[0], positionId: "deleted" };
    const sheet = build(unknown).sheets[0];
    expect(sheet.counts.map(({ label }) => label)).toEqual(["時間帯人数"]);
    expect(sheet.rows.find(({ staffName }) => staffName === "田中 花子")?.segments).toEqual([
      work("17:00", "22:00", "", null),
    ]);
  });

  it("パターン選択は、勤務パターンの時刻でバーを作り、パターン名とポジション名を書く", () => {
    const data = createDailyExportFixture();
    data.recruitment.submissionPattern = {
      kind: "shiftType",
      options: [
        { id: "early", name: "早番", startTime: "08:00", endTime: "14:00", sortOrder: 0 },
        { id: "late", name: "遅番", startTime: "14:00", endTime: "23:00", sortOrder: 1 },
      ],
    };
    data.assignments = [
      {
        staffId: "staff-1",
        date: "2026-08-01",
        startTime: "08:00",
        endTime: "14:00",
        optionId: "early",
        positionId: "hall",
      },
      {
        staffId: "staff-1",
        date: "2026-08-01",
        startTime: "14:00",
        endTime: "23:00",
        optionId: "late",
        positionId: "hall",
      },
    ];
    const daily = build(data);

    expect([daily.axisStart, daily.axisEnd]).toEqual([8 * 60, 23 * 60]);
    expect(daily.sheets[0].rows[0]).toEqual({
      staffId: "staff-1",
      staffName: "田中 花子",
      timeLabel: "08:00-23:00",
      segments: [work("08:00", "14:00", "早番 ホール", "#60a5fa"), work("14:00", "23:00", "遅番 ホール", "#60a5fa")],
    });
  });

  it("重なる勤務は先に始まるほうを残し、勤務が1つもない募集は空で返す", () => {
    const data = createDailyExportFixture();
    data.assignments = [
      { ...data.assignments[0], startTime: "09:00", endTime: "13:00", positionId: "hall" },
      { ...data.assignments[0], startTime: "12:00", endTime: "15:00", positionId: "kitchen" },
    ];
    expect(build(data).sheets[0].rows[0].segments).toEqual([
      work("09:00", "13:00", "ホール", "#60a5fa"),
      work("13:00", "15:00", "キッチン", "#fb923c"),
    ]);

    data.assignments = [];
    expect(build(data).sheets).toEqual([]);
  });

  it("開始が終了以降の勤務では、部分的な帳票を作らない", () => {
    const data = createDailyExportFixture();
    const { dates } = buildExportSchedule(data);
    data.recruitment.submissionPattern = { kind: "shiftType", options: [] };
    data.assignments = [{ ...data.assignments[0], startTime: "15:00", endTime: "15:00" }];
    expect(() => buildExportDaily(data, dates)).toThrow("勤務時間を確認できませんでした。");
  });
});
