import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { resolveInitialSelectedDate } from "@/src/domains/shift/date";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { sortDailyStaffs } from "@/src/domains/shift/sortStaffs";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionType, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "@/src/domains/shift/types";
import {
  detailModeAtom,
  lockedDailyStaffOrderAtom,
  newcomerOnlyPeriodsAtom,
  replaceShiftDraftsAtom,
  selectedDateAtom,
  shiftConfigAtom,
  sortModeAtom,
  validationIssuesAtom,
  validationWarningsAtom,
  viewModeAtom,
} from "../stores";
import type { ShiftFormStaffing } from "../types";

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
  staffing?: ShiftFormStaffing;
  submissionPattern: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
  defaultToToday?: boolean;
  initialViewMode?: ViewMode;
  initialSortMode?: SortMode;
  initialDetailMode?: boolean;
  validationIssues?: AssignmentIssue[];
  validationWarnings?: AssignmentWarning[];
  newcomerOnlyPeriods?: NewcomerOnlyPeriod[];
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
  staffing,
  submissionPattern,
  displayMode = "request",
  defaultToToday = false,
  initialViewMode,
  initialSortMode,
  initialDetailMode,
  validationIssues,
  validationWarnings,
  newcomerOnlyPeriods,
}: UseShiftFormInitParams) => {
  const setConfig = useSetAtom(shiftConfigAtom);
  const setShifts = useSetAtom(replaceShiftDraftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setLockedDailyStaffOrder = useSetAtom(lockedDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const setDetailMode = useSetAtom(detailModeAtom);
  const setValidationIssues = useSetAtom(validationIssuesAtom);
  const setValidationWarnings = useSetAtom(validationWarningsAtom);
  const setNewcomerOnlyPeriods = useSetAtom(newcomerOnlyPeriodsAtom);
  const isInitialized = useRef(false);

  // 初回マウント時: シフトデータ初期化 + 選択日を設定
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    setShifts(initialShifts);
    const initialDate = resolveInitialSelectedDate(dates, defaultToToday);
    setSelectedDate(initialDate);
    if (initialDate && staffs.length > 0) {
      const shiftByStaffId = indexShiftsByStaffId(initialShifts.filter((shift) => shift.date === initialDate));
      const mode = submissionPattern.kind === "dateOnly" ? "dateOnly" : submissionPattern.kind;
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
    if (initialDetailMode) {
      setDetailMode(true);
    }
  }, [
    initialShifts,
    dates,
    staffs,
    submissionPattern,
    defaultToToday,
    setShifts,
    setSelectedDate,
    setLockedDailyStaffOrder,
    initialViewMode,
    setViewMode,
    initialSortMode,
    setSortMode,
    initialDetailMode,
    setDetailMode,
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
      staffing,
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
    staffing,
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

  // 見習いだけの時間帯（確認事項）の同期
  useEffect(() => {
    setNewcomerOnlyPeriods(newcomerOnlyPeriods ?? []);
  }, [newcomerOnlyPeriods, setNewcomerOnlyPeriods]);
};
