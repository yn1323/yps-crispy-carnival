import type { RequiredStaffingData } from "../ShiftOverview/types";
import type { ShiftData, SortMode, StaffType } from "../ShiftTableTest/types";

// SP俯瞰ビュー メインProps
export type ShiftOverviewCardSPProps = {
  shopId: string;
  dates: string[];
  staffs: StaffType[];
  shifts: ShiftData[];
  holidays?: string[];
  onDateClick?: (date: string) => void;
  requiredStaffing?: RequiredStaffingData[];
  sortMode: SortMode | null;
  onSortModeChange: (mode: SortMode) => void;
};

// 日付カード
export type DateCardProps = {
  date: string;
  staffs: StaffType[];
  shifts: ShiftData[];
  isHoliday: boolean;
  onTap: () => void;
  requiredCount?: number;
};
