import { describe, expect, it } from "vitest";
import { createExportFixture } from "./fixtures";
import { fitExportText, getExportLayout, getExportPages, getExportPeriods } from "./layout";
import { buildExportSchedule } from "./script";

describe("シフト表の帳票レイアウト", () => {
  it.each([
    [14, [14]],
    [15, [8, 7]],
    [16, [8, 8]],
    [30, [15, 15]],
    [31, [16, 15]],
  ])("%i日を分けるとき、15日未満はそのまま、それ以外は前半を切り上げる", (days, expectedCounts) => {
    const data = createExportFixture();
    data.recruitment.periodEnd = `2026-08-${String(days).padStart(2, "0")}`;
    const schedule = buildExportSchedule(data, true);
    const periods = getExportPeriods(schedule);

    expect(periods.map((period) => period.dates.length)).toEqual(expectedCounts);
    expect(periods.flatMap((period) => period.dates)).toEqual(schedule.dates);
    for (const period of periods) {
      expect(period.periodStart).toBe(period.dates[0].date);
      expect(period.periodEnd).toBe(period.dates[period.dates.length - 1].date);
    }
    expect(getExportPeriods(buildExportSchedule(data))).toEqual([buildExportSchedule(data)]);
  });

  it.each(["time", "dateOnly", "shiftType"] as const)(
    "%s方式でも期間ごとに全スタッフを出力し、月をまたいだ日付と勤務欄をずらさない",
    (mode) => {
      const data = createExportFixture();
      data.recruitment.periodStart = "2026-08-25";
      data.recruitment.periodEnd = "2026-09-24";
      data.assignments = [];
      const schedule = buildExportSchedule(data, true);
      schedule.mode = mode;
      schedule.rows = Array.from({ length: 200 }, (_, index) => ({
        staffId: `staff-${index}`,
        staffName: `スタッフ${index}`,
        cells: schedule.dates.map(({ date }) => ({ lines: [`${index}:${date}`] })),
      }));
      const pages = getExportPages(schedule);
      const firstHalfPages = pages.filter(({ period }) => period.periodStart === "2026-08-25");
      const secondHalfPages = pages.filter(({ period }) => period.periodStart === "2026-09-10");

      expect(pages).toEqual([...firstHalfPages, ...secondHalfPages]);
      expect(firstHalfPages.length).toBeGreaterThan(1);
      expect(secondHalfPages.length).toBeGreaterThan(1);
      for (const [index, halfPages] of [firstHalfPages, secondHalfPages].entries()) {
        expect(halfPages.flatMap(({ rows }) => rows)).toEqual(
          schedule.rows.map((row) => ({ ...row, cells: index === 0 ? row.cells.slice(0, 16) : row.cells.slice(16) })),
        );
        expect(halfPages.map(({ isFirstPage }) => isFirstPage)).toEqual(halfPages.map((_, index) => index === 0));
        for (const { period, layout, rows, isFirstPage } of halfPages) {
          expect(
            layout.staffColumnWidthPt + layout.dateColumnWidthPt * period.dates.length + layout.marginPt * 2,
          ).toBeCloseTo(layout.pageWidthPt);
          expect(
            layout.marginPt * 2 +
              layout.headerHeightPt +
              layout.footerHeightPt +
              (isFirstPage ? layout.titleHeightPt : 0) +
              rows.length * layout.rowHeightPt,
          ).toBeLessThanOrEqual(layout.pageHeightPt);
        }
      }
    },
  );

  it.each([1, 7, 15, 31])("%i日をA4横の有効幅に均等配置する", (days) => {
    const fixture = createExportFixture();
    fixture.recruitment.periodEnd = `2026-08-${String(days).padStart(2, "0")}`;
    const schedule = buildExportSchedule(fixture);
    const layout = getExportLayout(schedule);

    expect(layout.staffColumnWidthPt + layout.dateColumnWidthPt * days + layout.marginPt * 2).toBeCloseTo(841.89);
    expect(layout.pageHeightPt).toBeCloseTo(595.28);
    for (const time of ["09:00", "17:30", "26:00"]) {
      expect(
        fitExportText(
          time,
          layout.dateColumnWidthPt - layout.cellPaddingPt * 2,
          layout.fontSizePt,
          layout.minFontSizePt,
        ).text,
      ).toBe(time);
    }
  });

  it.each([1, 2, 10])("表示が%i行でも200人を欠落・重複なくスタッフ単位で改ページする", (bodyLineCount) => {
    const schedule = buildExportSchedule(createExportFixture());
    schedule.bodyLineCount = bodyLineCount;
    schedule.rows = Array.from({ length: 200 }, (_, index) => ({ ...schedule.rows[0], staffId: `staff-${index}` }));
    const layout = getExportLayout(schedule);

    expect(layout.pages.flat().map((row) => row.staffId)).toEqual(schedule.rows.map((row) => row.staffId));
    expect(layout.firstPageCapacity).toBeLessThanOrEqual(layout.subsequentPageCapacity);
    for (const [pageIndex, page] of layout.pages.entries()) {
      const contentHeight =
        layout.marginPt * 2 +
        layout.headerHeightPt +
        layout.footerHeightPt +
        (pageIndex === 0 ? layout.titleHeightPt : 0) +
        page.length * layout.rowHeightPt;
      expect(contentHeight).toBeLessThanOrEqual(layout.pageHeightPt);
    }
  });

  it("ちょうど1ページの人数を超えた1人だけを次ページへ送る", () => {
    const schedule = buildExportSchedule(createExportFixture());
    const { firstPageCapacity } = getExportLayout(schedule);
    schedule.rows = Array.from({ length: firstPageCapacity }, (_, index) => ({
      ...schedule.rows[0],
      staffId: `${index}`,
    }));
    expect(getExportLayout(schedule).pages).toHaveLength(1);
    schedule.rows.push({ ...schedule.rows[0], staffId: "last" });
    expect(getExportLayout(schedule).pages.map((page) => page.length)).toEqual([firstPageCapacity, 1]);
  });

  it("長い氏名は1行の末尾省略、勤務区分は下限まで縮小してから省略する", () => {
    expect(fitExportText("長い勤務区分名称", 18, 8, 6)).toEqual({ text: "長い…", fontSizePt: 6 });
    expect(fitExportText("田中\n花子", 100, 8)).toEqual({ text: "田中 花子", fontSizePt: 8 });
    expect(fitExportText("スタッフの長い名前を末尾まで表示できない", 106, 8)).toEqual({
      text: "スタッフの長い名前を末尾…",
      fontSizePt: 8,
    });
  });
});
