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
