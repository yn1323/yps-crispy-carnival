import type { RequiredStaffingData } from "../ShiftOverview/types";
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
  requiredStaffing?: RequiredStaffingData[];
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

// 充足度サマリーバー
export type FulfillmentBarProps = {
  shifts: ShiftData[];
  selectedDate: string;
  requiredStaffing?: RequiredStaffingData[];
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
