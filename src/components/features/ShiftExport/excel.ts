import type { Cell, Worksheet } from "exceljs";
import { fitExportText, getExportLayout } from "./layout";
import type { ExportSchedule } from "./types";

const BLACK = "FF000000";
const CLOSED_BACKGROUND = "FFF0F0F0";

const styleTableCell = (cell: Cell, fontSize: number, isStaffName = false) => {
  cell.font = { name: "Noto Sans JP", size: fontSize, color: { argb: BLACK } };
  cell.alignment = {
    vertical: "middle",
    horizontal: isStaffName ? "left" : "center",
    wrapText: !isStaffName,
    shrinkToFit: isStaffName,
  };
  cell.border = {
    top: { style: "thin", color: { argb: BLACK } },
    left: { style: "thin", color: { argb: BLACK } },
    bottom: { style: "thin", color: { argb: BLACK } },
    right: { style: "thin", color: { argb: BLACK } },
  };
  cell.numFmt = "@";
};

const addScheduleRows = (worksheet: Worksheet, schedule: ExportSchedule) => {
  const layout = getExportLayout(schedule);
  let bodyRowHeight = layout.rowHeightPt;
  const header = worksheet.getRow(3);
  header.height = layout.headerHeightPt;
  header.getCell(1).value = "スタッフ";
  styleTableCell(header.getCell(1), layout.fontSizePt, true);
  schedule.dates.forEach((date, index) => {
    const cell = header.getCell(index + 2);
    cell.value = date.label;
    styleTableCell(cell, 7);
    cell.alignment = { vertical: "middle", horizontal: "center", shrinkToFit: true };
    cell.font = {
      ...cell.font,
      color: { argb: date.dayOfWeek === 0 ? "FFC62828" : date.dayOfWeek === 6 ? "FF1565C0" : BLACK },
    };
  });

  schedule.rows.forEach((staff, index) => {
    const row = worksheet.getRow(index + 4);
    const staffCell = row.getCell(1);
    staffCell.value = staff.staffName;
    styleTableCell(staffCell, layout.fontSizePt, true);
    schedule.dates.forEach((date, dateIndex) => {
      const cell = row.getCell(dateIndex + 2);
      const lines = date.isClosed ? ["-"] : staff.cells[dateIndex].lines;
      // Assigning a string preserves names beginning with '=' as text, never as formulas or hyperlinks.
      cell.value = lines.join("\n");
      // Excel's shrinkToFit does not apply to multiline text. Fit the font explicitly while keeping full values.
      const fontSize = Math.min(
        layout.fontSizePt,
        ...lines.map(
          (line) =>
            fitExportText(
              line,
              layout.dateColumnWidthPt - layout.cellPaddingPt * 2,
              layout.fontSizePt,
              layout.minFontSizePt,
            ).fontSizePt,
        ),
      );
      const cellFontSize = Math.floor(fontSize * 2) / 2;
      styleTableCell(cell, cellFontSize);
      if (schedule.mode === "shiftType") {
        // Full option names must remain editable; allow wrapping only in Excel and reserve the same height for everyone.
        const charactersPerLine = Math.max(
          1,
          Math.floor((layout.dateColumnWidthPt - layout.cellPaddingPt * 2) / cellFontSize),
        );
        const wrappedLineCount = lines.reduce(
          (total, line) =>
            total +
            line
              .split(/\r\n|[\r\n]/)
              .reduce((count, segment) => count + Math.max(1, Math.ceil(segment.length / charactersPerLine)), 0),
          0,
        );
        bodyRowHeight = Math.max(bodyRowHeight, wrappedLineCount * cellFontSize * 1.65 + 8);
      }
      if (date.isClosed) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLOSED_BACKGROUND } };
    });
  });
  schedule.rows.forEach((_, index) => {
    worksheet.getRow(index + 4).height = Math.ceil(bodyRowHeight * 2) / 2;
  });
};

export const createShiftExcel = async (schedule: ExportSchedule): Promise<Blob> => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "シフトリ";
  const layout = getExportLayout(schedule);
  const worksheet = workbook.addWorksheet("シフト表", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3, topLeftCell: "B4", showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 1 / 3, right: 1 / 3, top: 1 / 3, bottom: 1 / 3, header: 0, footer: 1 / 6 },
    },
    headerFooter: { oddFooter: "&C&P / &N" },
  });
  // Excel column widths include 5 px of padding in addition to 7 px per character at the default font.
  worksheet.getColumn(1).width = ((layout.staffColumnWidthPt * 4) / 3 - 5) / 7;
  schedule.dates.forEach((_, index) => {
    worksheet.getColumn(index + 2).width = ((layout.dateColumnWidthPt * 4) / 3 - 5) / 7;
  });
  const lastColumn = schedule.dates.length + 1;
  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.mergeCells(2, 1, 2, lastColumn);
  worksheet.getRow(1).height = 26;
  worksheet.getCell("A1").value = `${schedule.shopName} シフト表`;
  worksheet.getCell("A1").font = { name: "Noto Sans JP", size: 16, bold: true, color: { argb: BLACK } };
  worksheet.getRow(2).height = 22;
  worksheet.getCell("A2").value =
    `${schedule.periodStart.replaceAll("-", "/")} 〜 ${schedule.periodEnd.replaceAll("-", "/")}　${schedule.statusLabel}` +
    (schedule.notificationLabel ? `\n${schedule.notificationLabel}` : "");
  worksheet.getCell("A2").font = { name: "Noto Sans JP", size: 9, color: { argb: BLACK } };
  worksheet.getCell("A2").alignment = { vertical: "middle", wrapText: true };
  addScheduleRows(worksheet, schedule);
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(lastColumn).letter}${schedule.rows.length + 3}`;
  worksheet.pageSetup.printTitlesRow = "3:3";
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
