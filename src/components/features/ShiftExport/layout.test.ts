import { describe, expect, it } from "vitest";
import { createExportFixture } from "./fixtures";
import { fitExportText, getExportLayout } from "./layout";
import { buildExportSchedule } from "./script";

describe("シフト表の帳票レイアウト", () => {
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
