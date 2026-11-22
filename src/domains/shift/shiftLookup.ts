import type { ShiftData } from "./types";

export const indexShiftsByStaffId = (shifts: readonly ShiftData[]): Map<string, ShiftData> => {
  const map = new Map<string, ShiftData>();
  for (const shift of shifts) {
    if (!map.has(shift.staffId)) {
      map.set(shift.staffId, shift);
    }
  }
  return map;
};

export const indexShiftsByStaffIdForDate = (
  shifts: readonly ShiftData[],
  selectedDate: string,
): Map<string, ShiftData> => {
  const map = new Map<string, ShiftData>();
  for (const shift of shifts) {
    if (shift.date === selectedDate && !map.has(shift.staffId)) {
      map.set(shift.staffId, shift);
    }
  }
  return map;
};

/** 勤務を日付ごとにまとめる。日付の並びと、日の中の並びは、渡した配列の順になる。 */
export const groupShiftsByDate = (shifts: readonly ShiftData[]): Map<string, ShiftData[]> => {
  const map = new Map<string, ShiftData[]>();
  for (const shift of shifts) {
    const dateShifts = map.get(shift.date);
    if (dateShifts) dateShifts.push(shift);
    else map.set(shift.date, [shift]);
  }
  return map;
};
