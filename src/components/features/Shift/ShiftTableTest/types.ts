// 時間軸の左右パディング（px）
export const TIME_AXIS_PADDING_PX = 20;

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

// ドラッグモード（希望シフトバーは編集不可のため、ポジション関連のみ）
export type DragMode = "position-resize-start" | "position-resize-end" | "paint" | "erase" | "scroll" | null;

// ツールモード（常にどれか1つが選択される）
export type ToolMode = "select" | "assign" | "erase";

// サマリー行の表示モード
export type SummaryDisplayMode = "color" | "number";

// スタッフソートモード
export type SortMode = "default" | "request" | "startTime";

// 充足率 → 段階的6色（赤→オレンジ→黄→黄緑→緑→青）
export const FILL_RATE_COLORS = [
  { bg: "hsl(0, 85%, 70%)", text: "hsl(0, 90%, 45%)" }, // 0-20%: 赤（濃い）
  { bg: "hsl(30, 80%, 75%)", text: "hsl(30, 85%, 40%)" }, // 21-40%: オレンジ
  { bg: "hsl(50, 80%, 75%)", text: "hsl(50, 85%, 40%)" }, // 41-60%: 黄
  { bg: "hsl(80, 80%, 75%)", text: "hsl(80, 85%, 40%)" }, // 61-80%: 黄緑
  { bg: "hsl(120, 80%, 75%)", text: "hsl(120, 85%, 40%)" }, // 81-100%: 緑
  { bg: "hsl(210, 80%, 75%)", text: "hsl(210, 85%, 40%)" }, // 101%+: 青（超過）
] as const;

// 連結リサイズ対象（隣接バーの境界ドラッグ用）
export type LinkedResizeTarget = {
  // 前のポジション（end側をリサイズ）
  prevPosition: { positionId: string; positionColor: string } | null;
  // 後のポジション（start側をリサイズ）
  nextPosition: { positionId: string; positionColor: string } | null;
  // 境界の分（例: 840 = 14:00）
  boundaryMinutes: number;
};

// メインコンポーネントのProps
export type ShiftTableTestProps = {
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
};
