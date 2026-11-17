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
  requestedTimes?: ShiftTimeRange[]; // パターン選択では同じ日に複数の希望時間帯を持てる
  requestedShiftTypeOptionIds?: string[]; // パターン選択で希望されたパターンID
  positions: PositionSegment[];
  // その日の休憩。勤務区間とは独立に持ち、保存と集計のときに勤務時間の内側へ切り詰める。
  breaks?: ShiftTimeRange[];
  // 未提出者へ前回確定の勤務を引き継いだ「仮の勤務」
  isProvisional?: boolean;
};

// ポジション色セグメント
export type PositionSegment = {
  id: string;
  positionId: string;
  positionName: string;
  color: string; // "#60a5fa"
  start: string; // "10:00"
  end: string; // "14:00"
  shiftTypeOptionId?: string; // パターン選択の募集で選択されたパターンID
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
  // ポジションごとの値（担当外、見習い、リーダー）。ここにないポジションは一人前。
  positionSkills?: StaffPositionSkill[];
};

// そのポジションが担当外（unavailable）か、担当できる場合の熟練度（newcomer、lead）。一人前は持たない。
export type PositionSkillLevel = "unavailable" | "newcomer" | "lead";

export type StaffPositionSkill = {
  positionId: string;
  level: PositionSkillLevel;
};

// 店舗の休憩の決まり（何分以上の勤務に何分）
export type ShiftBreakRule = {
  minWorkMinutes: number;
  breakMinutes: number;
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
// 必要人数
// ==========================================

// 人数を数える区切り。パターン選択は勤務パターン、日付選択は終日になる。
// 時間指定は区切りを持たず、バー（StaffingBar）から人数が変わる時刻で区切る。
export type StaffingSlotKey = { kind: "shiftType"; optionId: string } | { kind: "allDay" };

export type StaffingRequirement = {
  positionId: string;
  count: number;
};

// その日の区切りと必要人数
export type StaffingSlot = {
  key: StaffingSlotKey;
  requirements: StaffingRequirement[];
};

// 時間指定の必要人数のバー。1本が1人分で、ある時刻の必要人数は、その時刻に重なるバーの本数になる。
export type StaffingBar = {
  positionId: string;
  start: string; // "11:00"
  end: string; // "14:00"
};
