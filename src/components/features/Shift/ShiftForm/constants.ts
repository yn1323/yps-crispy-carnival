// ==========================================
// PC日別ビュー: 時間軸
// ==========================================

// 時間軸の左右パディング（px）
export const TIME_AXIS_PADDING_PX = 30;

// 1時間あたりの幅（px）- 固定幅計算用
export const HOUR_WIDTH_PX = 120;

// ==========================================
// PC日別ビュー: ドラッグ & スクロール
// ==========================================

// リサイズ端の判定閾値（px）
export const RESIZE_EDGE_THRESHOLD = 10;

// 自動スクロール設定
export const AUTO_SCROLL_EDGE_PX = 50; // 端からの距離（px）
export const AUTO_SCROLL_MIN_SPEED = 2; // 最小速度（px/frame）
export const AUTO_SCROLL_MAX_SPEED = 10; // 最大速度（px/frame）

// ==========================================
// PC一覧ビュー: テーブルレイアウト
// ==========================================

export const STAFF_NAME_CELL_WIDTH = 120;
export const DATE_CELL_WIDTH = 90;
export const MONTH_TOTAL_CELL_WIDTH = 60;
export const ROW_HEIGHT = 48;

// ==========================================
// ビジネスルール
// ==========================================

// Undo/Redo 履歴上限
export const UNDO_REDO_HISTORY_LIMIT = 50;

// アラート閾値
export const WEEK_HOURS_LIMIT = 40 * 60; // 週40時間（分）
export const CONSECUTIVE_DAYS_LIMIT = 6; // 連勤アラート閾値（日）

// ==========================================
// 充足度カラー（6段階）
// ==========================================

// 充足率 → 段階的6色（赤→オレンジ→黄→黄緑→緑→青）
export const FILL_RATE_COLORS = [
  { bg: "hsl(0, 85%, 70%)", text: "hsl(0, 90%, 45%)" }, // 0-20%: 赤（濃い）
  { bg: "hsl(30, 80%, 75%)", text: "hsl(30, 85%, 40%)" }, // 21-40%: オレンジ
  { bg: "hsl(50, 80%, 75%)", text: "hsl(50, 85%, 40%)" }, // 41-60%: 黄
  { bg: "hsl(80, 80%, 75%)", text: "hsl(80, 85%, 40%)" }, // 61-80%: 黄緑
  { bg: "hsl(120, 80%, 75%)", text: "hsl(120, 85%, 40%)" }, // 81-100%: 緑
  { bg: "hsl(210, 80%, 75%)", text: "hsl(210, 85%, 40%)" }, // 101%+: 青（超過）
] as const;
