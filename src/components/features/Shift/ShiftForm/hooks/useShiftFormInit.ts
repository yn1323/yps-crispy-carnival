import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { selectedDateAtom, shiftConfigAtom, shiftsHistoryAtom } from "../stores";
import type { PositionType, RequiredStaffingData, ShiftData, StaffType, TimeRange } from "../types";

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
}: UseShiftFormInitParams) => {
  const setConfig = useSetAtom(shiftConfigAtom);
  const setHistory = useSetAtom(shiftsHistoryAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const isInitialized = useRef(false);

  // 初回マウント時: 履歴を初期化 + 選択日を設定
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    setHistory({
      past: [],
      present: initialShifts,
      future: [],
    });
    setSelectedDate(dates[0] ?? "");
  }, [initialShifts, dates, setHistory, setSelectedDate]);

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
