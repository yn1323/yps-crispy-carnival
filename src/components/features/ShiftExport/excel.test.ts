import { unzipSync } from "fflate";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createShiftExcel } from "./excel";
import { createExportFixture } from "./fixtures";
import { getExportLayout } from "./layout";
import { buildExportSchedule } from "./script";

const parseXml = (bytes: Uint8Array) =>
  new JSDOM(new TextDecoder().decode(bytes), { contentType: "application/xml" }).window.document;

describe("Excelの実ファイル", () => {
  it("31日・200人を1シートへ出力し、セル型・罫線・色・寸法・印刷設定を保持する", async () => {
    const schedule = buildExportSchedule(createExportFixture());
    const formulaLikeName = '=HYPERLINK("https://example.invalid","名前")';
    const fullShiftName = "省略せずに保持する正式なパターン名称";
    schedule.rows = Array.from({ length: 200 }, (_, index) => ({
      ...schedule.rows[0],
      staffId: `staff-${index}`,
      staffName: index < 2 ? formulaLikeName : `スタッフ${index}`,
    }));
    schedule.rows[1] = {
      ...schedule.rows[1],
      cells: schedule.rows[1].cells.map((cell, index) => (index === 0 ? { lines: [fullShiftName, "=1+1"] } : cell)),
    };
    const layout = getExportLayout(schedule);
    const blob = await createShiftExcel(schedule);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const sheet = parseXml(files["xl/worksheets/sheet1.xml"]);
    const workbook = parseXml(files["xl/workbook.xml"]);
    const sharedStrings = Array.from(
      parseXml(files["xl/sharedStrings.xml"]).querySelectorAll("si"),
      (item) => item.textContent,
    );
    const styles = parseXml(files["xl/styles.xml"]);
    const cell = (address: string) => sheet.querySelector(`c[r="${address}"]`);
    const value = (address: string) => sharedStrings[Number(cell(address)?.querySelector("v")?.textContent)];
    const style = (address: string) =>
      styles.querySelectorAll("cellXfs > xf")[Number(cell(address)?.getAttribute("s"))];

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(workbook.querySelectorAll("sheet")).toHaveLength(1);
    expect(sheet.querySelector("dimension")?.getAttribute("ref")).toBe("A1:AF202");
    expect(sheet.querySelectorAll("sheetData > row")).toHaveLength(202);
    expect(value("A1")).toBe("2026/08/01~08/31 シフトリ駅前店");
    expect(sharedStrings.join(" ")).not.toMatch(/下書き|確定済み|通知/);
    expect(value("A3")).toBe(formulaLikeName);
    expect(value("A4")).toBe(formulaLikeName);
    expect(value("A202")).toBe("スタッフ199");
    expect(value("B3")).toBe("09:00\n17:00");
    expect(value("B4")).toBe(`${fullShiftName}\n=1+1`);
    expect(value("C3")).toBe("-");
    expect(cell("A3")?.getAttribute("t")).toBe("s");
    expect(cell("B4")?.getAttribute("t")).toBe("s");
    expect(sheet.querySelectorAll("f, hyperlink")).toHaveLength(0);
    expect(sheet.querySelector('row[r="3"]')?.getAttribute("ht")).toBe(String(layout.rowHeightPt));
    expect(sheet.querySelector('row[r="202"]')?.getAttribute("ht")).toBe(String(layout.rowHeightPt));
    expect(Number(sheet.querySelector('col[min="1"]')?.getAttribute("width"))).toBeCloseTo(
      ((layout.staffColumnWidthPt * 4) / 3 - 5) / 7,
    );
    expect(Number(sheet.querySelector('col[min="2"]')?.getAttribute("width"))).toBeCloseTo(
      ((layout.dateColumnWidthPt * 4) / 3 - 5) / 7,
    );
    expect(sheet.querySelector("pane")?.getAttribute("xSplit")).toBe("1");
    expect(sheet.querySelector("pane")?.getAttribute("ySplit")).toBe("2");
    expect(sheet.querySelector("pane")?.getAttribute("topLeftCell")).toBe("B3");
    expect(sheet.querySelector("pageSetup")?.getAttribute("paperSize")).toBe("9");
    expect(sheet.querySelector("pageSetup")?.getAttribute("orientation")).toBe("landscape");
    expect(sheet.querySelector("pageSetup")?.getAttribute("fitToWidth")).toBe("1");
    expect(sheet.querySelector("pageSetup")?.getAttribute("fitToHeight")).toBe("0");
    expect(workbook.querySelector('definedName[name="_xlnm.Print_Area"]')?.textContent).toBe("'シフト表'!$A1:$AF202");
    expect(workbook.querySelector('definedName[name="_xlnm.Print_Titles"]')?.textContent).toBe("'シフト表'!$2:$2");
    const closedFill = styles.querySelectorAll("fills > fill")[Number(style("C3").getAttribute("fillId"))];
    expect(closedFill.querySelector("fgColor")?.getAttribute("rgb")).toBe("FFF0F0F0");
    const border = styles.querySelectorAll("borders > border")[Number(style("B3").getAttribute("borderId"))];
    for (const side of ["left", "right", "top", "bottom"]) {
      expect(border.querySelector(side)?.getAttribute("style")).toBe("thin");
      expect(border.querySelector(`${side} > color`)?.getAttribute("rgb")).toBe("FF000000");
    }
    expect(style("B3").querySelector("alignment")?.getAttribute("wrapText")).toBe("1");
    const timeFont = styles.querySelectorAll("fonts > font")[Number(style("B3").getAttribute("fontId"))];
    expect(timeFont.querySelector("name")?.getAttribute("val")).toBe("Noto Sans JP");
    expect(Number(timeFont.querySelector("sz")?.getAttribute("val"))).toBeGreaterThanOrEqual(6);
    expect(Number(timeFont.querySelector("sz")?.getAttribute("val"))).toBeLessThan(7);
    expect(style("A3").querySelector("alignment")?.getAttribute("wrapText")).toBeNull();
    expect(style("A3").querySelector("alignment")?.getAttribute("shrinkToFit")).toBe("1");
    expect(style("B2").querySelector("alignment")?.getAttribute("wrapText")).toBeNull();
    expect(style("B2").querySelector("alignment")?.getAttribute("shrinkToFit")).toBe("1");
    const saturdayFont = styles.querySelectorAll("fonts > font")[Number(style("B2").getAttribute("fontId"))];
    const sundayFont = styles.querySelectorAll("fonts > font")[Number(style("C2").getAttribute("fontId"))];
    expect(saturdayFont.querySelector("color")?.getAttribute("rgb")).toBe("FF1565C0");
    expect(sundayFont.querySelector("color")?.getAttribute("rgb")).toBe("FFC62828");
  });

  it("勤務パターンの長い正式名称を保持し、最大4パターンの折り返しに合わせて全スタッフ行を広げる", async () => {
    const schedule = buildExportSchedule(createExportFixture());
    const names = ["早", "昼", "夕", "夜"].map((name) => name.repeat(30));
    schedule.mode = "shiftType";
    schedule.bodyLineCount = names.length;
    schedule.rows[0].cells[0] = { lines: names };
    schedule.rows[1].cells[0] = { lines: ["早番"] };
    const blob = await createShiftExcel(schedule);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const sheet = parseXml(files["xl/worksheets/sheet1.xml"]);
    const strings = parseXml(files["xl/sharedStrings.xml"]).querySelectorAll("si");
    const styles = parseXml(files["xl/styles.xml"]);
    const cell = sheet.querySelector('c[r="B3"]');
    const style = styles.querySelectorAll("cellXfs > xf")[Number(cell?.getAttribute("s"))];
    const font = styles.querySelectorAll("fonts > font")[Number(style.getAttribute("fontId"))];
    const firstHeight = Number(sheet.querySelector('row[r="3"]')?.getAttribute("ht"));

    expect(strings[Number(cell?.querySelector("v")?.textContent)].textContent).toBe(names.join("\n"));
    expect(font.querySelector("sz")?.getAttribute("val")).toBe("6");
    expect(style.querySelector("alignment")?.getAttribute("wrapText")).toBe("1");
    // 31 days leave space for three full-width characters at 6 pt: 4 options need 40 rendered lines.
    expect(firstHeight).toBeGreaterThanOrEqual(40 * 6 * 1.65);
    expect(firstHeight).toBeLessThanOrEqual(409);
    expect(sheet.querySelector('row[r="4"]')?.getAttribute("ht")).toBe(String(firstHeight));
    expect(sheet.querySelectorAll("sheetData > row")).toHaveLength(schedule.rows.length + 2);
  });

  it("期間を分けると前半・後半の順に全スタッフを出力し、それぞれの日付と印刷設定を保持する", async () => {
    const schedule = buildExportSchedule(createExportFixture(), true);
    schedule.mode = "shiftType";
    schedule.bodyLineCount = 1;
    schedule.rows = Array.from({ length: 50 }, (_, staffIndex) => ({
      staffId: `staff-${staffIndex}`,
      staffName: `スタッフ${staffIndex + 1}`,
      cells: schedule.dates.map((_, dateIndex) => ({ lines: [`勤務パターン${staffIndex + 1}-${dateIndex + 1}`] })),
    }));
    const blob = await createShiftExcel(schedule);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const workbook = parseXml(files["xl/workbook.xml"]);
    const sharedStrings = Array.from(
      parseXml(files["xl/sharedStrings.xml"]).querySelectorAll("si"),
      (item) => item.textContent,
    );
    expect(Array.from(workbook.querySelectorAll("sheet"), (sheet) => sheet.getAttribute("name"))).toEqual([
      "シフト表（前半）",
      "シフト表（後半）",
    ]);

    const widths: number[] = [];
    for (const [index, start, end, lastColumn, title] of [
      [0, 0, 16, "Q", "2026/08/01~08/16 シフトリ駅前店"],
      [1, 16, 31, "P", "2026/08/17~08/31 シフトリ駅前店"],
    ] as const) {
      const sheet = parseXml(files[`xl/worksheets/sheet${index + 1}.xml`]);
      const cellValue = (cell: Element) => sharedStrings[Number(cell.querySelector("v")?.textContent)];
      const rows = Array.from(sheet.querySelectorAll("sheetData > row"), (row) =>
        Array.from(row.querySelectorAll("c"), cellValue),
      );
      const dates = schedule.dates.slice(start, end);
      const expectedRows = schedule.rows.map((staff) => [
        staff.staffName,
        ...staff.cells
          .slice(start, end)
          .map((cell, dateIndex) => (dates[dateIndex].isClosed ? "-" : cell.lines.join("\n"))),
      ]);
      expect(rows[0][0]).toBe(title);
      expect(rows[1]).toEqual(["スタッフ", ...dates.map((date) => date.label)]);
      expect(rows.slice(2)).toEqual(expectedRows);
      expect(sheet.querySelector("dimension")?.getAttribute("ref")).toBe(`A1:${lastColumn}52`);
      expect(sheet.querySelector("pane")?.getAttribute("xSplit")).toBe("1");
      expect(sheet.querySelector("pane")?.getAttribute("ySplit")).toBe("2");
      expect(sheet.querySelector("pane")?.getAttribute("topLeftCell")).toBe("B3");
      expect(sheet.querySelector("pageSetup")?.getAttribute("fitToWidth")).toBe("1");
      expect(sheet.querySelector("pageSetup")?.getAttribute("fitToHeight")).toBe("0");
      const sheetName = index === 0 ? "シフト表（前半）" : "シフト表（後半）";
      expect(workbook.querySelector(`definedName[name="_xlnm.Print_Area"][localSheetId="${index}"]`)?.textContent).toBe(
        `'${sheetName}'!$A1:$${lastColumn}52`,
      );
      expect(
        workbook.querySelector(`definedName[name="_xlnm.Print_Titles"][localSheetId="${index}"]`)?.textContent,
      ).toBe(`'${sheetName}'!$2:$2`);
      widths.push(Number(sheet.querySelector('col[min="2"]')?.getAttribute("width")));
    }
    const fullWidth = ((getExportLayout(schedule).dateColumnWidthPt * 4) / 3 - 5) / 7;
    expect(widths[0]).toBeGreaterThan(fullWidth);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });
});
