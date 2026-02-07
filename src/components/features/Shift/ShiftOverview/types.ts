// 既存の型を再利用
export type { ShiftData, StaffType } from "../ShiftTableTest/types";

// 必要人員設定データ（convex/requiredStaffing テーブルの1レコードに対応）
export type RequiredStaffingData = {
  dayOfWeek: number; // 0=日, 1=月, ..., 6=土
  slots: {
    hour: number; // 0-23
    position: string;
    requiredCount: number;
  }[];
};

// シフト俯瞰ビュー Props
export type ShiftOverviewProps = {
  /** 店舗ID（スタッフモーダル表示用） */
  shopId: string;
  /** 表示対象日付の配列（日毎ビューと共有） */
  dates: string[];
  /** スタッフ一覧（親で並び替え済み） */
  staffs: import("../ShiftTableTest/types").StaffType[];
  /** 全シフトデータ（期間内全日分） */
  shifts: import("../ShiftTableTest/types").ShiftData[];
  /** 月合計用の全シフトデータ（期間外も含む、オプショナル） */
  allShifts?: import("../ShiftTableTest/types").ShiftData[];
  /** 祝日リスト */
  holidays?: string[]; // ["2026-02-11", ...]
  /** 日付セルクリック時 */
  onDateClick?: (date: string) => void;
  /** 必要人員設定（充足度カラー表示用） */
  requiredStaffing?: RequiredStaffingData[];
  /** ソートモード（日毎ビューと共通） */
  sortMode?: import("../ShiftTableTest/types").SortMode | null;
  /** ソート変更コールバック */
  onSortModeChange?: (mode: import("../ShiftTableTest/types").SortMode) => void;
};

// スタッフ行表示用データ
export type StaffRowData = {
  staffId: string;
  staffName: string;
  /** スタッフがシフト希望を提出済みか */
  isSubmitted: boolean;
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
  /** 未提出スタッフ数 */
  unsubmittedCount: number;
  /** ソートモード（日毎ビューと共通） */
  sortMode: import("../ShiftTableTest/types").SortMode | null;
  /** ソート変更コールバック */
  onSortModeChange: (mode: import("../ShiftTableTest/types").SortMode) => void;
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

// 充足度サマリー行 Props
export type SummaryFooterRowProps = {
  shifts: import("../ShiftTableTest/types").ShiftData[];
  dates: string[];
  months: string[];
  /** 日付セルクリック時のコールバック */
  onDateClick?: (date: string) => void;
  /** 必要人員設定（充足度カラー表示用） */
  requiredStaffing?: RequiredStaffingData[];
};
