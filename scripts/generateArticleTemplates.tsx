/**
 * 記事で配布するテンプレートの生成スクリプト
 *
 * ArticleSite の記事からリンクする Excel と PDF を public/templates/ に書き出す。
 * - shift-request-sheet.pdf / shift-request-sheet.xlsx: シフト希望表の3形式（時間記入式、○×式、パターン選択）
 * - shift-schedule.xlsx: excel-shift-management-limits のミニ表と同じレイアウトのシフト表
 *
 * 使い方: pnpm templates:articles
 *
 * 注意:
 * - `pnpm build` の最初に実行するため、生成物はコミットしない（public/templates/ は .gitignore 対象）。
 *   ローカルの `pnpm dev` でリンク先を確かめるときは、このscriptを一度実行する。
 * - PDF にはリポジトリ同梱の Noto Sans JP を埋め込むため、日本語フォントのない CI でも同じ内容で生成できる。
 * - 行・列の位置と式は、記事本文のミニ表や関数の表と一致させる。変えるときは記事も同じ変更で直す。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import ExcelJS, { type Cell, type DataValidation, type Worksheet } from "exceljs";

const OUTPUT_DIR = join("public", "templates");
const REQUEST_SHEET_PDF = "shift-request-sheet.pdf";
const REQUEST_SHEET_XLSX = "shift-request-sheet.xlsx";
const SCHEDULE_XLSX = "shift-schedule.xlsx";
const REQUEST_ARTICLE_URL = "https://shiftori.app/articles/shift-request-sheet-template";
const SCHEDULE_ARTICLE_URL = "https://shiftori.app/articles/excel-shift-management-limits";

const PDF_FONT_FAMILY = "Noto Sans JP";
const PDF_FONT_PATH = resolve("public", "fonts", "shift-export", "NotoSansJP-Regular.ttf");

const DAY_COUNT = 31;
const FIRST_DAY_COLUMN = 3; // C列が1日、AG列が31日
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const LABEL_FILL = "FFF2F2F2";
const EXAMPLE_FONT_COLOR = "FF808080";
const BORDER_COLOR = "FFBFBFBF";
const SUNDAY_COLOR = "FFC62828";
const SATURDAY_COLOR = "FF1565C0";

// ---------------------------------------------------------------------------
// シフト希望表
// ---------------------------------------------------------------------------

type RequestFormat = {
  sheetName: string;
  title: string;
  valueLabel: string;
  rule: string;
  pdfExample: { date: string; weekday: string; value: string; note: string };
  excelExample: { values: readonly string[]; notes: readonly string[] };
  columnWidth: number;
  choices?: readonly string[];
  hasPatterns?: boolean;
};

const COMMON_REQUEST_RULES = [
  "空欄は「入れない日」として扱います。",
  "希望を変えるときは、変わった日だけでなく、希望表ごと出し直してください。",
] as const;

const DEFAULT_PATTERNS = [
  { name: "早番", time: "7:00-16:00" },
  { name: "遅番", time: "14:00-22:00" },
  { name: "夜勤", time: "22:00-翌7:00" },
] as const;

const REQUEST_FORMATS: readonly RequestFormat[] = [
  {
    sheetName: "時間記入式",
    title: "シフト希望表（時間記入式）",
    valueLabel: "入れる時間",
    rule: "入れる時間は「10:00-15:00」のように、時刻で書いてください。",
    pdfExample: { date: "7/16", weekday: "木", value: "10:00-15:00", note: "" },
    excelExample: { values: ["10:00-15:00", "", "17:00-22:00"], notes: ["", "", "試験期間なので少なめ"] },
    columnWidth: 12,
  },
  {
    sheetName: "○×式",
    title: "シフト希望表（○×式）",
    valueLabel: "出勤（○・△・×）",
    rule: "○は入れる日、△は条件つきで入れる日、×は入れない日です。△の条件は備考に書いてください。",
    pdfExample: { date: "7/17", weekday: "金", value: "△", note: "15時まで" },
    excelExample: { values: ["○", "△", "×"], notes: ["", "15時まで", ""] },
    columnWidth: 6,
    choices: ["○", "△", "×"],
  },
  {
    sheetName: "パターン選択",
    title: "シフト希望表（パターン選択）",
    valueLabel: "希望パターン",
    rule: "上に書いた勤務パターンの名前で書いてください。どちらでもよい日は「早番、遅番」のように並べます。",
    pdfExample: { date: "7/17", weekday: "金", value: "早番、遅番", note: "どちらでも可" },
    excelExample: { values: ["早番", "早番、遅番", ""], notes: ["", "どちらでも可", ""] },
    columnWidth: 10,
    hasPatterns: true,
  },
];

const requestRules = (format: RequestFormat) => [format.rule, ...COMMON_REQUEST_RULES];

// PDF: 紙で配る1人1枚の形。日付を縦に31行並べる。

// 罫線は外枠の上と左、各セルの右と下だけに引き、隣り合うセルで線が二重にならないようにする。
const PDF_LINE = { borderColor: "#808080" } as const;
const pdfStyles = StyleSheet.create({
  page: { fontFamily: PDF_FONT_FAMILY, fontSize: 9, color: "#1a1a1a", paddingVertical: 30, paddingHorizontal: 32 },
  title: { fontSize: 16, marginBottom: 8 },
  grid: { ...PDF_LINE, borderTopWidth: 0.5, borderLeftWidth: 0.5 },
  row: { flexDirection: "row" },
  cell: { ...PDF_LINE, borderRightWidth: 0.5, borderBottomWidth: 0.5, justifyContent: "center" },
  infoLabel: { width: 64, height: 24, paddingLeft: 6, backgroundColor: "#f2f2f2" },
  infoValue: { flexGrow: 1, flexBasis: 0, height: 24, paddingLeft: 8 },
  guide: { color: "#9a9a9a" },
  rules: { ...PDF_LINE, borderWidth: 0.5, marginVertical: 8, paddingVertical: 5, paddingHorizontal: 8, gap: 2 },
  tableCell: { height: 17, alignItems: "center" },
  headerCell: { backgroundColor: "#f2f2f2" },
  exampleCell: { backgroundColor: "#f7f7f7" },
  exampleText: { color: "#808080", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 14, left: 32, right: 32, fontSize: 7, color: "#9a9a9a" },
});
type PdfStyle = (typeof pdfStyles)[keyof typeof pdfStyles];

// 備考の列は残りの幅を使い、上の欄と右端をそろえる
const PDF_COLUMNS = [
  { key: "date", width: 64 },
  { key: "weekday", width: 40 },
  { key: "value", width: 190 },
  { key: "note", width: undefined },
] as const;

/** ラベルのセルに続けて、手書きで埋める値のセルを並べる。guideは書き方の目安として薄く出す */
function PdfInfoRow({ label, guides }: { label: string; guides: readonly string[] }) {
  return (
    <View style={pdfStyles.row}>
      <View style={[pdfStyles.cell, pdfStyles.infoLabel]}>
        <Text>{label}</Text>
      </View>
      {guides.map((guide, index) => (
        <View key={index} style={[pdfStyles.cell, pdfStyles.infoValue]}>
          <Text style={pdfStyles.guide}>{guide}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfRequestRow({
  values,
  cellStyle,
  textStyle,
}: {
  values: Record<(typeof PDF_COLUMNS)[number]["key"], string>;
  cellStyle?: PdfStyle;
  textStyle?: PdfStyle;
}) {
  return (
    <View style={pdfStyles.row}>
      {PDF_COLUMNS.map((column) => (
        <View
          key={column.key}
          style={[
            pdfStyles.cell,
            pdfStyles.tableCell,
            ...(cellStyle ? [cellStyle] : []),
            column.width ? { width: column.width } : { flexGrow: 1, flexBasis: 0 },
          ]}
        >
          <Text style={textStyle}>{values[column.key]}</Text>
        </View>
      ))}
    </View>
  );
}

function RequestSheetPdfPage({ format }: { format: RequestFormat }) {
  return (
    <Page size="A4" style={pdfStyles.page}>
      <Text style={pdfStyles.title}>{format.title}</Text>
      <View style={pdfStyles.grid}>
        <PdfInfoRow label="対象期間" guides={["　　月　　日 〜 　　月　　日"]} />
        <PdfInfoRow label="締切" guides={["　　月　　日（　　）　　時まで"]} />
        <PdfInfoRow label="名前" guides={[""]} />
        {format.hasPatterns && (
          <PdfInfoRow label="勤務パターン" guides={Array(3).fill("　　　　＝　　:　　-　　:　　")} />
        )}
      </View>
      <View style={pdfStyles.rules}>
        <Text>記入のルール</Text>
        {requestRules(format).map((rule) => (
          <Text key={rule}>・{rule}</Text>
        ))}
      </View>
      <View style={pdfStyles.grid}>
        <PdfRequestRow
          cellStyle={pdfStyles.headerCell}
          values={{ date: "日付", weekday: "曜日", value: format.valueLabel, note: "備考" }}
        />
        <PdfRequestRow
          cellStyle={pdfStyles.exampleCell}
          textStyle={pdfStyles.exampleText}
          values={{ ...format.pdfExample, date: `例）${format.pdfExample.date}` }}
        />
        {Array.from({ length: DAY_COUNT }, (_, index) => (
          <PdfRequestRow key={index} values={{ date: "　/", weekday: "", value: "", note: "" }} />
        ))}
      </View>
      <Text style={pdfStyles.footer} fixed>
        シフトリ　{REQUEST_ARTICLE_URL}
      </Text>
    </Page>
  );
}

async function createRequestSheetPdf(): Promise<Buffer> {
  Font.register({ family: PDF_FONT_FAMILY, src: PDF_FONT_PATH });
  // 英単語向けのハイフネーションで日本語の行が分割されないようにする
  Font.registerHyphenationCallback((word) => [word]);
  return renderToBuffer(
    <Document title="シフト希望表テンプレート" author="シフトリ" language="ja">
      {REQUEST_FORMATS.map((format) => (
        <RequestSheetPdfPage key={format.sheetName} format={format} />
      ))}
    </Document>,
  );
}

// ---------------------------------------------------------------------------
// Excel 共通
// ---------------------------------------------------------------------------

const columnLetter = (column: number) => {
  let letter = "";
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letter = String.fromCharCode(65 + ((rest - 1) % 26)) + letter;
  }
  return letter;
};

const dayColumns = Array.from({ length: DAY_COUNT }, (_, index) => FIRST_DAY_COLUMN + index);
const FIRST_DAY = columnLetter(FIRST_DAY_COLUMN);
const LAST_DAY = columnLetter(FIRST_DAY_COLUMN + DAY_COUNT - 1);

const thinBorder = { style: "thin", color: { argb: BORDER_COLOR } } as const;
const boxBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

function styleGridCell(cell: Cell, options: { label?: boolean; example?: boolean } = {}) {
  cell.border = boxBorder;
  cell.alignment = { vertical: "middle", horizontal: options.label ? "left" : "center", shrinkToFit: true };
  if (options.label) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_FILL } };
  }
  if (options.example) {
    cell.font = { color: { argb: EXAMPLE_FONT_COLOR }, italic: true };
  }
}

/**
 * 対象月の1日を入れたセルから、日付の行と曜日の行を式で埋める。
 * 月の日数を超える列は空欄にし、どの表計算ソフトでも同じ結果になるようWEEKDAY+CHOOSEで曜日を出す。
 */
function addDayHeaderRows(
  worksheet: Worksheet,
  options: { monthCell: string; dayRow: number; weekdayRow: number; month?: Date },
) {
  const { monthCell, dayRow, weekdayRow, month } = options;
  const daysInMonth = month ? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate() : 0;

  for (const [index, column] of dayColumns.entries()) {
    const letter = columnLetter(column);
    const previous = columnLetter(column - 1);
    const date =
      month && index < daysInMonth
        ? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1))
        : undefined;

    const dayCell = worksheet.getCell(`${letter}${dayRow}`);
    dayCell.value = {
      formula:
        index === 0
          ? `IF(${monthCell}="","",${monthCell})`
          : `IF(${previous}${dayRow}="","",IF(DAY(${previous}${dayRow}+1)=1,"",${previous}${dayRow}+1))`,
      result: date ?? "",
    };
    dayCell.numFmt = "d";
    styleGridCell(dayCell);

    const weekdayCell = worksheet.getCell(`${letter}${weekdayRow}`);
    weekdayCell.value = {
      formula: `IF(${letter}${dayRow}="","",CHOOSE(WEEKDAY(${letter}${dayRow}),${WEEKDAY_LABELS.map((label) => `"${label}"`).join(",")}))`,
      result: date ? WEEKDAY_LABELS[date.getUTCDay()] : "",
    };
    styleGridCell(weekdayCell);
  }

  const weekdayRange = `${FIRST_DAY}${weekdayRow}:${LAST_DAY}${weekdayRow}`;
  worksheet.addConditionalFormatting({
    ref: weekdayRange,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`${FIRST_DAY}${weekdayRow}="日"`],
        style: { font: { color: { argb: SUNDAY_COLOR } } },
      },
      {
        type: "expression",
        priority: 2,
        formulae: [`${FIRST_DAY}${weekdayRow}="土"`],
        style: { font: { color: { argb: SATURDAY_COLOR } } },
      },
    ],
  });
}

/** 日付の列（C〜AG列）の各セルへ同じ入力規則を付ける。exceljsの型定義はセル単位の入力規則だけを公開している */
function addDayValidation(worksheet: Worksheet, rows: readonly number[], validation: DataValidation) {
  for (const row of rows) {
    for (const column of dayColumns) worksheet.getCell(row, column).dataValidation = validation;
  }
}

function setLandscapeA4(worksheet: Worksheet) {
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };
}

function addNotes(worksheet: Worksheet, startRow: number, notes: readonly string[]) {
  for (const [index, note] of notes.entries()) {
    const cell = worksheet.getCell(`A${startRow + index}`);
    cell.value = note;
    cell.font = { color: { argb: EXAMPLE_FONT_COLOR }, size: 10 };
  }
}

// Excel: データで集める形。日付をシフト表と同じC〜AG列に横へ並べ、希望の行をそのまま貼り付けられるようにする。

function addRequestWorksheet(workbook: ExcelJS.Workbook, format: RequestFormat) {
  const worksheet = workbook.addWorksheet(format.sheetName, { views: [{ state: "frozen", xSplit: 2, ySplit: 0 }] });
  worksheet.getColumn(1).width = 10;
  worksheet.getColumn(2).width = 4;
  for (const column of dayColumns) worksheet.getColumn(column).width = format.columnWidth;

  worksheet.getCell("A1").value = format.title;
  worksheet.getCell("A1").font = { size: 14, bold: true };

  const labelRow = (row: number, label: string) => {
    worksheet.mergeCells(`A${row}:B${row}`);
    const cell = worksheet.getCell(`A${row}`);
    cell.value = label;
    styleGridCell(cell, { label: true });
  };
  const inputBlock = (row: number, from: string, to: string) => {
    worksheet.mergeCells(`${from}${row}:${to}${row}`);
    const cell = worksheet.getCell(`${from}${row}`);
    cell.border = boxBorder;
    cell.alignment = { vertical: "middle", horizontal: "left" };
    return cell;
  };

  labelRow(2, "対象月");
  const monthCell = inputBlock(2, "C", "F");
  monthCell.numFmt = 'yyyy"年"m"月"';
  worksheet.getCell("H2").value = "← 対象月の1日（例：2026/7/1）を入れると、日付と曜日が入ります";
  worksheet.getCell("H2").font = { color: { argb: EXAMPLE_FONT_COLOR } };
  labelRow(3, "締切");
  inputBlock(3, "C", "F");
  worksheet.getCell("H3").value = "例：7/5（日）21時まで";
  worksheet.getCell("H3").font = { color: { argb: EXAMPLE_FONT_COLOR } };
  labelRow(4, "名前");
  inputBlock(4, "C", "F");

  let row = 5;
  if (format.hasPatterns) {
    for (const [index, pattern] of DEFAULT_PATTERNS.entries()) {
      labelRow(row + index, index === 0 ? "勤務パターン" : "");
      inputBlock(row + index, "C", "D").value = pattern.name;
      inputBlock(row + index, "E", "G").value = pattern.time;
    }
    worksheet.getCell(`I${row}`).value = "← 店の勤務パターンの名前と時間に書き換えてください";
    worksheet.getCell(`I${row}`).font = { color: { argb: EXAMPLE_FONT_COLOR } };
    row += DEFAULT_PATTERNS.length;
  }

  row += 1;
  worksheet.getCell(`A${row}`).value = "記入のルール";
  worksheet.getCell(`A${row}`).font = { bold: true };
  for (const rule of requestRules(format)) {
    row += 1;
    worksheet.getCell(`A${row}`).value = `・${rule}`;
  }

  const dayRow = row + 2;
  const weekdayRow = dayRow + 1;
  const exampleValueRow = dayRow + 2;
  const exampleNoteRow = dayRow + 3;
  const valueRow = dayRow + 4;
  const noteRow = dayRow + 5;

  labelRow(dayRow, "日付");
  labelRow(weekdayRow, "曜日");
  labelRow(exampleValueRow, "記入例");
  labelRow(exampleNoteRow, "例の備考");
  labelRow(valueRow, "希望");
  labelRow(noteRow, "備考");
  addDayHeaderRows(worksheet, { monthCell: "$C$2", dayRow, weekdayRow });

  for (const [index, column] of dayColumns.entries()) {
    const letter = columnLetter(column);
    const exampleValue = worksheet.getCell(`${letter}${exampleValueRow}`);
    exampleValue.value = format.excelExample.values[index] ?? "";
    styleGridCell(exampleValue, { example: true });
    const exampleNote = worksheet.getCell(`${letter}${exampleNoteRow}`);
    exampleNote.value = format.excelExample.notes[index] ?? "";
    styleGridCell(exampleNote, { example: true });
    styleGridCell(worksheet.getCell(`${letter}${valueRow}`));
    styleGridCell(worksheet.getCell(`${letter}${noteRow}`));
  }

  if (format.choices) {
    addDayValidation(worksheet, [valueRow], {
      type: "list",
      allowBlank: true,
      formulae: [`"${format.choices.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "記号を選んでください",
      error: `${format.choices.join("、")}のどれかを選んでください。`,
    });
  }
  if (format.hasPatterns) {
    // 「早番、遅番」のように複数を並べる日もあるため、一覧から選べるだけにして入力は制限しない
    addDayValidation(worksheet, [valueRow], {
      type: "list",
      allowBlank: true,
      formulae: [`$C$5:$C$${4 + DEFAULT_PATTERNS.length}`],
      showErrorMessage: false,
    });
  }

  addNotes(worksheet, noteRow + 2, [
    `${valueRow}行目の${FIRST_DAY}〜${LAST_DAY}列をコピーすると、シフト表の同じスタッフの行（${FIRST_DAY}〜${LAST_DAY}列）へそのまま貼り付けられます。`,
    `日付を横に並べたシフト表のテンプレートは ${SCHEDULE_ARTICLE_URL} で配布しています。`,
  ]);
  setLandscapeA4(worksheet);
}

async function createRequestSheetXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "シフトリ";
  workbook.calcProperties.fullCalcOnLoad = true;
  for (const format of REQUEST_FORMATS) addRequestWorksheet(workbook, format);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// シフト表
// ---------------------------------------------------------------------------

type ShiftCode = "早" | "遅" | "休";

const SHIFT_CODES: readonly ShiftCode[] = ["早", "遅", "休"];
const SHIFT_HOURS = { 早: 6, 遅: 5 } as const;
const FIRST_STAFF_ROW = 3;
const STAFF_ROW_COUNT = 10;
const LAST_STAFF_ROW = FIRST_STAFF_ROW + STAFF_ROW_COUNT - 1; // 12行目
const REQUIRED_ROW = LAST_STAFF_ROW + 1; // 13行目
const WORKING_ROW = REQUIRED_ROW + 1; // 14行目
const EARLY_ROW = WORKING_ROW + 1; // 15行目
const LATE_ROW = EARLY_ROW + 1; // 16行目
const WORK_DAYS_COLUMN = columnLetter(FIRST_DAY_COLUMN + DAY_COUNT); // AH列
const WORK_HOURS_COLUMN = columnLetter(FIRST_DAY_COLUMN + DAY_COUNT + 1); // AI列

type ScheduleSample = {
  month: Date;
  /** 曜日（0=日曜）ごとの必要人数 */
  requiredByWeekday: readonly number[];
  /** 曜日（0=日曜）ごとの勤務。書いていない曜日は休み */
  staff: readonly { name: string; role: string; week: Partial<Record<number, Exclude<ShiftCode, "休">>> }[];
};

// 記事のミニ表は、この記入例の2026年7月1日（水）、2日（木）、31日（金）の列とAさん、Jさんの行を抜き出したもの。
const SCHEDULE_SAMPLE: ScheduleSample = {
  month: new Date(Date.UTC(2026, 6, 1)),
  requiredByWeekday: [4, 3, 3, 3, 3, 3, 4],
  staff: [
    { name: "Aさん", role: "キッチン", week: { 1: "早", 3: "早", 5: "早", 6: "早" } },
    { name: "Bさん", role: "キッチン", week: { 0: "遅", 2: "遅", 4: "遅", 6: "遅" } },
    { name: "Cさん", role: "ホール", week: { 0: "早", 1: "遅", 2: "早" } },
    { name: "Dさん", role: "ホール", week: { 3: "遅", 5: "遅", 6: "早" } },
    { name: "Eさん", role: "キッチン", week: { 0: "早", 4: "早" } },
    { name: "Fさん", role: "ホール", week: { 1: "遅", 6: "遅" } },
    { name: "Gさん", role: "ホール", week: { 0: "遅", 2: "遅" } },
    { name: "Hさん", role: "キッチン", week: { 3: "早" } },
    { name: "Iさん", role: "ホール", week: { 5: "早" } },
    { name: "Jさん", role: "ホール", week: { 1: "早", 5: "遅" } },
  ],
};

const countWorking = (codes: readonly (ShiftCode | "")[]) =>
  codes.filter((code) => code !== "" && code !== "休").length;
const countCode = (codes: readonly (ShiftCode | "")[], target: ShiftCode) =>
  codes.filter((code) => code === target).length;

function addScheduleWorksheet(workbook: ExcelJS.Workbook, name: string, sample?: ScheduleSample) {
  const worksheet = workbook.addWorksheet(name, { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });
  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 9;
  for (const column of dayColumns) worksheet.getColumn(column).width = 4.5;
  worksheet.getColumn(WORK_DAYS_COLUMN).width = 9;
  worksheet.getColumn(WORK_HOURS_COLUMN).width = 9;

  const daysInMonth = sample
    ? new Date(Date.UTC(sample.month.getUTCFullYear(), sample.month.getUTCMonth() + 1, 0)).getUTCDate()
    : 0;
  const weekdayOf = (dayIndex: number) =>
    sample
      ? new Date(Date.UTC(sample.month.getUTCFullYear(), sample.month.getUTCMonth(), dayIndex + 1)).getUTCDay()
      : 0;
  const codeOf = (staffIndex: number, dayIndex: number): ShiftCode | "" => {
    const staff = sample?.staff[staffIndex];
    if (!staff || dayIndex >= daysInMonth) return "";
    return staff.week[weekdayOf(dayIndex)] ?? "休";
  };
  const codesOfDay = (dayIndex: number) =>
    Array.from({ length: STAFF_ROW_COUNT }, (_, staffIndex) => codeOf(staffIndex, dayIndex));

  const monthCell = worksheet.getCell("A1");
  monthCell.value = sample?.month ?? null;
  monthCell.numFmt = 'yyyy"年"m"月"';
  monthCell.note = "対象月の1日（例：2026/7/1）を入れると、1行目に日付、2行目に曜日が入ります。";
  monthCell.border = boxBorder;
  monthCell.font = { bold: true };
  styleGridCell(worksheet.getCell("B1"));
  addDayHeaderRows(worksheet, { monthCell: "$A$1", dayRow: 1, weekdayRow: 2, month: sample?.month });

  for (const [letter, label] of [
    ["A", "名前"],
    ["B", "担当"],
  ] as const) {
    const cell = worksheet.getCell(`${letter}2`);
    cell.value = label;
    styleGridCell(cell, { label: true });
  }
  for (const [letter, label] of [
    [WORK_DAYS_COLUMN, "出勤日数"],
    [WORK_HOURS_COLUMN, "勤務時間"],
  ] as const) {
    worksheet.mergeCells(`${letter}1:${letter}2`);
    const cell = worksheet.getCell(`${letter}1`);
    cell.value = label;
    styleGridCell(cell, { label: true });
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  for (let staffIndex = 0; staffIndex < STAFF_ROW_COUNT; staffIndex++) {
    const row = FIRST_STAFF_ROW + staffIndex;
    const staff = sample?.staff[staffIndex];
    worksheet.getCell(`A${row}`).value = staff?.name ?? "";
    worksheet.getCell(`B${row}`).value = staff?.role ?? "";
    styleGridCell(worksheet.getCell(`A${row}`));
    styleGridCell(worksheet.getCell(`B${row}`));
    worksheet.getCell(`A${row}`).alignment = { vertical: "middle", horizontal: "left" };

    const codes = dayColumns.map((_, dayIndex) => codeOf(staffIndex, dayIndex));
    for (const [dayIndex, column] of dayColumns.entries()) {
      const cell = worksheet.getCell(`${columnLetter(column)}${row}`);
      cell.value = codes[dayIndex] ?? "";
      styleGridCell(cell);
    }
    const range = `${FIRST_DAY}${row}:${LAST_DAY}${row}`;
    const workDays = worksheet.getCell(`${WORK_DAYS_COLUMN}${row}`);
    workDays.value = { formula: `COUNTA(${range})-COUNTIF(${range},"休")`, result: countWorking(codes) };
    styleGridCell(workDays);
    const workHours = worksheet.getCell(`${WORK_HOURS_COLUMN}${row}`);
    workHours.value = {
      formula: `COUNTIF(${range},"早")*${SHIFT_HOURS.早}+COUNTIF(${range},"遅")*${SHIFT_HOURS.遅}`,
      result: countCode(codes, "早") * SHIFT_HOURS.早 + countCode(codes, "遅") * SHIFT_HOURS.遅,
    };
    styleGridCell(workHours);
  }

  const staffRows = Array.from({ length: STAFF_ROW_COUNT }, (_, index) => FIRST_STAFF_ROW + index);
  addDayValidation(worksheet, staffRows, {
    type: "list",
    allowBlank: true,
    formulae: [`"${SHIFT_CODES.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "勤務記号を選んでください",
    error: `${SHIFT_CODES.join("、")}のどれかを選んでください。`,
  });

  const summaryRows = [
    { row: REQUIRED_ROW, label: "必要人数" },
    { row: WORKING_ROW, label: "出勤人数" },
    { row: EARLY_ROW, label: "早番の人数" },
    { row: LATE_ROW, label: "遅番の人数" },
  ] as const;
  for (const { row, label } of summaryRows) {
    worksheet.mergeCells(`A${row}:B${row}`);
    const cell = worksheet.getCell(`A${row}`);
    cell.value = label;
    styleGridCell(cell, { label: true });
  }

  for (const [dayIndex, column] of dayColumns.entries()) {
    const letter = columnLetter(column);
    const range = `${letter}${FIRST_STAFF_ROW}:${letter}${LAST_STAFF_ROW}`;
    const codes = codesOfDay(dayIndex);
    const hasDate = dayIndex < daysInMonth;

    const required = worksheet.getCell(`${letter}${REQUIRED_ROW}`);
    required.value = sample && hasDate ? (sample.requiredByWeekday[weekdayOf(dayIndex)] ?? null) : null;
    styleGridCell(required);

    const cells = [
      [WORKING_ROW, `COUNTA(${range})-COUNTIF(${range},"休")`, countWorking(codes)],
      [EARLY_ROW, `COUNTIF(${range},"早")`, countCode(codes, "早")],
      [LATE_ROW, `COUNTIF(${range},"遅")`, countCode(codes, "遅")],
    ] as const;
    for (const [row, formula, result] of cells) {
      const cell = worksheet.getCell(`${letter}${row}`);
      cell.value = { formula, result };
      styleGridCell(cell);
    }
  }

  worksheet.addConditionalFormatting({
    ref: `${FIRST_DAY}${WORKING_ROW}:${LAST_DAY}${WORKING_ROW}`,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`${FIRST_DAY}${WORKING_ROW}<${FIRST_DAY}${REQUIRED_ROW}`],
        style: {
          font: { color: { argb: "FF9C0006" }, bold: true },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
        },
      },
    ],
  });

  addNotes(worksheet, LATE_ROW + 2, [
    "A1に対象月の1日（例：2026/7/1）を入れると、1行目に日付、2行目に曜日が入ります。",
    `勤務記号は、${SHIFT_CODES.join("、")}をリストから選びます。休みの日も「休」を入れてください。`,
    `勤務時間（${WORK_HOURS_COLUMN}列）は、早番${SHIFT_HOURS.早}時間、遅番${SHIFT_HOURS.遅}時間で計算しています。店の勤務時間に合わせて、式の${SHIFT_HOURS.早}と${SHIFT_HOURS.遅}を書き換えてください。`,
    `${REQUIRED_ROW}行目に必要人数を入れると、出勤人数が足りない日の${WORKING_ROW}行目が赤くなります。`,
    `スタッフが${STAFF_ROW_COUNT + 1}人以上いるときは、${LAST_STAFF_ROW}行目の上に行を挿入すると、式の範囲も一緒に広がります。`,
    `作り方と式の説明：${SCHEDULE_ARTICLE_URL}`,
  ]);
  setLandscapeA4(worksheet);
}

async function createScheduleXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "シフトリ";
  workbook.calcProperties.fullCalcOnLoad = true;
  addScheduleWorksheet(workbook, "シフト表");
  addScheduleWorksheet(workbook, "記入例", SCHEDULE_SAMPLE);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// 生成物の確認
// ---------------------------------------------------------------------------

function assertTemplate(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[templates] ${message}`);
}

function assertPdf(bytes: Buffer, expectedPages: number) {
  const source = bytes.toString("latin1");
  assertTemplate(source.startsWith("%PDF-"), `${REQUEST_SHEET_PDF} is not a PDF`);
  const pages = source.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
  assertTemplate(pages === expectedPages, `${REQUEST_SHEET_PDF} has ${pages} pages (expected ${expectedPages})`);
}

async function assertXlsx(fileName: string, bytes: Buffer, expected: Record<string, Record<string, string>>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  assertTemplate(
    JSON.stringify(sheetNames) === JSON.stringify(Object.keys(expected)),
    `${fileName} has sheets ${sheetNames.join(", ")}`,
  );
  for (const [sheetName, formulas] of Object.entries(expected)) {
    const worksheet = workbook.getWorksheet(sheetName);
    for (const [address, formula] of Object.entries(formulas)) {
      const actual = worksheet?.getCell(address).formula;
      assertTemplate(actual === formula, `${fileName} ${sheetName}!${address} is ${actual} (expected ${formula})`);
    }
  }
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const [requestPdf, requestXlsx, scheduleXlsx] = await Promise.all([
    createRequestSheetPdf(),
    createRequestSheetXlsx(),
    createScheduleXlsx(),
  ]);

  assertPdf(requestPdf, REQUEST_FORMATS.length);
  await assertXlsx(
    REQUEST_SHEET_XLSX,
    requestXlsx,
    Object.fromEntries(REQUEST_FORMATS.map((format) => [format.sheetName, {}])),
  );
  // 記事の関数の表と同じ式が同じセルに入っていることを確かめる
  const articleFormulas = {
    AH3: 'COUNTA(C3:AG3)-COUNTIF(C3:AG3,"休")',
    AI3: 'COUNTIF(C3:AG3,"早")*6+COUNTIF(C3:AG3,"遅")*5',
    C14: 'COUNTA(C3:C12)-COUNTIF(C3:C12,"休")',
    C15: 'COUNTIF(C3:C12,"早")',
  };
  await assertXlsx(SCHEDULE_XLSX, scheduleXlsx, { シフト表: articleFormulas, 記入例: articleFormulas });

  await Promise.all([
    writeFile(join(OUTPUT_DIR, REQUEST_SHEET_PDF), requestPdf),
    writeFile(join(OUTPUT_DIR, REQUEST_SHEET_XLSX), requestXlsx),
    writeFile(join(OUTPUT_DIR, SCHEDULE_XLSX), scheduleXlsx),
  ]);
  console.log(`[templates] Wrote ${REQUEST_SHEET_PDF}, ${REQUEST_SHEET_XLSX}, ${SCHEDULE_XLSX} to ${OUTPUT_DIR}`);
}

await main();
