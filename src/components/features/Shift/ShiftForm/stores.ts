import { atom } from "jotai";
import { UNDO_REDO_HISTORY_LIMIT } from "./constants";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  SummaryDisplayMode,
  TimeRange,
  ToolMode,
  ViewMode,
} from "./types";
import { normalizePositions } from "./utils/shiftOperations";
import { sortStaffs } from "./utils/sortStaffs";

// ==========================================
// 外部設定（propsから初期化、子コンポーネントは読み取り専用）
// ==========================================
export const shiftConfigAtom = atom<{
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  dates: string[];
  timeRange: TimeRange;
  holidays: string[];
  isReadOnly: boolean;
  currentStaffId?: string;
  allShifts?: ShiftData[];
  requiredStaffing?: RequiredStaffingData[];
}>({
  shopId: "",
  staffs: [],
  positions: [],
  dates: [],
  timeRange: { start: 9, end: 22, unit: 30 },
  holidays: [],
  isReadOnly: false,
});

// ==========================================
// コア状態
// ==========================================
export const viewModeAtom = atom<ViewMode>("daily");
export const selectedDateAtom = atom<string>("");
export const sortModeAtom = atom<SortMode>("default");

// ==========================================
// シフトデータ + Undo/Redo 履歴
// ==========================================
export const shiftsHistoryAtom = atom<{
  past: ShiftData[][];
  present: ShiftData[];
  future: ShiftData[][];
}>({ past: [], present: [], future: [] });

// 読み書きatom: 書き込み時に自動正規化 + 履歴追加
export const shiftsAtom = atom(
  (get) => get(shiftsHistoryAtom).present,
  (get, set, newShifts: ShiftData[]) => {
    const breakPos = get(breakPositionAtom);
    const normalized = breakPos
      ? newShifts.map((s) => ({
          ...s,
          positions: normalizePositions({
            positions: s.positions,
            breakPosition: breakPos,
          }),
        }))
      : newShifts;
    const history = get(shiftsHistoryAtom);
    set(shiftsHistoryAtom, {
      past: [...history.past.slice(-(UNDO_REDO_HISTORY_LIMIT - 1)), history.present],
      present: normalized,
      future: [],
    });
  },
);

// Undo/Redo 状態
export const canUndoAtom = atom((get) => get(shiftsHistoryAtom).past.length > 0);
export const canRedoAtom = atom((get) => get(shiftsHistoryAtom).future.length > 0);

// Undo アクション (write-only atom)
export const undoAtom = atom(null, (get, set) => {
  const history = get(shiftsHistoryAtom);
  if (history.past.length === 0) return;
  set(shiftsHistoryAtom, {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  });
});

// Redo アクション (write-only atom)
export const redoAtom = atom(null, (get, set) => {
  const history = get(shiftsHistoryAtom);
  if (history.future.length === 0) return;
  set(shiftsHistoryAtom, {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  });
});

// ==========================================
// PC日毎ビュー専用
// ==========================================
export const toolModeAtom = atom<ToolMode>("select");
export const selectedPositionIdAtom = atom<string | null>(null);
export const summaryExpandedAtom = atom<boolean>(false);
export const summaryDisplayModeAtom = atom<SummaryDisplayMode>("color");

// ==========================================
// 派生atom
// ==========================================
export const sortedStaffsAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const shifts = get(shiftsAtom);
  const selectedDate = get(selectedDateAtom);
  const sortMode = get(sortModeAtom);
  return sortStaffs({ staffs: config.staffs, shifts, selectedDate, sortMode });
});

export const selectedPositionAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const id = get(selectedPositionIdAtom);
  return id ? (config.positions.find((p) => p.id === id) ?? null) : null;
});

export const breakPositionAtom = atom((get) => {
  return get(shiftConfigAtom).positions.find((p) => p.name === "休憩") ?? null;
});
