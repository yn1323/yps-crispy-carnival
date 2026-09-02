// ==========================================
// ドメイン型定義（ShiftForm 統合）
// ==========================================

export type ShiftTimeRange = {
  start: string; // "10:00"
  end: string; // "18:00"
};

// シフトデータ
export type ShiftData = {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  // 希望シフト時間（スタッフ提出、読み取り専用）
  requestedTime: ShiftTimeRange | null; // null = 未提出
  requestedTimes?: ShiftTimeRange[]; // 勤務区分提出では同じ日に複数の希望時間帯を持てる
  requestedShiftTypeOptionIds?: string[]; // 勤務区分提出で希望された区分ID
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
  shiftTypeOptionId?: string; // 勤務区分募集で選択された区分ID
};

// ポジション定義
export type PositionType = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
};

// スタッフ定義
export type StaffType = {
  id: string;
  name: string;
  isSubmitted: boolean;
  isRemoved?: boolean;
  displayOrder?: number;
  createdAt?: number;
};

// 時間範囲
export type TimeRange = {
  start: number; // 開始時 (9)
  end: number; // 終了時 (22)
  unit: number; // 分単位 (30)
  editableStartMinutes?: number; // 編集可能開始分 (例: 05:30 = 330)
  editableEndMinutes?: number; // 編集可能終了分 (例: 22:30 = 1350)
};

// ==========================================
// モード型
// ==========================================

// ビューモード
export type ViewMode = "daily" | "overview";

// ドラッグモード（希望シフトバーは編集不可のため、ポジション関連のみ）
export type DragMode = "position-resize-start" | "position-resize-end" | "paint" | null;

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
// 一覧ビュー型
// ==========================================

// ピーク帯定義
export type PeakBand = {
  startTime: string; // "11:00"
  endTime: string; // "14:00"
  requiredCount: number; // 必要人数
};

// 必要人員設定データ（convex/requiredStaffing テーブルの1レコードに対応）
export type RequiredStaffingData = {
  dayOfWeek: number; // 0=日, 1=月, ..., 6=土
  slots: {
    hour: number; // 0-23
    position: string;
    requiredCount: number;
  }[];
  peakBands?: PeakBand[];
  minimumStaff?: number;
};
