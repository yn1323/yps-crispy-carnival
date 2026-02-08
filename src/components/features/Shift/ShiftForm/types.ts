// ==========================================
// ドメイン型定義（ShiftForm 統合）
// ==========================================

// シフトデータ
export type ShiftData = {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  // 希望シフト時間（スタッフ提出、読み取り専用）
  requestedTime: {
    start: string; // "10:00"
    end: string; // "18:00"
  } | null; // null = 未提出
  positions: PositionSegment[];
};

// ポジション色セグメント
export type PositionSegment = {
  id: string;
  positionId: string;
  positionName: string;
  color: string; // "#3b82f6"
  start: string; // "10:00"
  end: string; // "14:00"
};

// ポジション定義
export type PositionType = {
  id: string;
  name: string;
  color: string;
};

// スタッフ定義
export type StaffType = {
  id: string;
  name: string;
  isSubmitted: boolean;
};

// 時間範囲
export type TimeRange = {
  start: number; // 開始時 (9)
  end: number; // 終了時 (22)
  unit: number; // 分単位 (30)
};

// ==========================================
// モード型
// ==========================================

// ビューモード
export type ViewMode = "daily" | "overview";

// ドラッグモード（希望シフトバーは編集不可のため、ポジション関連のみ）
export type DragMode = "position-resize-start" | "position-resize-end" | "paint" | "erase" | "scroll" | null;

// ツールモード（常にどれか1つが選択される）
export type ToolMode = "select" | "assign" | "erase";

// サマリー行の表示モード
export type SummaryDisplayMode = "color" | "number";

// スタッフソートモード
export type SortMode = "default" | "request" | "startTime";

// ==========================================
// 構造型
// ==========================================

// 連結リサイズ対象（隣接バーの境界ドラッグ用）
export type LinkedResizeTarget = {
  // 前のポジション（end側をリサイズ）
  prevPosition: { positionId: string; positionColor: string } | null;
  // 後のポジション（start側をリサイズ）
  nextPosition: { positionId: string; positionColor: string } | null;
  // 境界の分（例: 840 = 14:00）
  boundaryMinutes: number;
};

// ==========================================
// 俯瞰ビュー型
// ==========================================

// 必要人員設定データ（convex/requiredStaffing テーブルの1レコードに対応）
export type RequiredStaffingData = {
  dayOfWeek: number; // 0=日, 1=月, ..., 6=土
  slots: {
    hour: number; // 0-23
    position: string;
    requiredCount: number;
  }[];
};

// スタッフ行表示用データ
export type StaffRowData = {
  staffId: string;
  staffName: string;
  isSubmitted: boolean;
  dailyShifts: Map<string, DailyShift | null>; // key: "2026-01-27"
  monthlyTotals: Map<string, number>; // key: "2026-01"
  totalMinutes: number;
  alerts: StaffAlert[];
};

// 1日のシフト情報
export type DailyShift = {
  start: string; // "09:00"
  end: string; // "17:00"
};

// アラート情報
export type StaffAlert = {
  type: "week40h" | "consecutive" | "monthLimit";
  targetDate?: string;
  message: string;
  actualValue: number;
  threshold: number;
};
