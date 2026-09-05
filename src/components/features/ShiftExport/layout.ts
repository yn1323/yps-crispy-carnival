import type { ExportSchedule, ExportStaffRow } from "./types";

export const getExportLayout = (schedule: ExportSchedule) => {
  const pageWidthPt = 841.89;
  const pageHeightPt = 595.28;
  const marginPt = 24;
  const staffColumnWidthPt = 110;
  const titleHeightPt = 60;
  const footerHeightPt = 18;
  const headerHeightPt = 24;
  const fontSizePt = 8;
  const lineHeightPt = 11;
  const rowHeightPt = Math.max(22, schedule.bodyLineCount * lineHeightPt + 8);
  const bodyHeightPt = pageHeightPt - marginPt * 2 - headerHeightPt - footerHeightPt;
  const firstPageCapacity = Math.max(1, Math.floor((bodyHeightPt - titleHeightPt) / rowHeightPt));
  const subsequentPageCapacity = Math.max(1, Math.floor(bodyHeightPt / rowHeightPt));
  const pages: ExportStaffRow[][] = [schedule.rows.slice(0, firstPageCapacity)];
  for (let offset = firstPageCapacity; offset < schedule.rows.length; offset += subsequentPageCapacity) {
    pages.push(schedule.rows.slice(offset, offset + subsequentPageCapacity));
  }

  return {
    pageWidthPt,
    pageHeightPt,
    marginPt,
    staffColumnWidthPt,
    dateColumnWidthPt: (pageWidthPt - marginPt * 2 - staffColumnWidthPt) / Math.max(1, schedule.dates.length),
    rowHeightPt,
    headerHeightPt,
    titleHeightPt,
    footerHeightPt,
    fontSizePt,
    minFontSizePt: 6,
    lineHeightPt,
    cellPaddingPt: 2,
    firstPageCapacity,
    subsequentPageCapacity,
    pages,
  };
};

// These estimates keep the Japanese font and time labels on one line without loading the PDF font in the preview.
const characterWidth = (character: string) => {
  if (/^[0-9]$/.test(character)) return 0.56;
  if (/^[():]$/.test(character)) return 0.35;
  if (/^[mwMW]$/.test(character)) return 0.95;
  return /^[\u0020-\u007e]$/.test(character) ? 0.65 : 1;
};

export const fitExportText = (
  text: string,
  availableWidthPt: number,
  fontSizePt: number,
  minFontSizePt = fontSizePt,
) => {
  const characters = Array.from(text.replace(/[\r\n]+/g, " "));
  const width = characters.reduce((total, character) => total + characterWidth(character), 0);
  const fittedFontSizePt = Math.max(minFontSizePt, Math.min(fontSizePt, availableWidthPt / Math.max(1, width)));
  const availableUnits = availableWidthPt / fittedFontSizePt;
  if (width <= availableUnits) return { text: characters.join(""), fontSizePt: fittedFontSizePt };

  let units = 1;
  let abbreviated = "";
  for (const character of characters) {
    units += characterWidth(character);
    if (units > availableUnits) break;
    abbreviated += character;
  }
  return { text: `${abbreviated}…`, fontSizePt: fittedFontSizePt };
};
