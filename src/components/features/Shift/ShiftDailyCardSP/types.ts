import type { PositionSegment, PositionType, ShiftData, SortMode, StaffType, TimeRange } from "../ShiftTableTest/types";

// SP日毎ビュー メインProps
export type ShiftDailyCardSPProps = {
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  shifts: ShiftData[];
  onShiftsChange: (shifts: ShiftData[]) => void;
  dates: string[];
  timeRange: TimeRange;
  selectedDate: string;
  onDateChange: (date: string) => void;
  sortMode: SortMode | null;
  onSortModeChange: (mode: SortMode) => void;
};

// スタッフカード
export type StaffCardProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  timeRange: TimeRange;
  onCardTap: () => void;
};

// ミニバー（比例色付きバー）
export type MiniShiftBarProps = {
  positions: PositionSegment[];
  timeRange: TimeRange;
};

// 日付ナビゲーション
export type DateNavigatorProps = {
  dates: string[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  holidays?: string[];
};

// スタッフ追加BottomSheet
export type StaffAddSheetProps = {
  staffs: StaffType[];
  shifts: ShiftData[];
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onSelectStaff: (staffId: string) => void;
};

// 編集BottomSheet
export type ShiftEditSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  positions: PositionType[];
  timeRange: TimeRange;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onShiftUpdate: (updatedShift: ShiftData) => void;
  onShiftDelete: (staffId: string) => void;
};
