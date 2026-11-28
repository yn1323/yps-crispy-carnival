// ==========================================
// PC日別ビュー: 時間軸、ドラッグ & スクロール
// ==========================================

// 時間軸の座標計算に使う定数は、必要人数のバーの編集と共有するためsharedに置く。
export {
  HOUR_WIDTH_PX,
  RESIZE_EDGE_THRESHOLD,
  TIME_AXIS_PADDING_PX,
} from "@/src/components/shared/ShiftTimeline/constants";

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

export {
  BREAK_POSITION,
  CONSECUTIVE_DAYS_LIMIT,
  DEFAULT_POSITION,
  FILL_RATE_COLORS,
  WEEK_HOURS_LIMIT,
} from "@/src/domains/shift/constants";
