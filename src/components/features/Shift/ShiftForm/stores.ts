import { atom } from "jotai";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "./types";
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
// シフトデータ
// ==========================================
export const shiftsAtom = atom<ShiftData[]>([]);

// ==========================================
// ポジション選択（ドラッグロジック内部で使用）
// ==========================================
export const selectedPositionIdAtom = atom<string | null>(null);

// ==========================================
// 派生atom
// ==========================================
export const selectedPositionAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const id = get(selectedPositionIdAtom);
  return id ? (config.positions.find((p) => p.id === id) ?? null) : null;
});

export const sortedStaffsAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const shifts = get(shiftsAtom);
  const selectedDate = get(selectedDateAtom);
  const sortMode = get(sortModeAtom);
  return sortStaffs({ staffs: config.staffs, shifts, selectedDate, sortMode });
});
