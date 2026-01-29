// 既存の型を再利用
export type { ShiftData, StaffType } from "../ShiftTableTest/types";

// シフト俯瞰ビュー Props
export type ShiftOverviewProps = {
  /** 店舗ID（スタッフモーダル表示用） */
  shopId: string;
  /** シフト期間の開始日 */
  startDate: string; // "2026-01-27"
  /** シフト期間の終了日 */
  endDate: string; // "2026-02-09"
  /** スタッフ一覧 */
  staffs: import("../ShiftTableTest/types").StaffType[];
  /** 全シフトデータ（期間内全日分） */
  shifts: import("../ShiftTableTest/types").ShiftData[];
  /** 月合計用の全シフトデータ（期間外も含む、オプショナル） */
  allShifts?: import("../ShiftTableTest/types").ShiftData[];
  /** 祝日リスト */
  holidays?: string[]; // ["2026-02-11", ...]
  /** 日付セルクリック時 */
  onDateClick?: (date: string) => void;
};

// ソートモード
export type OverviewSortMode = "default" | "name" | "totalHours";

// スタッフ行表示用データ
export type StaffRowData = {
  staffId: string;
  staffName: string;
  /** 日付ごとの勤務時間 */
  dailyShifts: Map<string, DailyShift | null>; // key: "2026-01-27"
  /** 月別合計時間（分） */
  monthlyTotals: Map<string, number>; // key: "2026-01"
  /** 期間内の総勤務時間（分） */
  totalMinutes: number;
  /** アラート情報 */
  alerts: StaffAlert[];
};

// 1日のシフト情報
export type DailyShift = {
  start: string; // "09:00"
  end: string; // "17:00"
};

// アラート情報（Phase 5 で詳細実装）
export type StaffAlert = {
  type: "week40h" | "consecutive" | "monthLimit";
  /** アラート対象の期間（週の場合は週開始日） */
  targetDate?: string;
  /** 詳細メッセージ */
  message: string;
  /** 実際の値 */
  actualValue: number;
  /** 閾値 */
  threshold: number;
};

// 日付ヘッダー Props
export type OverviewHeaderProps = {
  dates: string[];
  months: string[]; // ["2026-01", "2026-02"]
  holidays: string[];
  sortMode: OverviewSortMode;
  onSortChange: (mode: OverviewSortMode) => void;
};

// スタッフ行 Props
export type StaffRowProps = {
  data: StaffRowData;
  dates: string[];
  months: string[];
  holidays: string[];
  onStaffClick: () => void;
  onDateClick?: (date: string) => void;
};

// 月別合計セル Props
export type MonthSummaryCellProps = {
  totalMinutes: number;
  alerts: StaffAlert[];
  month: string;
};

// ソートメニュー Props
export type SortMenuProps = {
  sortMode: OverviewSortMode;
  onSortChange: (mode: OverviewSortMode) => void;
};
