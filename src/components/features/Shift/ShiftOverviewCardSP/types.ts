import type { PositionType, ShiftData, SortMode, StaffType, TimeRange } from "../ShiftTableTest/types";

// SP俯瞰ビュー メインProps
export type ShiftOverviewCardSPProps = {
  shopId: string;
  dates: string[];
  staffs: StaffType[];
  shifts: ShiftData[];
  holidays?: string[];
  onDateClick?: (date: string) => void;
  sortMode: SortMode | null;
  onSortModeChange: (mode: SortMode) => void;
  positions: PositionType[];
  timeRange: TimeRange;
  onShiftsChange: (shifts: ShiftData[]) => void;
  isReadOnly?: boolean;
};

// 日付カード
export type DateCardProps = {
  date: string;
  staffs: StaffType[];
  shifts: ShiftData[];
  isHoliday: boolean;
  onTap: () => void;
  hasNonWorkingStaffs: boolean;
  onAddStaffClick: () => void;
  isReadOnly?: boolean;
};
