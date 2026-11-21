import { describe, expect, it } from "vitest";
import {
  fitDailyBreakLabel,
  fitDailySegmentLabel,
  getDailyCountLabels,
  getDailyHatchLines,
  getDailySegmentFill,
  getExportDailyLayout,
  getExportDailyPages,
} from "./dailyLayout";
import { createDailyExportFixture } from "./fixtures";
import { buildExportSchedule } from "./script";
import type { ExportDaily } from "./types";

const buildDaily = (staffCount = 6): ExportDaily => {
  const data = createDailyExportFixture();
  if (staffCount > 6) {
    data.staffs = Array.from({ length: staffCount }, (_, index) => ({
      id: `staff-${index + 1}`,
      name: `スタッフ ${index + 1}`,
      isRemoved: false,
    }));
    data.assignments = data.staffs.map((staff) => ({
      staffId: staff.id,
      date: "2026-08-01",
      startTime: "09:00",
      endTime: "17:00",
      optionId: null,
      positionId: "hall",
    }));
  }
  const { daily } = buildExportSchedule(data);
  if (!daily) throw new Error("日別を作れる募集のはずです。");
  return daily;
};

describe("日別のバーの帳票レイアウト", () => {
  it("1日を1ページにし、勤務のある人のあとを空行で埋める", () => {
    const daily = buildDaily();
    const layout = getExportDailyLayout(daily);
    const pages = getExportDailyPages(daily, layout);

    expect(pages.map(({ title }) => title)).toEqual(["2026/08/01(土) シフトリ駅前店", "2026/08/03(月) シフトリ駅前店"]);
    expect(pages[0].rows.map((row) => row?.staffName ?? null).slice(0, 6)).toEqual([
      "佐藤 一郎",
      "鈴木 太郎",
      "高橋 美咲",
      "田中 花子",
      "伊藤 健",
      null,
    ]);
    expect(pages[0].rows.slice(5).every((row) => row === null)).toBe(true);
    for (const page of pages) {
      const usedHeightPt =
        page.rows.length * layout.rowHeightPt + page.sheet.counts.length * layout.countRowHeightPt + layout.countGapPt;
      // 行をもう1つ足すと入らない数まで埋め、人数の行を含めてページに収める。
      expect(usedHeightPt).toBeLessThanOrEqual(layout.bodyHeightPt);
      expect(usedHeightPt + layout.rowHeightPt).toBeGreaterThan(layout.bodyHeightPt);
    }
  });

  it("1ページに収まらない日は次のページへ続け、全員を1回ずつ載せて題名に何ページ目かを書く", () => {
    const daily = buildDaily(40);
    const pages = getExportDailyPages(daily);

    expect(pages.map(({ title }) => title)).toEqual([
      "2026/08/01(土) シフトリ駅前店（1/2）",
      "2026/08/01(土) シフトリ駅前店（2/2）",
    ]);
    // 出勤人数は、ページに分けてもその日の全員の数を出す。
    expect(pages.map(({ sheet }) => sheet.workerLabel)).toEqual(["出勤 40人", "出勤 40人"]);
    expect(pages[0].rows.every((row) => row !== null)).toBe(true);
    expect(pages[1].rows).toHaveLength(pages[0].rows.length);
    expect(pages.flatMap(({ rows }) => rows.flatMap((row) => (row ? [row.staffName] : [])))).toEqual(
      Array.from({ length: 40 }, (_, index) => `スタッフ ${index + 1}`),
    );
  });

  it("時刻の軸をグラフの幅に割り付け、時間の数字は幅が狭いと間引く", () => {
    const daily = buildDaily();
    const layout = getExportDailyLayout(daily);

    expect(layout.toChartPt(daily.axisStart)).toBe(0);
    expect(layout.toChartPt(daily.axisEnd)).toBeCloseTo(layout.chartWidthPt - 1, 5);
    expect(layout.hours.map(({ label }) => label)).toEqual([
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
    ]);

    const narrow = getExportDailyLayout({ ...daily, axisStart: 0, axisEnd: 36 * 60 * 2 });
    expect(narrow.hours.slice(0, 5).map(({ label }) => label)).toEqual(["0", "", "2", "", "4"]);
  });

  it("バーの文字は幅に合わせて縮めて省略し、狭い区間には書かない", () => {
    const layout = getExportDailyLayout(buildDaily());

    expect(fitDailySegmentLabel("ホール", 100, layout)).toEqual({ text: "ホール", fontSizePt: 7 });
    expect(fitDailySegmentLabel("ドリンクカウンター", 40, layout)).toEqual({ text: "ドリンクカ…", fontSizePt: 6 });
    expect(fitDailySegmentLabel("ホール", 13, layout)).toBeNull();
    expect(fitDailySegmentLabel("", 100, layout)).toBeNull();
  });

  it("バーの塗りはポジションの色を白で薄め、色のない勤務は灰色にする", () => {
    expect(getDailySegmentFill("#000000")).toBe("#999999");
    expect(getDailySegmentFill("#60a5fa")).toBe("#bfdbfd");
    expect(getDailySegmentFill("#ffffff")).toBe("#ffffff");
    expect(getDailySegmentFill(null)).toBe("#e6e6e6");
  });

  it("休憩の「休」は、1文字が入る幅の休憩にだけ書き、狭いと小さくする", () => {
    const layout = getExportDailyLayout(buildDaily());

    expect(fitDailyBreakLabel(24, layout)).toEqual({ fontSizePt: 7, boxWidthPt: 9, boxHeightPt: 10 });
    expect(fitDailyBreakLabel(9, layout)?.fontSizePt).toBe(7);
    expect(fitDailyBreakLabel(8.9, layout)?.fontSizePt).toBe(6);
    expect(fitDailyBreakLabel(8, layout)?.fontSizePt).toBe(6);
    expect(fitDailyBreakLabel(7.9, layout)).toBeNull();
  });

  it("休憩の斜線は、四角の中に収まる右上がりの線にする", () => {
    const lines = getDailyHatchLines(20, 10);

    expect(lines.length).toBeGreaterThan(5);
    for (const { x1, y1, x2, y2 } of lines) {
      for (const x of [x1, x2]) expect(x >= 0 && x <= 20).toBe(true);
      for (const y of [y1, y2]) expect(y >= 0 && y <= 10).toBe(true);
      expect(x2 - x1).toBeGreaterThan(0);
      // 傾きは45度（右へ進んだ分だけ上がる）。
      expect(y1 - y2).toBeCloseTo(x2 - x1, 5);
    }
    expect(getDailyHatchLines(0, 10)).toEqual([]);
  });

  it("人数の0は、最初に人がいる時間と最後に人がいる時間の間にだけ書く", () => {
    const segments = [0, 1, 0, 2, 0].map((count, index) => ({ start: index * 60, end: (index + 1) * 60, count }));

    expect(getDailyCountLabels({ key: "hall", label: "ホール", segments })).toEqual(["", "1", "0", "2", ""]);
    expect(getDailyCountLabels({ key: "hall", label: "ホール", segments: segments.slice(0, 1) })).toEqual([""]);
  });
});
