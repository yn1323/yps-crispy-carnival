import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, sortModeAtom, viewModeAtom } from "../stores";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "../types";

type UseShiftFormInitParams = {
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
  holidays?: string[];
  isReadOnly?: boolean;
  currentStaffId?: string;
  allShifts?: ShiftData[];
  requiredStaffing?: RequiredStaffingData[];
  initialViewMode?: ViewMode;
  initialSortMode?: SortMode;
};

export const useShiftFormInit = ({
  shopId,
  staffs,
  positions,
  initialShifts,
  dates,
  timeRange,
  holidays = [],
  isReadOnly = false,
  currentStaffId,
  allShifts,
  requiredStaffing,
  initialViewMode,
  initialSortMode,
}: UseShiftFormInitParams) => {
  const setConfig = useSetAtom(shiftConfigAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const isInitialized = useRef(false);

  // 初回マウント時: シフトデータ初期化 + 選択日を設定
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    setShifts(initialShifts);
    setSelectedDate(dates[0] ?? "");
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
    if (initialSortMode) {
      setSortMode(initialSortMode);
    }
  }, [initialShifts, dates, setShifts, setSelectedDate, initialViewMode, setViewMode, initialSortMode, setSortMode]);

  // 外部設定の同期（props変更時に shiftConfigAtom を更新）
  useEffect(() => {
    setConfig({
      shopId,
      staffs,
      positions,
      dates,
      timeRange,
      holidays,
      isReadOnly,
      currentStaffId,
      allShifts,
      requiredStaffing,
    });
  }, [
    shopId,
    staffs,
    positions,
    dates,
    timeRange,
    holidays,
    isReadOnly,
    currentStaffId,
    allShifts,
    requiredStaffing,
    setConfig,
  ]);
};
