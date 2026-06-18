import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { sortDailyStaffs } from "@/src/domains/shift/sortStaffs";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  TimeRange,
  ViewMode,
} from "@/src/domains/shift/types";
import {
  lockedDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  sortModeAtom,
  validationIssuesAtom,
  validationWarningsAtom,
  viewModeAtom,
} from "../stores";

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
  submissionPattern?: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
  initialViewMode?: ViewMode;
  initialSortMode?: SortMode;
  validationIssues?: AssignmentIssue[];
  validationWarnings?: AssignmentWarning[];
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
  submissionPattern,
  displayMode = "request",
  initialViewMode,
  initialSortMode,
  validationIssues,
  validationWarnings,
}: UseShiftFormInitParams) => {
  const setConfig = useSetAtom(shiftConfigAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setLockedDailyStaffOrder = useSetAtom(lockedDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const setValidationIssues = useSetAtom(validationIssuesAtom);
  const setValidationWarnings = useSetAtom(validationWarningsAtom);
  const isInitialized = useRef(false);

  // 初回マウント時: シフトデータ初期化 + 選択日を設定
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    setShifts(initialShifts);
    const initialDate = dates[0] ?? "";
    setSelectedDate(initialDate);
    if (initialDate && staffs.length > 0) {
      const shiftByStaffId = indexShiftsByStaffId(initialShifts.filter((shift) => shift.date === initialDate));
      const mode = submissionPattern?.kind === "dateOnly" ? "dateOnly" : (submissionPattern?.kind ?? "time");
      const staffIds = sortDailyStaffs({
        staffs,
        shiftByStaffId,
        mode,
      }).map((staff) => staff.id);
      setLockedDailyStaffOrder({ date: initialDate, staffIds });
    } else {
      setLockedDailyStaffOrder(null);
    }
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
    if (initialSortMode) {
      setSortMode(initialSortMode);
    }
  }, [
    initialShifts,
    dates,
    staffs,
    submissionPattern,
    setShifts,
    setSelectedDate,
    setLockedDailyStaffOrder,
    initialViewMode,
    setViewMode,
    initialSortMode,
    setSortMode,
  ]);

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
      submissionPattern,
      displayMode,
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
    submissionPattern,
    displayMode,
    setConfig,
  ]);

  // 確定前バリデーションエラーの同期（props変更時にatomを更新）
  useEffect(() => {
    setValidationIssues(validationIssues ?? []);
  }, [validationIssues, setValidationIssues]);

  // 確定前ワーニング（確認事項）の同期
  useEffect(() => {
    setValidationWarnings(validationWarnings ?? []);
  }, [validationWarnings, setValidationWarnings]);
};
