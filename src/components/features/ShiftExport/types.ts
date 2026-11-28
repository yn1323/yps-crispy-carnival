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
    /** 勤務のポジション。日別のバーの色と名前にだけ使う。 */
    positionId?: string | null;
    /** 勤務中の休憩。日別のバーにだけ出す。 */
    breaks?: { startTime: string; endTime: string }[];
  }[];
  /** 店舗のポジション。日別のバーに使う。名前は2つ以上ある場合だけ書き、色はバーの塗りに使う。 */
  positions?: { id: string; name: string; color?: string }[];
  /** 出力ボタンを押した時点の日付メモ。シフト表本体には入れず、別ページ・別シートの一覧にだけ使う。 */
  dateNotes: { staffId: string; date: string; note: string }[];
  /**
   * 「くわしく」表示で作った勤務か。日付選択の「ポジション」は、くわしく表示のときだけ出す。
   * 「シンプル」の勤務には既定のポジションが入るだけで、全員が同じポジションに見えるためである。
   */
  isDetailMode?: boolean;
  /**
   * 店舗が選んだスタッフの並び替え。日別の行の並びに使う。
   * 「固定」はスタッフの並び順（`staffs`の順）、「勤務時間順」は開始の早い順にする。省くと「固定」として扱う。
   * 一覧とポジションは、スタッフが行、日付が列の表なので、どちらを選んでもスタッフの並び順のままにする。
   */
  staffSortMode?: "fixed" | "workTime";
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

/**
 * 出力する形。「一覧」は人×日付の表、「日別」は1日ごとの勤務のバー。
 * 「ポジション」は日付選択だけの形で、一覧と同じ表のセルに「○」の代わりにポジション名を書く。
 */
export type ExportView = "overview" | "daily" | "positions";

/** 日別のバーの1区間。時刻は分で持つ。 */
export type ExportDailySegment =
  | { kind: "work"; start: number; end: number; label: string; color: string | null }
  | { kind: "break"; start: number; end: number };

export type ExportDailyRow = {
  staffId: string;
  staffName: string;
  /** その日の最初の開始と最後の終了（例: "09:00-17:00"）。 */
  timeLabel: string;
  segments: ExportDailySegment[];
};

/** 時間ごとの人数の1行。区間は時刻の軸の端から端までを、人数が変わる時刻で区切る。 */
export type ExportDailyCountRow = {
  key: string;
  label: string;
  segments: { start: number; end: number; count: number }[];
};

export type ExportDailySheet = {
  date: string;
  title: string;
  /** 勤務のある人。開始の早い順に並べる。 */
  rows: ExportDailyRow[];
  /** 見出しの右に出す「出勤 N人」の文字。人数の行と同じく、削除済みのスタッフを数えない。 */
  workerLabel: string;
  counts: ExportDailyCountRow[];
};

/** 日別の帳票。時刻の軸は期間を通して同じにする。定休日と、勤務が1人もいない日は持たない。 */
export type ExportDaily = {
  axisStart: number;
  axisEnd: number;
  sheets: ExportDailySheet[];
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
  /** 募集にメモがあるか。出力画面で「連絡事項も出力する」を出すかに使う。 */
  hasDateNotes: boolean;
  /** 「連絡事項も出力する」を選んだときだけ、日付順・スタッフ順のメモを持つ。 */
  noteRows: ExportNoteRow[];
  /** PDFとプレビューに出す形。Excelは一覧とポジションだけを出す。 */
  view: ExportView;
  /** この募集で選べる形。2つ以上あるときだけ、出力画面に切り替えを出す。 */
  availableViews: ExportView[];
  /** 日別のバー。時刻を持たない日付選択の募集ではnull。 */
  daily: ExportDaily | null;
};
