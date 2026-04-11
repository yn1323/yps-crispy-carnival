import type { ShiftData, SortMode, StaffType } from "../types";
import { timeToMinutes } from "./timeConversion";

type SortStaffsParams = {
  staffs: StaffType[];
  shifts: ShiftData[];
  selectedDate: string;
  sortMode: SortMode;
};

const compareByName = (a: StaffType, b: StaffType) => a.name.localeCompare(b.name, "ja");

// 末尾グループの並び: 未提出 → 希望なし（希望なし=提出済みだが出勤不可）
const compareByTailGroup = (a: StaffType, b: StaffType) => {
  if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? 1 : -1;
  return compareByName(a, b);
};

// シフト希望の開始・終了時刻（分）を取得
const getRequestedMinutes = (staffShifts: ShiftData[]) => {
  const requested = staffShifts.find((s) => s.requestedTime !== null)?.requestedTime;
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

export const sortStaffs = ({ staffs, shifts, selectedDate, sortMode }: SortStaffsParams) => {
  if (sortMode === "default") return [...staffs];

  const getShiftsForStaff = (staffId: string) => shifts.filter((s) => s.staffId === staffId && s.date === selectedDate);

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
