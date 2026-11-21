import { isLegacyCompatibleWorkPosition } from "./positions";
import { indexShiftsByStaffId } from "./shiftLookup";
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

// 希望シフトの開始・終了時刻（分）を取得
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

export const getEarliestAssignedWorkRange = (
  shift: ShiftData | undefined,
): { startMinutes: number; endMinutes: number } | null => {
  if (!shift) return null;

  const workRanges = shift.positions
    .filter(isLegacyCompatibleWorkPosition)
    .map((position) => ({
      startMinutes: timeToMinutes(position.start),
      endMinutes: timeToMinutes(position.end),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const firstRange = workRanges[0];
  if (!firstRange) return null;

  // 勤務パターンを複数設定した場合、13:00-17:00 + 17:00-21:00 は 13:00-21:00 として扱う。
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

// 希望のうち最も早い時間帯（分）。開始が同じなら終了が早いほうを使う。
const getEarliestRequestRange = (shift: ShiftData | undefined): { startMinutes: number; endMinutes: number } | null => {
  if (!shift) return null;
  const requests = shift.requestedTimes ?? (shift.requestedTime ? [shift.requestedTime] : []);
  const ranges = requests
    .map((request) => ({ startMinutes: timeToMinutes(request.start), endMinutes: timeToMinutes(request.end) }))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  return ranges[0] ?? null;
};

const compareRanges = (
  a: { startMinutes: number; endMinutes: number } | null,
  b: { startMinutes: number; endMinutes: number } | null,
): number => {
  if (!a || !b) return 0;
  return a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes;
};

// 日別の並びのまとまり: 勤務あり → 出勤の希望あり → 休み → 未提出。
// 勤務がまだない日（「くわしく」で開いた直後など）も、希望のある人が上に来る。
const getDailyGroup = (staff: StaffType, shift: ShiftData | undefined, mode: DailyStaffSortMode): number => {
  if (getEarliestAssignedWorkRange(shift)) return 0;
  if (!staff.isSubmitted) return 3;
  return hasWorkRequest(shift, mode) ? 1 : 2;
};

export const sortDailyStaffs = ({ staffs, shiftByStaffId, mode }: SortDailyStaffsParams): StaffType[] =>
  [...staffs].sort((a, b) => {
    const aShift = shiftByStaffId?.get(a.id);
    const bShift = shiftByStaffId?.get(b.id);
    const aGroup = getDailyGroup(a, aShift, mode);
    const bGroup = getDailyGroup(b, bShift, mode);

    if (aGroup !== bGroup) return aGroup - bGroup;

    // 勤務は勤務の時刻、希望は希望の時刻で、開始と終了が早い順にする。日付選択は時刻を持たないため比べない。
    if (mode !== "dateOnly") {
      const byTime =
        aGroup === 0
          ? compareRanges(getEarliestAssignedWorkRange(aShift), getEarliestAssignedWorkRange(bShift))
          : aGroup === 1
            ? compareRanges(getEarliestRequestRange(aShift), getEarliestRequestRange(bShift))
            : 0;
      if (byTime !== 0) return byTime;
    }

    return compareDefaultStaffOrder(a, b);
  });

// 日付ごとに、その日のシフトをもとに日別ビューと同じ「早い順」でスタッフを並べ替える。
// 一覧タブ（人×時間／人×勤務パターン）で日別ビューと並びを揃えるために使う。
export const sortDailyStaffsByDate = ({
  staffs,
  shifts,
  mode,
}: {
  staffs: StaffType[];
  shifts: readonly ShiftData[];
  mode: DailyStaffSortMode;
}): Map<string, StaffType[]> => {
  const shiftsByDate = new Map<string, ShiftData[]>();
  for (const shift of shifts) {
    const list = shiftsByDate.get(shift.date);
    if (list) list.push(shift);
    else shiftsByDate.set(shift.date, [shift]);
  }

  const sortedByDate = new Map<string, StaffType[]>();
  for (const [date, dateShifts] of shiftsByDate) {
    sortedByDate.set(date, sortDailyStaffs({ staffs, shiftByStaffId: indexShiftsByStaffId(dateShifts), mode }));
  }
  return sortedByDate;
};

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
