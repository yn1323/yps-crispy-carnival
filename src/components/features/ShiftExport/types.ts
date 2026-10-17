import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type ShiftExportData = {
  shopName: string;
  recruitment: {
    periodStart: string;
    periodEnd: string;
    shopClosedDates: string[];
    submissionPattern: ShiftSubmissionPattern;
  };
  staffs: { id: string; name: string; isRemoved: boolean }[];
  assignments: {
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    optionId: string | null;
  }[];
  /** 出力ボタンを押した時点の日付メモ。シフト表本体には入れず、別ページ・別シートの一覧にだけ使う。 */
  dateNotes: { staffId: string; date: string; note: string }[];
};

export type ExportDate = {
  date: string;
  label: string;
  dayOfWeek: number;
  isClosed: boolean;
};

export type ExportStaffRow = {
  staffId: string;
  staffName: string;
  cells: { lines: string[] }[];
};

export type ExportNoteRow = {
  key: string;
  dateLabel: string;
  staffName: string;
  note: string;
};

/** The full text is retained here; only the preview and PDF may abbreviate it. */
export type ExportSchedule = {
  shopName: string;
  periodStart: string;
  periodEnd: string;
  mode: ShiftSubmissionPattern["kind"];
  splitPeriod: boolean;
  bodyLineCount: number;
  dates: ExportDate[];
  rows: ExportStaffRow[];
  /** 募集にメモがあるか。出力画面で「メモ一覧を付ける」を出すかに使う。 */
  hasDateNotes: boolean;
  /** 「メモ一覧を付ける」を選んだときだけ、日付順・スタッフ順のメモを持つ。 */
  noteRows: ExportNoteRow[];
};
