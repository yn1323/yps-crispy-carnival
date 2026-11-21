import { fitExportText } from "./layout";
import type { ExportDaily, ExportDailyCountRow, ExportDailyRow, ExportDailySheet } from "./types";

// 日別のバーの帳票の、ページ割りと座標。プレビューとPDFは同じ値で描く。

const HOUR_LABEL_MIN_WIDTH_PT = 16;
const SEGMENT_LABEL_MIN_WIDTH_PT = 14;
const SEGMENT_LABEL_PADDING_PT = 2;
const BREAK_LABEL_PADDING_PT = 1;
const NO_POSITION_FILL = "#e6e6e6";
/** ポジションの色へ混ぜる白の割合。 */
const SEGMENT_FILL_WHITE_RATIO = 0.6;

export const getExportDailyLayout = (daily: ExportDaily) => {
  const pageWidthPt = 841.89;
  const pageHeightPt = 595.28;
  const marginPt = 24;
  const titleHeightPt = 32;
  /** 見出しの右の「出勤 N人」の幅。題名はこの幅を除いた範囲に収める。 */
  const workerLabelWidthPt = 72;
  const footerHeightPt = 18;
  const nameColumnWidthPt = 96;
  const timeColumnWidthPt = 60;
  const axisHeightPt = 16;
  const rowHeightPt = 18;
  const countRowHeightPt = 14;
  const countGapPt = 6;
  const chartWidthPt = pageWidthPt - marginPt * 2 - nameColumnWidthPt - timeColumnWidthPt;
  // バーが列の右の罫線に重ならないよう、罫線の分だけ内側に描く。
  const plotWidthPt = chartWidthPt - 1;
  const axisMinutes = Math.max(60, daily.axisEnd - daily.axisStart);
  const hourWidthPt = (plotWidthPt * 60) / axisMinutes;
  const hourLabelStep = Math.max(1, Math.ceil(HOUR_LABEL_MIN_WIDTH_PT / hourWidthPt));
  const hours = Array.from({ length: axisMinutes / 60 }, (_, index) => {
    const minute = daily.axisStart + index * 60;
    return {
      minute,
      leftPt: index * hourWidthPt,
      // 一覧の「26:00」と同じく、24時より後も続きの数字で書く。
      label: index % hourLabelStep === 0 ? String(minute / 60) : "",
    };
  });
  return {
    pageWidthPt,
    pageHeightPt,
    marginPt,
    titleHeightPt,
    workerLabelWidthPt,
    footerHeightPt,
    nameColumnWidthPt,
    timeColumnWidthPt,
    chartWidthPt,
    axisHeightPt,
    rowHeightPt,
    countRowHeightPt,
    countGapPt,
    fontSizePt: 8,
    segmentFontSizePt: 7,
    minFontSizePt: 6,
    cellPaddingPt: 2,
    segmentInsetPt: 2,
    hourWidthPt,
    hours,
    /** 勤務の行を置ける高さ。人数の行の分は、日ごとにここから引く。 */
    bodyHeightPt: pageHeightPt - marginPt * 2 - titleHeightPt - axisHeightPt - footerHeightPt,
    toChartPt: (minute: number) => ((minute - daily.axisStart) / axisMinutes) * plotWidthPt,
  };
};

export type ExportDailyLayout = ReturnType<typeof getExportDailyLayout>;

export type ExportDailyPage = {
  sheet: ExportDailySheet;
  /** 1ページに置ける行数ぶんの行。勤務のある人のあとは、書き込み用の空行（null）で埋める。 */
  rows: (ExportDailyRow | null)[];
  title: string;
};

/** 1日を1ページ以上に割る。人数の行は、その日のすべてのページの下に置く。 */
export const getExportDailyPages = (daily: ExportDaily, layout = getExportDailyLayout(daily)): ExportDailyPage[] =>
  daily.sheets.flatMap((sheet) => {
    const countsHeightPt = sheet.counts.length * layout.countRowHeightPt + layout.countGapPt;
    const capacity = Math.max(1, Math.floor((layout.bodyHeightPt - countsHeightPt) / layout.rowHeightPt));
    const pageCount = Math.max(1, Math.ceil(sheet.rows.length / capacity));
    return Array.from({ length: pageCount }, (_, index) => {
      const rows: (ExportDailyRow | null)[] = sheet.rows.slice(index * capacity, (index + 1) * capacity);
      while (rows.length < capacity) rows.push(null);
      return { sheet, rows, title: pageCount > 1 ? `${sheet.title}（${index + 1}/${pageCount}）` : sheet.title };
    });
  });

/** バーの中に書く文字。幅に収まらない分は省略し、狭い区間には書かない。 */
export const fitDailySegmentLabel = (label: string, widthPt: number, layout: ExportDailyLayout) => {
  if (!label || widthPt < SEGMENT_LABEL_MIN_WIDTH_PT) return null;
  const fitted = fitExportText(
    label,
    widthPt - SEGMENT_LABEL_PADDING_PT * 2,
    layout.segmentFontSizePt,
    layout.minFontSizePt,
  );
  return fitted.text === "…" ? null : fitted;
};

/** 休憩の区間に書く「休」。斜線の上でも読めるよう白い地に載せ、1文字が入らない狭い休憩には書かない。 */
export const BREAK_LABEL = "休";
export const fitDailyBreakLabel = (widthPt: number, layout: ExportDailyLayout) => {
  const fontSizePt = [layout.segmentFontSizePt, layout.minFontSizePt].find(
    (size) => widthPt >= size + BREAK_LABEL_PADDING_PT * 2,
  );
  if (!fontSizePt) return null;
  // 白い地は、文字の行の高さ（文字の1.2倍）より高くする。同じ高さだと、PDFで文字が枠に入らず落ちる。
  return { fontSizePt, boxWidthPt: fontSizePt + BREAK_LABEL_PADDING_PT * 2, boxHeightPt: fontSizePt + 3 };
};

/**
 * 勤務のバーの塗り。バーの中の黒い文字が読めるよう、ポジションの色を白で薄めて使う。
 * 色を持たない勤務は灰色にする。
 */
export const getDailySegmentFill = (color: string | null): string => {
  if (!color) return NO_POSITION_FILL;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.round(channel + (255 - channel) * SEGMENT_FILL_WHITE_RATIO)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** 休憩の斜線。幅と高さの四角の中に収まる、右上がりの線の端点を返す。PDFは模様の塗りを持たないため線で描く。 */
export const getDailyHatchLines = (widthPt: number, heightPt: number, spacingPt = 3) => {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let offset = -heightPt + spacingPt; offset < widthPt; offset += spacingPt) {
    const x1 = Math.max(offset, 0);
    const x2 = Math.min(offset + heightPt, widthPt);
    if (x2 <= x1) continue;
    lines.push({ x1, y1: heightPt - (x1 - offset), x2, y2: heightPt - (x2 - offset) });
  }
  return lines;
};

/** 人数の行に書く数字。0は、その行で最初に人がいる時間と最後に人がいる時間の間にだけ書く。 */
export const getDailyCountLabels = (row: ExportDailyCountRow): string[] => {
  const present = row.segments.map(({ count }) => count > 0);
  const first = present.indexOf(true);
  const last = present.lastIndexOf(true);
  return row.segments.map(({ count }, index) => {
    if (count > 0) return String(count);
    return first < index && index < last ? "0" : "";
  });
};
