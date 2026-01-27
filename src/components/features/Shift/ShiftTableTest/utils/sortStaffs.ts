import type { ShiftData, SortMode, StaffType } from "../types";

type SortStaffsParams = {
  staffs: StaffType[];
  shifts: ShiftData[];
  selectedDate: string;
  sortMode: SortMode;
};

const compareByName = (a: StaffType, b: StaffType) => a.name.localeCompare(b.name, "ja");

// アクション優先順の優先度を取得
const getActionPriority = (staff: StaffType, staffShifts: ShiftData[]) => {
  const hasRequest = staffShifts.some((s) => s.requestedTime !== null);
  const hasPositions = staffShifts.some((s) => s.positions.length > 0);

  if (staff.isSubmitted && hasRequest && !hasPositions) return 1; // 希望あり・未割当
  if (staff.isSubmitted && hasRequest && hasPositions) return 2; // 希望あり・割当済
  if (!staff.isSubmitted) return 3; // 未提出
  return 4; // 希望なし
};

// 最も早い割当ポジションの開始時刻（分）を取得
const getEarliestStartMinutes = (staffShifts: ShiftData[]) => {
  let earliest = Number.POSITIVE_INFINITY;
  for (const shift of staffShifts) {
    for (const pos of shift.positions) {
      const [h, m] = pos.start.split(":").map(Number);
      const minutes = h * 60 + m;
      if (minutes < earliest) earliest = minutes;
    }
  }
  return earliest;
};

export const sortStaffs = ({ staffs, shifts, selectedDate, sortMode }: SortStaffsParams) => {
  const getShiftsForStaff = (staffId: string) => shifts.filter((s) => s.staffId === staffId && s.date === selectedDate);

  return [...staffs].sort((a, b) => {
    if (sortMode === "name") {
      return compareByName(a, b);
    }

    if (sortMode === "action") {
      const aShifts = getShiftsForStaff(a.id);
      const bShifts = getShiftsForStaff(b.id);
      const priorityDiff = getActionPriority(a, aShifts) - getActionPriority(b, bShifts);
      if (priorityDiff !== 0) return priorityDiff;
      return compareByName(a, b);
    }

    // startTime: 出勤順
    const aShifts = getShiftsForStaff(a.id);
    const bShifts = getShiftsForStaff(b.id);
    const aStart = getEarliestStartMinutes(aShifts);
    const bStart = getEarliestStartMinutes(bShifts);

    // 未割当（Infinity）は末尾
    if (aStart === Number.POSITIVE_INFINITY && bStart === Number.POSITIVE_INFINITY) return compareByName(a, b);
    if (aStart === Number.POSITIVE_INFINITY) return 1;
    if (bStart === Number.POSITIVE_INFINITY) return -1;

    if (aStart !== bStart) return aStart - bStart;
    return compareByName(a, b);
  });
};
