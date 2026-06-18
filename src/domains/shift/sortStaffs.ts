import { BREAK_POSITION } from "./constants";
import { timeToMinutes } from "./time";
import type { ShiftData, SortMode, StaffType } from "./types";

type SortStaffsParams = {
  staffs: StaffType[];
  shiftByStaffId?: ReadonlyMap<string, ShiftData | undefined>;
  sortMode: SortMode;
};

type DailyStaffSortMode = "time" | "dateOnly" | "shiftType";

type SortDailyStaffsParams = {
  staffs: StaffType[];
  shiftByStaffId?: ReadonlyMap<string, ShiftData | undefined>;
  mode: DailyStaffSortMode;
};

const compareByName = (a: StaffType, b: StaffType) => a.name.localeCompare(b.name, "ja");

const hasNumber = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export const compareDefaultStaffOrder = (a: StaffType, b: StaffType): number => {
  const aDisplayOrder = a.displayOrder;
  const bDisplayOrder = b.displayOrder;
  const aHasDisplayOrder = hasNumber(aDisplayOrder);
  const bHasDisplayOrder = hasNumber(bDisplayOrder);
  if (aHasDisplayOrder && bHasDisplayOrder && aDisplayOrder !== bDisplayOrder) {
    return aDisplayOrder - bDisplayOrder;
  }
  if (aHasDisplayOrder !== bHasDisplayOrder) return aHasDisplayOrder ? -1 : 1;

  const aCreatedAt = a.createdAt;
  const bCreatedAt = b.createdAt;
  const aHasCreatedAt = hasNumber(aCreatedAt);
  const bHasCreatedAt = hasNumber(bCreatedAt);
  if (aHasCreatedAt && bHasCreatedAt && aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt;
  }
  if (aHasCreatedAt !== bHasCreatedAt) return aHasCreatedAt ? -1 : 1;

  return a.id.localeCompare(b.id);
};

// 末尾グループの並び: 未提出 → 希望なし（希望なし=提出済みだが出勤不可）
const compareByTailGroup = (a: StaffType, b: StaffType) => {
  if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? 1 : -1;
  return compareByName(a, b);
};

// シフト希望の開始・終了時刻（分）を取得
const getRequestedMinutes = (staffShifts: ShiftData[]) => {
  const requested = staffShifts.flatMap((s) => s.requestedTimes ?? (s.requestedTime ? [s.requestedTime] : []))[0];
  if (!requested) return null;
  return { start: timeToMinutes(requested.start), end: timeToMinutes(requested.end) };
};

// 最も早い割当ポジションの開始時刻（分）を取得
const getEarliestStartMinutes = (staffShifts: ShiftData[]) => {
  let earliest = Number.POSITIVE_INFINITY;
  for (const shift of staffShifts) {
    for (const pos of shift.positions) {
      const minutes = timeToMinutes(pos.start);
      if (minutes < earliest) earliest = minutes;
    }
  }
  return earliest;
};

// 最も早い割当ポジションの終了時刻（分）を取得（同一開始時間の比較用）
const getEarliestEndMinutes = (staffShifts: ShiftData[], targetStartMinutes: number) => {
  let earliest = Number.POSITIVE_INFINITY;
  for (const shift of staffShifts) {
    for (const pos of shift.positions) {
      if (timeToMinutes(pos.start) === targetStartMinutes) {
        const minutes = timeToMinutes(pos.end);
        if (minutes < earliest) earliest = minutes;
      }
    }
  }
  return earliest;
};

const isWorkPosition = (position: ShiftData["positions"][number]): boolean =>
  position.positionId !== BREAK_POSITION.id && position.positionName !== BREAK_POSITION.name;

export const getEarliestAssignedWorkRange = (
  shift: ShiftData | undefined,
): { startMinutes: number; endMinutes: number } | null => {
  if (!shift) return null;

  const workRanges = shift.positions
    .filter(isWorkPosition)
    .map((position) => ({
      startMinutes: timeToMinutes(position.start),
      endMinutes: timeToMinutes(position.end),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const firstRange = workRanges[0];
  if (!firstRange) return null;

  // 勤務区分を複数設定した場合、13:00-17:00 + 17:00-21:00 は 13:00-21:00 として扱う。
  const earliestContinuousRange = { ...firstRange };
  for (const range of workRanges.slice(1)) {
    if (range.startMinutes === earliestContinuousRange.startMinutes) continue;
    if (range.startMinutes > earliestContinuousRange.endMinutes) break;
    earliestContinuousRange.endMinutes = Math.max(earliestContinuousRange.endMinutes, range.endMinutes);
  }

  return earliestContinuousRange;
};

const hasWorkRequest = (shift: ShiftData | undefined, mode: DailyStaffSortMode): boolean => {
  if (!shift) return false;
  if (mode === "shiftType") {
    return (
      (shift.requestedShiftTypeOptionIds?.length ?? 0) > 0 ||
      (shift.requestedTimes?.length ?? 0) > 0 ||
      !!shift.requestedTime
    );
  }
  return !!shift.requestedTime || (shift.requestedTimes?.length ?? 0) > 0;
};

export const sortDailyStaffs = ({ staffs, shiftByStaffId, mode }: SortDailyStaffsParams): StaffType[] =>
  [...staffs].sort((a, b) => {
    const aShift = shiftByStaffId?.get(a.id);
    const bShift = shiftByStaffId?.get(b.id);
    const aWorkRange = getEarliestAssignedWorkRange(aShift);
    const bWorkRange = getEarliestAssignedWorkRange(bShift);
    const aGroup = aWorkRange ? 0 : a.isSubmitted ? 1 : 2;
    const bGroup = bWorkRange ? 0 : b.isSubmitted ? 1 : 2;

    if (aGroup !== bGroup) return aGroup - bGroup;

    if (aGroup === 0) {
      if (mode !== "dateOnly" && aWorkRange && bWorkRange) {
        if (aWorkRange.startMinutes !== bWorkRange.startMinutes) {
          return aWorkRange.startMinutes - bWorkRange.startMinutes;
        }
        if (aWorkRange.endMinutes !== bWorkRange.endMinutes) {
          return aWorkRange.endMinutes - bWorkRange.endMinutes;
        }
      }
      return compareDefaultStaffOrder(a, b);
    }

    if (aGroup === 1) {
      const aRestGroup = hasWorkRequest(aShift, mode) ? 1 : 0;
      const bRestGroup = hasWorkRequest(bShift, mode) ? 1 : 0;
      if (aRestGroup !== bRestGroup) return aRestGroup - bRestGroup;
    }

    return compareDefaultStaffOrder(a, b);
  });

export const sortStaffs = ({ staffs, shiftByStaffId, sortMode }: SortStaffsParams) => {
  if (sortMode === "default") return [...staffs];

  const getShiftsForStaff = (staffId: string) => {
    const shift = shiftByStaffId?.get(staffId);
    return shift ? [shift] : [];
  };

  return [...staffs].sort((a, b) => {
    if (sortMode === "request") {
      const aShifts = getShiftsForStaff(a.id);
      const bShifts = getShiftsForStaff(b.id);
      const aReq = getRequestedMinutes(aShifts);
      const bReq = getRequestedMinutes(bShifts);

      // 希望なし/未提出は末尾（未提出 → 希望なし）
      if (!aReq && !bReq) return compareByTailGroup(a, b);
      if (!aReq) return 1;
      if (!bReq) return -1;

      // 開始時間昇順
      if (aReq.start !== bReq.start) return aReq.start - bReq.start;
      // 同一開始時間 → 終了時間昇順
      if (aReq.end !== bReq.end) return aReq.end - bReq.end;
      return compareByName(a, b);
    }

    // startTime: 出勤順
    const aShifts = getShiftsForStaff(a.id);
    const bShifts = getShiftsForStaff(b.id);
    const aStart = getEarliestStartMinutes(aShifts);
    const bStart = getEarliestStartMinutes(bShifts);

    // 未割当（Infinity）は末尾（未提出 → 希望なし）
    if (aStart === Number.POSITIVE_INFINITY && bStart === Number.POSITIVE_INFINITY) return compareByTailGroup(a, b);
    if (aStart === Number.POSITIVE_INFINITY) return 1;
    if (bStart === Number.POSITIVE_INFINITY) return -1;

    if (aStart !== bStart) return aStart - bStart;

    // 同一開始時間 → 終了時間が早い方が上
    const aEnd = getEarliestEndMinutes(aShifts, aStart);
    const bEnd = getEarliestEndMinutes(bShifts, bStart);
    if (aEnd !== bEnd) return aEnd - bEnd;

    return compareByName(a, b);
  });
};
