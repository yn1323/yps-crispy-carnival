import type { PositionType, ShiftData, StaffType, TimeRange } from "../ShiftTableTest/types";

// ShiftViewSwitcher共通Props（PC/SP共有）
export type ShiftViewSwitcherBaseProps = {
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
  holidays?: string[];
};
