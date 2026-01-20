// シフトデータ
export type ShiftData = {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  workingTime: {
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

// ドラッグモード
export type DragMode =
  | "create"
  | "resize-start"
  | "resize-end"
  | "position-resize-start"
  | "position-resize-end"
  | "paint"
  | null;

// メインコンポーネントのProps
export type ShiftTableTestProps = {
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
};
